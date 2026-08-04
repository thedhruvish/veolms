import fastifySwagger, { type SwaggerTransformObject } from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import type { FastifyInstance } from "fastify";
import {
  jsonSchemaTransform,
  jsonSchemaTransformObject,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import type { OpenAPIV3_1 } from "openapi-types";

import { config } from "./config.ts";

export const DOCS_ROUTE_PREFIX = "/api/docs";

const OPENAPI_TAGS = [
  {
    name: "Health",
    description: "Liveness probing for deployments and uptime checks.",
  },
  {
    name: "Courses",
    description: "Read-only access to the published course catalogue.",
  },
];

/**
 * `API_HOST` is a bind address; `0.0.0.0` and `::` are not addresses a docs
 * reader can call, so document a loopback URL for those.
 */
function documentedServerUrl(): string {
  const unspecified = ["0.0.0.0", "::", "::0"];
  const host = unspecified.includes(config.API_HOST)
    ? "127.0.0.1"
    : config.API_HOST;
  const authority = host.includes(":") ? `[${host}]` : host;

  return `http://${authority}:${config.API_PORT}`;
}

/**
 * `jsonSchemaTransformObject` publishes an input *and* an output variant of
 * every schema in `z.globalRegistry` (`Foo` plus `FooInput`), so a contract used
 * in only one direction still emits a component nothing points at. Drop the
 * components the document never references, following `$ref`s transitively so
 * nested contracts survive.
 */
function pruneUnreferencedComponents(
  document: OpenAPIV3_1.Document,
): OpenAPIV3_1.Document {
  const schemas = document.components?.schemas;

  if (!schemas) {
    return document;
  }

  const referenced = new Set<string>();
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item);
      }

      return;
    }

    if (typeof node !== "object" || node === null) {
      return;
    }

    for (const [key, value] of Object.entries(node)) {
      const name =
        key === "$ref" && typeof value === "string"
          ? value.replace(/^#\/components\/schemas\//u, "")
          : undefined;

      if (name !== undefined && name !== value) {
        if (!referenced.has(name)) {
          referenced.add(name);
          visit(schemas[name]);
        }

        continue;
      }

      visit(value);
    }
  };

  visit(document.paths);

  return {
    ...document,
    components: {
      ...document.components,
      schemas: Object.fromEntries(
        Object.entries(schemas).filter(([name]) => referenced.has(name)),
      ),
    },
  };
}

const transformObject: SwaggerTransformObject = (documentObject) =>
  pruneUnreferencedComponents(
    jsonSchemaTransformObject(documentObject) as OpenAPIV3_1.Document,
  );

/**
 * Wires OpenAPI generation onto the root instance.
 *
 * Must be awaited *before* any route is registered: `@fastify/swagger` discovers
 * routes through an `onRoute` hook, and `app.register()` only runs during boot,
 * so routes added while this registration is still queued are invisible to it —
 * which yields a silently empty document rather than an error.
 */
export async function registerOpenApi(app: FastifyInstance): Promise<void> {
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(fastifySwagger, {
    openapi: {
      openapi: "3.1.0",
      info: {
        title: "VEOLMS API",
        description:
          "Backend API for VEOLMS. Every route declares its schemas with Zod, " +
          "so this document is generated from the code that actually runs.",
        version: "1.0.0",
      },
      servers: [
        { url: documentedServerUrl(), description: "Local development server" },
      ],
      tags: OPENAPI_TAGS,
    },
    transform: jsonSchemaTransform,
    transformObject,
  });

  if (!config.API_DOCS_ENABLED) {
    app.log.info("API_DOCS_ENABLED=false; not serving Swagger UI");

    return;
  }

  await app.register(fastifySwaggerUi, {
    routePrefix: DOCS_ROUTE_PREFIX,
    uiConfig: {
      docExpansion: "list",
      deepLinking: true,
      displayRequestDuration: true,
      tryItOutEnabled: true,
    },
    staticCSP: true,
  });
}
