import { z } from "zod";
import {
  presignMediaRequestSchema,
  presignMediaResponseSchema,
  mediaAssetStatusSchema,
  videoJobProgressResponseSchema,
} from "@veolms/contracts";

import { errorResponse } from "../../../lib/errors.ts";
import { jsonResponse } from "../../../lib/responses.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";

import { createCoursesContext } from "../shared/courses.context.ts";
import { createMediaController } from "./media.controller.ts";
import { createMediaService } from "./media.service.ts";

const mediaRoutes: RoutePlugin = async (app, options) => {
  const ctx = createCoursesContext(options);
  const service = createMediaService({
    database: options.database,
    services: options.services,
  });
  const controller = createMediaController({ service });

  app.post(
    "/media/presign",
    {
      schema: {
        operationId: "presignMediaUpload",
        tags: ["Course Media"],
        summary: "Obtain pre-signed upload URL for files",
        body: presignMediaRequestSchema,
        response: {
          200: jsonResponse(
            "Pre-signed upload response",
            presignMediaResponseSchema,
          ),
        },
      },
      preHandler: ctx.requireCourseAuthor,
    },
    controller.presignMediaUpload,
  );

  app.post(
    "/media/:mediaId/upload-complete",
    {
      schema: {
        operationId: "confirmMediaUpload",
        tags: ["Course Media"],
        summary: "Confirm that a media asset upload is complete",
        params: z.object({ mediaId: z.string().uuid() }),
        response: {
          200: jsonResponse(
            "Upload confirmed",
            z.object({ success: z.boolean(), status: mediaAssetStatusSchema }),
          ),
        },
      },
      preHandler: ctx.requireCourseAuthor,
    },
    controller.confirmMediaUpload,
  );

  app.get(
    "/courses/:id/videos/:videoId/progress",
    {
      schema: {
        operationId: "getVideoJobProgress",
        tags: ["Course Media"],
        summary: "Poll transcoding progress for a media asset",
        params: z.object({ id: z.string().uuid(), videoId: z.string().uuid() }),
        response: {
          200: jsonResponse(
            "Polling progress response",
            videoJobProgressResponseSchema,
          ),
          404: errorResponse("Job not found"),
        },
      },
      preHandler: ctx.requireCourseAuthor,
    },
    controller.getVideoJobProgress,
  );
};

export default mediaRoutes;
