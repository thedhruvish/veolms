import {
  authMessageResponseSchema,
  sessionParamsSchema,
  sessionResponseSchema,
} from "@veolms/contracts";
import { z } from "zod";

import { errorResponse } from "../../lib/errors.ts";
import { jsonResponse } from "../../lib/responses.ts";
import type { RoutePlugin } from "../../lib/route-plugin.ts";
import { createAuthContext } from "./auth.context.ts";
import * as repository from "./auth.repository.ts";

const sessionRoutes: RoutePlugin = async (app, options) => {
  const { mfaVerified } = createAuthContext(options);
  const { database } = options;

  app.get(
    "/auth/sessions",
    {
      schema: {
        operationId: "getActiveSessions",
        tags: ["Auth"],
        summary: "List active sessions",
        description: "Returns metadata for all active user sessions.",
        response: {
          200: jsonResponse(
            "List of active sessions.",
            z.array(sessionResponseSchema),
          ),
          401: errorResponse("Unauthorized."),
          403: errorResponse("MFA step-up required."),
        },
      },
      preHandler: mfaVerified,
    },
    async (request) => {
      const currentSessionId = request.session!.id;
      const sessions = await repository.listUserSessions(
        database,
        request.user!.id,
      );

      return sessions.map((session) => ({
        id: session.id,
        ipAddress: session.ip_address,
        userAgent: session.user_agent,
        isCurrent: session.id === currentSessionId,
        createdAt: session.created_at.toISOString(),
        lastUsedAt: session.last_used_at.toISOString(),
      }));
    },
  );

  app.delete(
    "/auth/sessions/:id",
    {
      schema: {
        operationId: "revokeSession",
        tags: ["Auth"],
        summary: "Revoke active session",
        description: "Invalidates a specific user session from the database.",
        params: sessionParamsSchema,
        response: {
          200: jsonResponse("Session revoked.", authMessageResponseSchema),
          401: errorResponse("Unauthorized."),
          403: errorResponse("MFA step-up required."),
        },
      },
      preHandler: mfaVerified,
    },
    async (request) => {
      // Scoped by user id in the query, so a known session UUID belonging to
      // someone else is a no-op rather than a cross-account revocation.
      await repository.deleteUserSession(
        database,
        request.user!.id,
        request.params.id,
      );

      return { message: "Session revoked" };
    },
  );

  app.post(
    "/auth/sessions/revoke-all",
    {
      schema: {
        operationId: "revokeAllOtherSessions",
        tags: ["Auth"],
        summary: "Revoke other active sessions",
        description:
          "Terminates all user sessions except the current active one.",
        response: {
          200: jsonResponse(
            "Other sessions successfully revoked.",
            authMessageResponseSchema,
          ),
          401: errorResponse("Unauthorized."),
          403: errorResponse("MFA step-up required."),
        },
      },
      preHandler: mfaVerified,
    },
    async (request) => {
      await repository.deleteOtherUserSessions(
        database,
        request.user!.id,
        request.session!.id,
      );

      return { message: "All other sessions revoked" };
    },
  );
};

export default sessionRoutes;
