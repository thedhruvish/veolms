import crypto from "node:crypto";

import {
  academyRequestSchema,
  academyResponseSchema,
  authMessageResponseSchema,
  creatorRegisterRequestSchema,
  loginResponseSchema,
  setupTokenRequestSchema,
} from "@veolms/contracts";
import type { FastifyRequest } from "fastify";
import { z } from "zod";

import { config } from "../../config.ts";
import { AppError, errorResponse } from "../../lib/errors.ts";
import { jsonResponse } from "../../lib/responses.ts";
import type { RoutePlugin } from "../../lib/route-plugin.ts";
import {
  SETUP_COOKIE,
  SETUP_SESSION_TTL_MS,
} from "./auth.constants.ts";
import { createAuthContext } from "./auth.context.ts";
import {
  clearSetupCookie,
  setSessionCookie,
  setSetupCookie,
} from "./auth.cookies.ts";
import { presentLogin } from "./auth.presenters.ts";
import * as repository from "./auth.repository.ts";

// Internal signed-cookie payload, not published API surface — see the note on
// `oauthStateCookieSchema` in oauth.provider.ts.
const setupSessionSchema = z.object({ exp: z.number() });

/**
 * Constant-time comparison of the submitted setup token.
 *
 * Both sides are compared as byte buffers. Guarding on `String.length` instead
 * compares UTF-16 code units while `timingSafeEqual` requires equal *byte*
 * length, so a same-character-count token containing any multi-byte character
 * would make it throw and surface as a 500 rather than a 401.
 */
function isValidSetupToken(submitted: string): boolean {
  const submittedBytes = Buffer.from(submitted, "utf8");
  const expectedBytes = Buffer.from(config.SETUP_TOKEN, "utf8");

  if (submittedBytes.length !== expectedBytes.length) {
    return false;
  }

  return crypto.timingSafeEqual(submittedBytes, expectedBytes);
}

