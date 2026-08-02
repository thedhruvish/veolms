import Fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
} from "fastify";
import type { Kysely } from "kysely";

import type { Database } from "@veolms/database";

import { registerCourseRoutes } from "./routes/courses.ts";
import { registerHealthRoute } from "./routes/health.ts";

interface CreateAppOptions {
  database: Kysely<Database>;
  logger?: FastifyServerOptions["logger"];
}

export function createApp({
  database,
  logger = true,
}: CreateAppOptions): FastifyInstance {
  const app = Fastify({ logger });

  registerHealthRoute(app);
  registerCourseRoutes(app, database);

  return app;
}
