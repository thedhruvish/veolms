import { z } from "zod";
import {
  courseAccessRuleSchema,
  updateCourseAccessRuleRequestSchema,
  coursePricingSchema,
  updateCoursePricingRequestSchema,
  courseSettingsSchema,
  updateCourseSettingsRequestSchema,
} from "@veolms/contracts";

import { jsonResponse } from "../../../lib/responses.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";

import { createCoursesContext } from "../shared/courses.context.ts";
import { createConfigurationController } from "./configuration.controller.ts";
import { createConfigurationService } from "./configuration.service.ts";

const configurationRoutes: RoutePlugin = async (app, options) => {
  const ctx = createCoursesContext(options);
  const service = createConfigurationService({
    database: options.database,
  });
  const controller = createConfigurationController({ service });

  app.put(
    "/courses/:id/access-rules",
    {
      schema: {
        operationId: "upsertCourseAccessRules",
        tags: ["Course Configuration"],
        summary: "Configure course visibility and durations",
        params: z.object({ id: z.string().uuid() }),
        body: updateCourseAccessRuleRequestSchema,
        response: {
          200: jsonResponse("Access rules updated", courseAccessRuleSchema),
        },
      },
      preHandler: ctx.requireCourseAuthor,
    },
    controller.upsertCourseAccessRules,
  );

  app.put(
    "/courses/:id/pricing",
    {
      schema: {
        operationId: "upsertCoursePricing",
        tags: ["Course Configuration"],
        summary: "Configure pricing tiers and currencies",
        params: z.object({ id: z.string().uuid() }),
        body: updateCoursePricingRequestSchema,
        response: {
          200: jsonResponse(
            "Pricing configuration updated",
            coursePricingSchema,
          ),
        },
      },
      preHandler: ctx.requireCourseAuthor,
    },
    controller.upsertCoursePricing,
  );

  app.put(
    "/courses/:id/settings",
    {
      schema: {
        operationId: "upsertCourseSettings",
        tags: ["Course Configuration"],
        summary: "Configure QA, certificates, and features",
        params: z.object({ id: z.string().uuid() }),
        body: updateCourseSettingsRequestSchema,
        response: {
          200: jsonResponse("Settings updated", courseSettingsSchema),
        },
      },
      preHandler: ctx.requireCourseAuthor,
    },
    controller.upsertCourseSettings,
  );
};

export default configurationRoutes;
