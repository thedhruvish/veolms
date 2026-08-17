import { config } from "../../config.ts";
import type { RoutePluginOptions } from "../../lib/route-plugin.ts";
import {
  createAuthMiddleware,
  type AuthMiddleware,
} from "../../middlewares/auth.middleware.ts";
import { createAuthService, type AuthService } from "./auth.service.ts";

export interface AuthContext {
  middleware: AuthMiddleware;
  service: AuthService;
  /** Requires a valid session, without asserting MFA step-up. */
  authenticated: AuthMiddleware["authenticate"][];
  /** Requires a valid session that has cleared MFA where the account has it. */
  mfaVerified: AuthMiddleware["authenticate"][];
}

/**
 * Assembles the collaborators every auth route plugin needs.
 *
 * The `authenticated` / `mfaVerified` arrays exist so the preHandler chains are
 * declared once. Spelling them out per route is how a step in the chain gets
 * quietly omitted on one endpoint.
 */
export function createAuthContext({
  database,
  services,
}: RoutePluginOptions): AuthContext {
  const middleware = createAuthMiddleware(database);

  const service = createAuthService({
    database,
    services,
    academyName: config.RP_NAME,
  });

  const authenticated = [
    middleware.authenticate,
    middleware.requireAuthenticated,
  ];

  return {
    middleware,
    service,
    authenticated,
    mfaVerified: [...authenticated, middleware.requireMfaVerified],
  };
}
