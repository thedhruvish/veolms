import crypto from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import type { Kysely } from "kysely";
import type { Database, MediaAssetStatus } from "@veolms/database";
import type { PresignMediaRequest } from "@veolms/contracts";
import { AppError } from "../../../lib/errors.ts";
import type { AppServices } from "../../../services/index.ts";
import * as mediaRepo from "./media.repository.ts";
import { getCourseAndVerifyOwner as verifyCourseOwner } from "../shared/courses.utils.ts";

export interface MediaServiceOptions {
  database: Kysely<Database>;
  services: AppServices;
}

/** Postgres unique_violation (23505), as raised by the pg driver via node-postgres. */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "23505"
  );
}

export function createMediaService({ database, services }: MediaServiceOptions) {
  /**
   * Verifies that a media file is uploaded and exists, then sets status to 'uploaded'.
   * If it's a video, automatically queues and triggers transcoding.
   */
  async function confirmUpload(
    mediaId: string,
    creatorId: string,
    logger?: FastifyBaseLogger,
  ): Promise<{ status: MediaAssetStatus; jobId?: string | null }> {
    const media = await mediaRepo.findMediaAssetById(
      database,
      mediaId,
      creatorId,
    );

    if (!media) {
      throw new AppError(404, "MEDIA_NOT_FOUND", "Media asset not found.");
    }

    if (media.status !== "uploading") {
      let existingJobId: string | null = null;
      if (media.type === "video") {
        const job = await mediaRepo.findVideoJobByVideoId(database, mediaId);
        existingJobId = job ? job.id : null;
      }
      return { status: media.status, jobId: existingJobId };
    }

    const metadata = await services.storage.headObject(media.storage_key);

    if (!metadata) {
      throw new AppError(
        400,
        "FILE_NOT_FOUND",
        "File could not be found in storage.",
      );
    }

    if (
      metadata.contentLength !== undefined &&
      metadata.contentLength !== media.size_bytes
    ) {
      throw new AppError(
        400,
        "FILE_SIZE_MISMATCH",
        "Uploaded file size does not match presigned size.",
      );
    }

    await mediaRepo.updateMediaAssetStatus(database, mediaId, "uploaded");

    let jobId: string | null = null;
    // Once video is uploaded, automatically queue and dispatch it for processing
    if (media.type === "video" && logger) {
      const transcodeResult = await queueTranscodeJob(mediaId, creatorId, logger);
      jobId = transcodeResult.jobId;
    }

    return { status: "uploaded", jobId };
  }

  /**
   * Triggers transcoding job if not already ready or processing.
   * Always dispatches to the queue and triggers Lambda if configured.
   * If a job already exists and is active, it does not re-trigger.
   */
  async function queueTranscodeJob(
    mediaId: string,
    creatorId: string,
    logger: FastifyBaseLogger,
  ): Promise<{ should202: boolean; jobId: string | null }> {
    const media = await mediaRepo.findMediaAssetById(
      database,
      mediaId,
      creatorId,
    );

    if (!media) {
      throw new AppError(
        400,
        "INVALID_MEDIA",
        "Selected media asset is invalid or unauthorized.",
      );
    }

    if (media.type !== "video") {
      return { should202: false, jobId: null };
    }

    if (media.status !== "uploaded" && media.status !== "ready") {
      throw new AppError(
        400,
        "MEDIA_NOT_UPLOADED",
        "Video file must be uploaded and confirmed first.",
      );
    }

    const existingJob = await mediaRepo.findVideoJobByVideoId(
      database,
      media.id,
    );

    // If job already exists and is active or completed, don't trigger again
    if (existingJob) {
      if (existingJob.status === "queued" || existingJob.status === "processing") {
        logger.info(
          { jobId: existingJob.id, videoId: media.id, status: existingJob.status },
          "Video job already active. Skipping duplicate trigger.",
        );
        return { should202: true, jobId: existingJob.id };
      }

      if (existingJob.status === "completed") {
        logger.info(
          { jobId: existingJob.id, videoId: media.id },
          "Video job already completed. Skipping duplicate trigger.",
        );
        return { should202: false, jobId: existingJob.id };
      }
    }

    const jobId = crypto.randomUUID();
    const now = new Date();

    try {
      await mediaRepo.insertVideoJob(database, {
        id: jobId,
        video_id: media.id,
        input_path: media.storage_key,
        status: "queued",
        current_stage: "queued",
        progress: 0,
        quality: [360, 720, 1080],
        created_at: now,
      });
    } catch (insertErr) {
      // A concurrent call (client retry, or a racing lesson update) may have
      // won the insert first — `video_jobs_active_video_id_unique` rejects a
      // second active job for the same video. Treat that as "already queued"
      // instead of surfacing a 500.
      if (isUniqueViolation(insertErr)) {
        const raceWinner = await mediaRepo.findVideoJobByVideoId(
          database,
          media.id,
        );
        if (raceWinner) {
          logger.info(
            { jobId: raceWinner.id, videoId: media.id },
            "Lost the race to queue this video's transcode job. Reusing the concurrent job instead.",
          );
          return { should202: true, jobId: raceWinner.id };
        }
      }
      throw insertErr;
    }

    // Dispatch the transcoding job (always queue, and trigger lambda if configured)
    try {
      await services.videoDispatch.dispatch({
        jobId,
        videoId: media.id,
        inputPath: media.storage_key,
        quality: [360, 720, 1080],
      });
      logger.info(
        { jobId, mediaId: media.id },
        "Video transcoding job queued and dispatched successfully",
      );
    } catch (dispatchErr) {
      const message =
        dispatchErr instanceof Error ? dispatchErr.message : "Dispatch failed.";
      logger.error(
        { err: dispatchErr, jobId, mediaId: media.id },
        "Failed to dispatch video transcoding job; marking job as failed",
      );
      // Without this the job sits at status:'queued' forever with nothing to
      // process it, and the creator has no visibility into the failure.
      await mediaRepo.updateVideoJobStatus(database, jobId, {
        status: "failed",
        current_stage: "failed",
        error: message,
        failed_at: new Date(),
      });
    }

    return { should202: true, jobId };
  }

  /**
   * Pre-signs an S3/storage upload URL for media asset creation.
   */
  async function presignMediaUpload(
    creatorId: string,
    payload: PresignMediaRequest,
  ) {
    const mediaId = crypto.randomUUID();
    const ext = payload.filename.includes(".")
      ? payload.filename.split(".").pop()
      : "";
    const storageKey = `media/${creatorId}/${mediaId}${ext ? `.${ext}` : ""}`;

    const uploadUrl = await services.storage.getPresignedPutUrl(
      storageKey,
      payload.contentType,
      payload.fileSize,
    );

    await mediaRepo.insertMediaAsset(database, {
      id: mediaId,
      owner_id: creatorId,
      type: payload.type,
      storage_provider: "s3",
      storage_key: storageKey,
      original_filename: payload.filename,
      mime_type: payload.contentType,
      size_bytes: payload.fileSize,
      status: "uploading",
    });

    return {
      uploadUrl,
      mediaAssetId: mediaId,
    };
  }

  /**
   * Fetches transcoding progress for a video asset.
   */
  async function getVideoJobProgress(
    courseId: string,
    videoId: string,
    creatorId: string,
  ) {
    await verifyCourseOwner(database, courseId, creatorId);

    const media = await mediaRepo.findMediaAssetById(
      database,
      videoId,
      creatorId,
    );
    if (!media) {
      throw new AppError(404, "MEDIA_NOT_FOUND", "Media asset not found.");
    }

    const job = await mediaRepo.findVideoJobByVideoId(database, videoId);
    if (!job) {
      throw new AppError(
        404,
        "JOB_NOT_FOUND",
        "Video transcoding job not found.",
      );
    }

    return {
      status: job.status as "queued" | "processing" | "completed" | "failed",
      progress: job.progress,
      currentStage: job.current_stage as
        | "queued"
        | "downloading"
        | "transcoding"
        | "uploading"
        | "finalizing"
        | "completed"
        | "failed",
      error: job.error,
    };
  }

  return {
    confirmUpload,
    queueTranscodeJob,
    presignMediaUpload,
    getVideoJobProgress,
  };
}

export type MediaService = ReturnType<typeof createMediaService>;
