import { fileURLToPath } from "node:url";

import fastifyAutoload from "@fastify/autoload";
import type { Database } from "@veolms/database";
import Fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
} from "fastify";
import type { Kysely } from "kysely";
import fastifyCookie from "@fastify/cookie";
import fastifyCors from "@fastify/cors";

import { registerErrorHandler } from "./error-handler.ts";
import type { RoutePluginOptions } from "./lib/route-plugin.ts";
import { registerOpenApi } from "./openapi.ts";
import { config } from "./config.ts";

export const API_ROUTE_PREFIX = "/api/v1";

/**
 * Must stay above the longest path parameter any contract accepts (currently
 * `courseSlugSchema`, at 160). Fastify's default of 100 rejects longer values in
 * the router with a 414 that no route can document, which both hides valid slugs
 * and makes the documented 400 unreachable.
 */
const MAX_PARAM_LENGTH = 512;

interface CreateAppOptions {
  database: Kysely<Database>;
  logger?: FastifyServerOptions["logger"];
}

export async function createApp({
  database,
  logger = true,
}: CreateAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger,
    routerOptions: { maxParamLength: MAX_PARAM_LENGTH },
  });

  // Await this: it installs the Zod compilers and the route-discovery hook that
  // everything registered below depends on.
  await registerOpenApi(app);
  registerErrorHandler(app);

  app.addHook("preSerialization", async (request, reply, payload) => {
    if (request.url.startsWith("/api/docs")) {
      return payload;
    }

    if (
      payload &&
      typeof payload === "object" &&
      "success" in (payload as any)
    ) {
      return payload;
    }

    return {
      success: true,
      statusCode: reply.statusCode,
      data: payload,
    };
  });

  // Register cookie support for stateful sessions
  await app.register(fastifyCookie, {
    secret: config.SESSION_SECRET,
  });

  // Configure CORS
  await app.register(fastifyCors, {
    origin:
      config.NODE_ENV === "production"
        ? config.WEB_URL
        : "http://localhost:3000",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  });

  // Every module in src/routes is registered automatically, so adding a route
  // file is all it takes for the endpoint — and its OpenAPI entry — to exist.
  // Files whose name starts with `_` are skipped, for route-local helpers.
  await app.register(fastifyAutoload, {
    dir: fileURLToPath(new URL("./routes", import.meta.url)),
    dirNameRoutePrefix: false,
    ignorePattern: /(?:^|[\\/])_/u,
    options: {
      prefix: API_ROUTE_PREFIX,
      database,
    } satisfies RoutePluginOptions,
  });

  return app;
}
