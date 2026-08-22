import type { FastifyReply, FastifyRequest } from "fastify";
import { httpError } from "../lib/errors.ts";
import type { SessionService } from "../modules/auth/index.ts";

export interface AuthMiddleware {
  authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  requireAuthenticated: (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => Promise<void>;
  requireMfaVerified: (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => Promise<void>;
  requirePermission: (
    permission: string,
  ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
}

export function createAuthMiddleware(
  sessionService: SessionService,
): AuthMiddleware {
  function getMfaFailure(
    request: FastifyRequest,
  ): { code: "MFA_REQUIRED" | "MFA_SETUP_REQUIRED"; message: string } | null {
    if (!request.user || !request.session) return null;

    const hasFactor = request.user.totpEnabled || request.user.passkeyEnabled;
    if (request.user.mfaMandatory && !hasFactor) {
      return {
        code: "MFA_SETUP_REQUIRED",
        message:
          "Set up a passkey or authenticator app before using this resource.",
      };
    }

    if (
      (request.user.mfaMandatory || hasFactor) &&
      !request.session.mfa_verified
    ) {
      return {
        code: "MFA_REQUIRED",
        message:
          "Multi-factor authentication is required to access this resource.",
      };
    }

    return null;
  }

  async function authenticate(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    request.user = null;
    request.session = null;

    const sessionCookie = request.cookies["veolms-session"];
    if (!sessionCookie) {
      return;
    }

    const authenticated = await sessionService.authenticate(sessionCookie);
    if (!authenticated) return;

    request.user = authenticated.user;
    request.session = authenticated.session;
  }

  async function requireAuthenticated(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    if (!request.user || !request.session) {
      return reply
        .code(401)
        .send(httpError(401, "UNAUTHORIZED", "Authentication required"));
    }
  }

  /**
   * Enforces MFA step-up and enrollment for accounts with MFA enabled or required.
   * Must be used AFTER authenticate + requireAuthenticated in the preHandler chain.
   */
  async function requireMfaVerified(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    if (!request.user || !request.session) {
      return reply
        .code(401)
        .send(httpError(401, "UNAUTHORIZED", "Authentication required"));
    }

    const mfaFailure = getMfaFailure(request);
    if (mfaFailure) {
      return reply
        .code(403)
        .send(httpError(403, mfaFailure.code, mfaFailure.message));
    }
  }

  function requirePermission(permission: string) {
    return async (
      request: FastifyRequest,
      reply: FastifyReply,
    ): Promise<void> => {
      // 1. Ensure authenticated
      if (!request.user || !request.session) {
        return reply
          .code(401)
          .send(httpError(401, "UNAUTHORIZED", "Authentication required"));
      }

      // 2. Enforce MFA check for users who have MFA enabled or mandatory
      const mfaFailure = getMfaFailure(request);
      if (mfaFailure) {
        return reply
          .code(403)
          .send(httpError(403, mfaFailure.code, mfaFailure.message));
      }

      // 3. Verify user has capability permission
      if (!request.user.permissions.includes(permission)) {
        return reply.code(403).send(httpError(403, "FORBIDDEN", "Forbidden"));
      }
    };
  }

  return {
    authenticate,
    requireAuthenticated,
    requireMfaVerified,
    requirePermission,
  };
}