const setupRoutes: RoutePlugin = async (app, options) => {
  const { service } = createAuthContext(options);
  const { database } = options;

  /** Setup endpoints are permanently closed once the platform is locked. */
  async function assertSetupOpen(): Promise<void> {
    const academy = await repository.findAcademy(database);

    if (academy?.setup_completed) {
      throw new AppError(
        403,
        "SETUP_ALREADY_COMPLETED",
        "The platform setup has already been finalized and locked.",
      );
    }
  }

  function assertValidSetupSession(request: FastifyRequest): void {
    const cookie = request.cookies[SETUP_COOKIE];

    if (!cookie) {
      throw new AppError(
        401,
        "SETUP_TOKEN_REQUIRED",
        "A valid setup session is required for this action.",
      );
    }

    const unsigned = request.unsignCookie(cookie);
    if (!unsigned.valid || !unsigned.value) {
      throw new AppError(
        401,
        "SETUP_TOKEN_REQUIRED",
        "Setup session is invalid. Please re-verify the setup token.",
      );
    }

    let payload: unknown;
    try {
      payload = JSON.parse(unsigned.value);
    } catch {
      throw new AppError(
        401,
        "SETUP_TOKEN_REQUIRED",
        "Setup session is invalid. Please re-verify the setup token.",
      );
    }

    const parsed = setupSessionSchema.safeParse(payload);
    if (!parsed.success || parsed.data.exp < Date.now()) {
      throw new AppError(
        401,
        "SETUP_TOKEN_REQUIRED",
        "Setup session is missing or expired. Please re-verify the setup token.",
      );
    }
  }

  app.post(
    "/auth/verify-token",
    {
      schema: {
        operationId: "verifySetupToken",
        tags: ["Auth"],
        summary: "Verify setup token",
        description:
          "Checks if the provided token matches the installation setup token.",
        body: setupTokenRequestSchema,
        response: {
          200: jsonResponse(
            "Token verified successfully.",
            authMessageResponseSchema,
          ),
          401: errorResponse("Invalid setup token."),
          403: errorResponse("Setup already completed."),
        },
      },
    },
    async (request, reply) => {
      await assertSetupOpen();

      if (!isValidSetupToken(request.body.token)) {
        throw new AppError(
          401,
          "INVALID_SETUP_TOKEN",
          "The setup token provided is incorrect.",
        );
      }

      setSetupCookie(reply, Date.now() + SETUP_SESSION_TTL_MS);
      return { message: "Setup token verified successfully." };
    },
  );

  app.post(
    "/auth/creator/register",
    {
      schema: {
        operationId: "registerCreator",
        tags: ["Auth"],
        summary: "Specialized Creator onboarding",
        description:
          "Registers the first user on the platform as Creator. Disallowed if accounts exist.",
        body: creatorRegisterRequestSchema,
        response: {
          201: jsonResponse(
            "Creator initialized successfully.",
            loginResponseSchema,
          ),
          401: errorResponse("Setup session missing or expired."),
          403: errorResponse("Creator already initialized."),
        },
      },
    },
    async (request, reply) => {
      await assertSetupOpen();
      assertValidSetupSession(request);

      const { name, email, phoneNo } = request.body;

      if (await repository.countUsers(database)) {
        throw new AppError(
          403,
          "CREATOR_EXISTS",
          "LMS platform has already been initialized. Creator account exists.",
        );
      }

      const username = await service.generateUniqueUsername(
        email.split("@")[0] || "creator",
      );

      // `createUser` grants the creator role to the first account under an
      // advisory lock, so two concurrent calls cannot both become owner.
      const userId = await service.createUser({
        email,
        phoneNo: phoneNo || null,
        username,
        displayName: name,
        emailVerified: true,
      });

      const user = await service.requireUser(userId);
      const session = await service.establishSession(user, {
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      setSessionCookie(reply, session.token);
      reply.code(201);
      return presentLogin(user, session.mfa);
    },
  );

  app.post(
    "/auth/academy",
    {
      schema: {
        operationId: "setupAcademy",
        tags: ["Auth"],
        summary: "Configure academy brand details",
        description:
          "Saves the academy brand configuration during platform setup.",
        body: academyRequestSchema,
        response: {
          200: jsonResponse(
            "Academy brand saved successfully.",
            academyResponseSchema,
          ),
          401: errorResponse("Setup session missing or expired."),
          403: errorResponse("Setup already completed."),
        },
      },
    },
    async (request) => {
      await assertSetupOpen();
      assertValidSetupSession(request);

      const { name, logoUrl, customDomain } = request.body;
      const existing = await repository.findAcademy(database);
      const academyId = existing?.id || crypto.randomUUID();

      await repository.upsertAcademy(database, {
        id: academyId,
        name,
        logoUrl: logoUrl || null,
        customDomain: customDomain || null,
        exists: Boolean(existing),
      });

      return {
        id: academyId,
        name,
        logoUrl: logoUrl || null,
        customDomain: customDomain || null,
        setupCompleted: false,
      };
    },
  );

  app.post(
    "/auth/setup/finish",
    {
      schema: {
        operationId: "finalizeSetup",
        tags: ["Auth"],
        summary: "Finalize platform setup",
        description: "Locks the platform setup, completing installation.",
        response: {
          200: jsonResponse(
            "Setup finalized successfully.",
            authMessageResponseSchema,
          ),
          400: errorResponse("Academy configuration or creator missing."),
          401: errorResponse("Setup session missing or expired."),
          403: errorResponse("Setup already completed."),
        },
      },
    },
    async (request, reply) => {
      await assertSetupOpen();
      assertValidSetupSession(request);

      const academy = await repository.findAcademy(database);
      if (!academy) {
        throw new AppError(
          400,
          "ACADEMY_NOT_CONFIGURED",
          "Configure academy details first.",
        );
      }

      // Finalising is irreversible and closes every setup endpoint. Without an
      // owner the platform would be permanently locked with no way back in.
      if (!(await repository.countUsers(database))) {
        throw new AppError(
          400,
          "CREATOR_NOT_REGISTERED",
          "Register the creator account before finalizing setup.",
        );
      }

      await repository.markSetupCompleted(database, academy.id);
      clearSetupCookie(reply);

      return { message: "Academy setup finalized successfully." };
    },
  );
};

export default setupRoutes;
