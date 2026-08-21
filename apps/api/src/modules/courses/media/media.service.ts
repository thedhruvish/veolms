import crypto from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import type { Kysely } from "kysely";
import type { Database, MediaAssetStatus } from "@veolms/database";
import type { PresignMediaRequest } from "@veolms/contracts";
import { AppError } from "../../../lib/errors.ts";
import type { AppServices } from "../../../services/index.ts";
import * as mediaRepo from "./media.repository.ts";
import * as courseRepo from "../course/course.repository.ts";

export interface MediaServiceOptions {
  database: Kysely<Database>;
  services: AppServices;
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

    const fileExists = await services.storage.headObject(media.storage_key);

    if (!fileExists) {
      throw new AppError(
        400,
        "FILE_NOT_FOUND",
        "File could not be found in storage.",
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
      logger.error(
        { err: dispatchErr, jobId, mediaId: media.id },
        "Failed to dispatch video transcoding job",
      );
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
    const course = await courseRepo.findCourseById(database, courseId);
    if (!course) {
      throw new AppError(404, "COURSE_NOT_FOUND", "Course not found.");
    }
    if (course.creator_id !== creatorId) {
      throw new AppError(403, "FORBIDDEN", "Unauthorized course access.");
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
