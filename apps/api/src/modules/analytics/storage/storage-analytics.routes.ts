import {
  storageAnalyticsQuerySchema,
  storageAnalyticsResponseSchema,
} from "@veolms/contracts";
import { config } from "../../../config.ts";
import { jsonResponse } from "../../../lib/responses.ts";
import { errorResponse } from "../../../lib/errors.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";
import { createAuthMiddleware } from "../../../middlewares/auth.middleware.ts";
import { createSessionService } from "../../auth/session/session.service.ts";
import { createCloudflareAnalyticsProvider } from "./cloudflare-analytics.provider.ts";
import { createStorageAnalyticsController } from "./storage-analytics.controller.ts";
import { createStorageAnalyticsService } from "./storage-analytics.service.ts";
import { ANALYTICS_ALLOWED_ROLES } from "../analytics.shared.ts";

const storageAnalyticsRoutes: RoutePlugin = async (app, options) => {
  const sessionService = createSessionService({ database: options.database });
  const middleware = createAuthMiddleware(sessionService);

  const cloudflareProvider = createCloudflareAnalyticsProvider({
    apiToken: config.CLOUDFLARE_API_TOKEN,
    accountId: config.CLOUDFLARE_ACCOUNT_ID,
    bucketName: config.CLOUDFLARE_R2_BUCKET_NAME || config.STORAGE_BUCKET,
    endpoint: config.CLOUDFLARE_GRAPHQL_ENDPOINT,
    logger: app.log,
  });

  const service = createStorageAnalyticsService({
    database: options.database,
    cloudflareProvider,
    logger: app.log,
  });

  const controller = createStorageAnalyticsController({ service });

  app.get(
    "/analytics/storage",
    {
      schema: {
        operationId: "getStorageAnalytics",
        tags: ["Storage Analytics"],
        summary: "Get storage analytics, utilization, and media footprint",
        description:
          "Returns storage utilization, media distribution, Cloudflare R2 metrics, course storage breakdown, and asset footprint.",
        querystring: storageAnalyticsQuerySchema,
        response: {
          200: jsonResponse(
            "Storage analytics metrics and breakdown.",
            storageAnalyticsResponseSchema,
          ),
          401: errorResponse("Authentication required."),
          403: errorResponse("Forbidden. Requires admin or analytics privileges."),
        },
      },
      preHandler: [
        middleware.authenticate,
        middleware.requireAuthenticated,
        middleware.requireMfaVerified,
        middleware.requireRoles([...ANALYTICS_ALLOWED_ROLES]),
      ],
    },
    controller.getStorageAnalytics,
  );
};

export default storageAnalyticsRoutes;
