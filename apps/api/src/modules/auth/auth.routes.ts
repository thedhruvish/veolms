import {
  authConfigResponseSchema,
  authMessageResponseSchema,
  loginRequestSchema,
  loginResponseSchema,
  otpSendRequestSchema,
  registerRequestSchema,
  userProfileResponseSchema,
} from "@veolms/contracts";

import { config } from "../../config.ts";
import { AppError, errorResponse } from "../../lib/errors.ts";
import { jsonResponse } from "../../lib/responses.ts";
import type { RoutePlugin } from "../../lib/route-plugin.ts";
import { createAuthContext } from "./auth.context.ts";
import { clearSessionCookie, setSessionCookie } from "./auth.cookies.ts";
import { presentLogin } from "./auth.presenters.ts";
import * as repository from "./auth.repository.ts";
import type { IdentifierType } from "./auth.repository.ts";

/**
 * Resolves which contact channel a request is operating on. The contracts
 * guarantee at least one of the two is present via a refinement, but that is
 * invisible to the inferred type, so it is narrowed once here.
 */
function resolveIdentifier(body: {
  email?: string | undefined;
  phoneNo?: string | undefined;
}): { identifier: string; identifierType: IdentifierType } {
  if (body.email) {
    return { identifier: body.email, identifierType: "email" };
  }

  if (body.phoneNo) {
    return { identifier: body.phoneNo, identifierType: "phone" };
  }

  throw new AppError(
    400,
    "INVALID_REQUEST",
    "Email or phone number is required.",
  );
}

const authRoutes: RoutePlugin = async (app, options) => {
  const { middleware, service, mfaVerified } = createAuthContext(options);
  const { database } = options;

  app.post(
    "/auth/otp/send",
    {
      schema: {
        operationId: "sendOtp",
        tags: ["Auth"],
        summary: "Send login/register OTP",
        description:
          "Dispatches a secure 6-digit verification code via email or SMS.",
        body: otpSendRequestSchema,
        response: {
          200: jsonResponse(
            "OTP dispatched successfully.",
            authMessageResponseSchema,
          ),
          400: errorResponse("Validation error or missing parameters."),
          429: errorResponse("Rate limit exceeded."),
        },
      },
    },
    async (request) => {
      const { identifier, identifierType } = resolveIdentifier(request.body);
      await service.sendOtp(identifier, identifierType);

      return { message: "Verification OTP sent successfully." };
    },
  );

  app.post(
    "/auth/login",
    {
      schema: {
        operationId: "loginUser",
        tags: ["Auth"],
        summary: "Log in with OTP",
        description: "Checks 6-digit OTP and logs in if user exists.",
        body: loginRequestSchema,
        response: {
          200: jsonResponse("Login successful.", loginResponseSchema),
          400: errorResponse("No user exists or code invalid."),
          401: errorResponse("Verification failed."),
        },
      },
    },
    async (request, reply) => {
      const { identifier, identifierType } = resolveIdentifier(request.body);

      // Checked before the code is consumed so a wrong-endpoint call does not
      // burn a valid OTP the caller would then have to wait out.
      const user = await repository.findUserByIdentifier(
        database,
        identifier,
        identifierType,
      );

      if (!user) {
        throw new AppError(
          400,
          "REGISTRATION_REQUIRED",
          "Account does not exist. Please register first.",
        );
      }

      await service.verifyAndConsumeOtp(
        identifier,
        identifierType,
        "login",
        request.body.code,
      );

      const session = await service.establishSession(user, {
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      setSessionCookie(reply, session.token);
      return presentLogin(user, session.mfa);
    },
  );

  app.post(
    "/auth/register",
    {
      schema: {
        operationId: "registerUser",
        tags: ["Auth"],
        summary: "Register a new user",
        description:
          "Registers a user and assigns role creator (if first user) or student.",
        body: registerRequestSchema,
        response: {
          201: jsonResponse("Registration successful.", loginResponseSchema),
          400: errorResponse(
            "Invalid code, username taken, or user already exists.",
          ),
        },
      },
    },
    async (request, reply) => {
      const { email, phoneNo, code, username, displayName } = request.body;
      const { identifier, identifierType } = resolveIdentifier(request.body);
      const purpose =
        identifierType === "email" ? "email_verification" : "phone_verification";

      const existing = await repository.findUserByIdentifier(
        database,
        identifier,
        identifierType,
      );

      if (existing) {
        throw new AppError(
          400,
          "USER_EXISTS",
          "An account with this email or phone number already exists.",
        );
      }

      if (await repository.usernameExists(database, username.toLowerCase())) {
        throw new AppError(400, "USERNAME_TAKEN", "Username is already taken.");
      }

      await service.verifyAndConsumeOtp(
        identifier,
        identifierType,
        purpose,
        code,
      );

      // Only the channel that was actually verified is persisted. Accepting the
      // unverified counterpart would let a caller attach someone else's phone
      // number to their own account, permanently blocking the real owner from
      // registering it (`users.phone_no` is unique) and turning it into a valid
      // login identifier for the attacker's account.
      const userId = await service.createUser({
        email: identifierType === "email" ? email ?? null : null,
        phoneNo: identifierType === "phone" ? phoneNo ?? null : null,
        username: username.toLowerCase(),
        displayName,
        emailVerified: identifierType === "email",
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

  app.get(
    "/auth/config",
    {
      schema: {
        operationId: "getAuthConfig",
        tags: ["Auth"],
        summary: "Get public auth configs",
        description: "Returns public OAuth Client IDs.",
        response: {
          200: jsonResponse(
            "OAuth Client IDs context.",
            authConfigResponseSchema,
          ),
        },
      },
    },
    async () => ({
      googleClientId: config.GOOGLE_CLIENT_ID || "",
      githubClientId: config.GITHUB_CLIENT_ID || "",
    }),
  );

  app.post(
    "/auth/logout",
    {
      schema: {
        operationId: "logout",
        tags: ["Auth"],
        summary: "Log out of session",
        description: "Invalidates the active session and clears cookies.",
        response: {
          200: jsonResponse("Logged out.", authMessageResponseSchema),
        },
      },
      // Deliberately only `authenticate`: logging out must succeed even from a
      // session that has not cleared MFA step-up.
      preHandler: [middleware.authenticate],
    },
    async (request, reply) => {
      if (request.session) {
        await repository.deleteSession(database, request.session.id);
      }

      clearSessionCookie(reply);
      return { message: "Logged out successfully" };
    },
  );

  app.get(
    "/auth/me",
    {
      schema: {
        operationId: "getCurrentUserProfile",
        tags: ["Auth"],
        summary: "Get current user profile",
        description:
          "Inspects and returns the active authenticated user profile details.",
        response: {
          200: jsonResponse("User context.", userProfileResponseSchema),
          401: errorResponse("Session missing or invalid."),
          403: errorResponse("MFA step-up required."),
        },
      },
      preHandler: mfaVerified,
    },
    async (request) => {
      const user = request.user!;

      return {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        email: user.email,
        phoneNo: user.phoneNo,
        roles: user.roles,
        permissions: user.permissions,
        mfaVerified: request.session!.mfa_verified,
        totpEnabled: user.totpEnabled,
        passkeyEnabled: user.passkeyEnabled,
      };
    },
  );
};

export default authRoutes;
