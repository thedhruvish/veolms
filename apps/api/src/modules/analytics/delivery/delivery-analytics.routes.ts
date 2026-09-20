import {
  dataDeliveryQuerySchema,
  dataDeliveryResponseSchema,
} from "@veolms/contracts";
import { config } from "../../../config.ts";
import { jsonResponse } from "../../../lib/responses.ts";
import { errorResponse } from "../../../lib/errors.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";
import { createAuthMiddleware } from "../../../middlewares/auth.middleware.ts";
import { createSessionService } from "../../auth/session/session.service.ts";
import { createDeliveryAnalyticsProvider } from "./delivery-analytics.provider.ts";
import { createDeliveryAnalyticsController } from "./delivery-analytics.controller.ts";
import { createDeliveryAnalyticsService } from "./delivery-analytics.service.ts";
import { ANALYTICS_ALLOWED_ROLES } from "../analytics.shared.ts";

const deliveryAnalyticsRoutes: RoutePlugin = async (app, options) => {
  const sessionService = createSessionService({ database: options.database });
  const middleware = createAuthMiddleware(sessionService);

  // Derive worker name from config or CDN_URL
  let workerName = config.CLOUDFLARE_WORKER_NAME;
  if (!workerName && config.CDN_URL) {
    try {
      const parsed = new URL(config.CDN_URL);
      const hostPart = parsed.hostname.split(".")[0];
      if (hostPart && hostPart !== "cdn" && hostPart !== "localhost") {
        workerName = hostPart;
      }
    } catch {
      // Keep undefined
    }
  }

  const deliveryProvider = createDeliveryAnalyticsProvider({
    apiToken: config.CLOUDFLARE_API_TOKEN,
    accountId: config.CLOUDFLARE_ACCOUNT_ID,
    workerName,
    endpoint: config.CLOUDFLARE_GRAPHQL_ENDPOINT,
    logger: app.log,
  });

  const service = createDeliveryAnalyticsService({
    database: options.database,
    deliveryProvider,
    logger: app.log,
    workerName,
  });

  const controller = createDeliveryAnalyticsController({ service });

  app.get(
    "/analytics/data-delivery",
    {
      schema: {
        operationId: "getDataDeliveryAnalytics",
        tags: ["Data Delivery Analytics"],
        summary: "Get CDN and data delivery analytics, origin egress, and bandwidth metrics",
        description:
          "Returns data delivery bandwidth, video streaming metrics, cache hit ratios, device breakdowns, regional delivery, and actionable delivery insights.",
        querystring: dataDeliveryQuerySchema,
        response: {
          200: jsonResponse(
            "Data delivery analytics metrics, bandwidth breakdown, and trends.",
            dataDeliveryResponseSchema,
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
    controller.getDeliveryAnalytics,
  );
};

export default deliveryAnalyticsRoutes;
