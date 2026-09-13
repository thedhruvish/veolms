import { z } from "zod";
import {
  presignMediaRequestSchema,
  presignMediaResponseSchema,
  mediaAssetStatusSchema,
  videoJobProgressResponseSchema,
  videoPlaybackBootstrapSchema,
} from "@veolms/contracts";

import { errorResponse } from "../../lib/errors.ts";
import { jsonResponse } from "../../lib/responses.ts";
import type { RoutePlugin } from "../../lib/route-plugin.ts";
import { createAuthMiddleware } from "../../middlewares/auth.middleware.ts";
import { createSessionService } from "../auth/index.ts";

import { config } from "../../config.ts";
import { createMediaController } from "./media.controller.ts";
import { createMediaService } from "./media.service.ts";

const mediaRoutes: RoutePlugin = async (app, options) => {
  const sessionService = createSessionService({ database: options.database });
  const authMiddleware = createAuthMiddleware(sessionService);
  const requireAuthenticated = [
    authMiddleware.authenticate,
    authMiddleware.requireAuthenticated,
    authMiddleware.requireMfaVerified,
  ];

  const service = createMediaService({
    database: options.database,
    services: options.services,
    streamingUrl: config.STREAMING_URL,
  });
  const controller = createMediaController({ service });

  app.get(
    "/courses/:idOrSlug/lessons/:lessonNumber/playback-bootstrap",
    {
      schema: {
        operationId: "getVideoPlaybackBootstrap",
        tags: ["Media"],
        summary: "Resolve an authorized lesson video playback bootstrap",
        description:
          "Returns the minimum HLS startup data after applying the existing session and course-access rules. Protected stream URLs are never embedded in static HTML.",
        params: z.object({
          idOrSlug: z.string().min(1).max(160),
          lessonNumber: z.coerce.number().int().positive(),
        }),
        response: {
          200: jsonResponse(
            "Authorized video playback bootstrap",
            videoPlaybackBootstrapSchema,
          ),
          401: errorResponse("Authentication required"),
          403: errorResponse("Course access denied"),
          404: errorResponse("Lesson or media not found"),
          409: errorResponse("Video is not ready for playback"),
        },
      },
      preHandler: [
        authMiddleware.authenticate,
        authMiddleware.requireMfaVerifiedIfAuthenticated,
      ],
    },
    controller.getPlaybackBootstrap,
  );

  app.post(
    "/media/presign",
    {
      schema: {
        operationId: "presignMediaUpload",
        tags: ["Media"],
        summary: "Obtain pre-signed upload URL for files",
        body: presignMediaRequestSchema,
        response: {
          200: jsonResponse(
            "Pre-signed upload response",
            presignMediaResponseSchema,
          ),
        },
      },
      preHandler: requireAuthenticated,
    },
    controller.presignMediaUpload,
  );

  app.post(
    "/media/:mediaId/upload-complete",
    {
      schema: {
        operationId: "confirmMediaUpload",
        tags: ["Media"],
        summary: "Confirm that a media asset upload is complete",
        params: z.object({ mediaId: z.uuid() }),
        response: {
          200: jsonResponse(
            "Upload confirmed",
            z.object({ status: mediaAssetStatusSchema }),
          ),
          400: errorResponse("File not found or size mismatch"),
          404: errorResponse("Media not found"),
        },
      },
      preHandler: requireAuthenticated,
    },
    controller.confirmMediaUpload,
  );

  app.get(
    "/media/:mediaId/progress",
    {
      schema: {
        operationId: "getVideoJobProgress",
        tags: ["Media"],
        summary: "Poll transcoding progress for a media asset",
        params: z.object({ mediaId: z.uuid() }),
        response: {
          200: jsonResponse(
            "Polling progress response",
            videoJobProgressResponseSchema,
          ),
          404: errorResponse("Media or job not found"),
        },
      },
      preHandler: requireAuthenticated,
    },
    controller.getVideoJobProgress,
  );

  app.post(
    "/media/:mediaId/transcode/retry",
    {
      preHandler: requireAuthenticated,
      schema: { params: z.object({ mediaId: z.uuid() }) },
    },
    controller.retryVideoJob,
  );

  app.post(
    "/media/:mediaId/transcode/cancel",
    {
      preHandler: requireAuthenticated,
      schema: { params: z.object({ mediaId: z.uuid() }) },
    },
    controller.cancelVideoJob,
  );

  app.get(
    "/media/:mediaId/progress/stream",
    {
      preHandler: requireAuthenticated,
      schema: { params: z.object({ mediaId: z.uuid() }) },
    },
    controller.streamVideoJobProgress,
  );

  let customPrefix: string | undefined;
  const streamingUrl = config.STREAMING_URL?.trim();
  if (streamingUrl?.startsWith("/")) {
    const cleanPrefix = streamingUrl.replace(/\/+$/, "");
    if (cleanPrefix !== "/media") {
      customPrefix = cleanPrefix;
    }
  } else if (streamingUrl && /^https?:\/\//i.test(streamingUrl)) {
    try {
      const parsed = new URL(streamingUrl);
      const pathname = parsed.pathname.replace(/\/+$/, "");
      if (pathname && pathname !== "/media") {
        const last = pathname.split("/").filter(Boolean).pop();
        if (last && last !== "media") {
          customPrefix = `/${last}`;
        }
      }
    } catch {}
  }

  const hlsRouteOptions = {
    schema: {
      operationId: "streamProtectedHlsResource",
      tags: ["Media"],
      summary: "Stream an authorized HLS playlist or segment",
      params: z.object({
        mediaId: z.string().uuid(),
        "*": z.string().min(1),
      }),
      response: {
        401: errorResponse("Authentication required"),
        403: errorResponse("Course access denied"),
        404: errorResponse("HLS resource not found"),
        409: errorResponse("Video is not ready for playback"),
      },
    },
    preHandler: [
      authMiddleware.authenticate,
      authMiddleware.requireMfaVerifiedIfAuthenticated,
    ],
  };

  app.get(
    "/media/:mediaId/hls/*",
    hlsRouteOptions,
    controller.streamHlsResource,
  );

  if (customPrefix) {
    app.get(
      `${customPrefix}/:mediaId/hls/*`,
      {
        ...hlsRouteOptions,
        schema: {
          ...hlsRouteOptions.schema,
          operationId: `streamProtectedHlsResource_${customPrefix.replace(/[^a-zA-Z0-9]/g, "")}`,
        },
      },
      controller.streamHlsResource,
    );
  }

  const mediaAssetStreamRouteOptions = {
    schema: {
      operationId: "getMediaAssetStream",
      tags: ["Media"],
      summary: "Stream media file content by media ID",
      params: z.object({ mediaId: z.string().uuid() }),
      response: {
        404: errorResponse("Media or file not found"),
      },
    },
    // Not requireAuthenticated: published-course thumbnails/trailers must
    // stay servable to anonymous visitors on public marketing pages.
    // `authenticate` alone populates request.user when a session cookie
    // is present, without rejecting anonymous requests — the service
    // layer then enforces ownership for anything non-public.
    preHandler: [authMiddleware.authenticate],
  };

  app.get(
    "/media/:mediaId",
    mediaAssetStreamRouteOptions,
    controller.getMediaAssetStream,
  );

  if (customPrefix) {
    app.get(
      `${customPrefix}/:mediaId`,
      {
        ...mediaAssetStreamRouteOptions,
        schema: {
          ...mediaAssetStreamRouteOptions.schema,
          operationId: `getMediaAssetStream_${customPrefix.replace(/[^a-zA-Z0-9]/g, "")}`,
        },
      },
      controller.getMediaAssetStream,
    );
  }

  const directStorageStreamRouteOptions = {
    schema: {
      operationId: "streamDirectStorageResource",
      tags: ["Media"],
      summary: "Stream an HLS or media resource directly by path",
      params: z.object({
        "*": z.string().min(1),
      }),
      response: {
        401: errorResponse("Authentication required"),
        403: errorResponse("Course access denied"),
        404: errorResponse("Resource not found"),
      },
    },
    preHandler: [
      authMiddleware.authenticate,
      authMiddleware.requireMfaVerifiedIfAuthenticated,
    ],
  };

  app.get(
    "/media/*",
    directStorageStreamRouteOptions,
    controller.streamDirectStorageResource,
  );

  if (customPrefix) {
    app.get(
      `${customPrefix}/*`,
      {
        ...directStorageStreamRouteOptions,
        schema: {
          ...directStorageStreamRouteOptions.schema,
          operationId: `streamDirectStorageResource_${customPrefix.replace(/[^a-zA-Z0-9]/g, "")}`,
        },
      },
      controller.streamDirectStorageResource,
    );
  }
};

export default mediaRoutes;
