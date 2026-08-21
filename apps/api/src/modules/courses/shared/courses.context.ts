import type { RoutePluginOptions } from "../../../lib/route-plugin.ts";
import {
  createAuthMiddleware,
  type AuthMiddleware,
} from "../../../middlewares/auth.middleware.ts";
import { CREATOR_ROLE, INSTRUCTOR_ROLE } from "../../auth/auth.constants.ts";

export interface CoursesContext {
  middleware: AuthMiddleware;
  /** Course authoring is restricted to the creator and instructor roles. */
  requireCourseAuthor: AuthMiddleware["authenticate"][];
  /** General authenticated access for any logged-in role. */
  requireAuthenticated: AuthMiddleware["authenticate"][];
}

export function createCoursesContext({
  database,
}: RoutePluginOptions): CoursesContext {
  const middleware = createAuthMiddleware(database);

  const requireAuthenticated = [
    middleware.authenticate,
    middleware.requireAuthenticated,
  ];

  const requireCourseAuthor = [
    middleware.authenticate,
    middleware.requireAuthenticated,
    middleware.requireRoles([CREATOR_ROLE, INSTRUCTOR_ROLE]),
  ];

  return {
    middleware,
    requireCourseAuthor,
    requireAuthenticated,
  };
}
