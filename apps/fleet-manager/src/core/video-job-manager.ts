import { randomUUID } from "node:crypto";
import type { Kysely, Selectable } from "kysely";
import {
  claimNextQueuedVideoJob,
  type Database,
  type VideoJobTable,
} from "@veolms/database";
import type { VideoQualityLevel } from "@veolms/fleet-types";
import type { FleetManagerConfig } from "@veolms/config";

export interface QueueJobParams {
  jobId?: string;
  videoId: string;
  videoKey: string;
  outputPrefix: string;
  qualities: readonly VideoQualityLevel[];
  videoSize?: number;
}

export interface JobManager {
  claimNextJob(): Promise<Selectable<VideoJobTable> | null>;
  assignWorkerToJob(jobId: string, workerId: string): Promise<void>;
  markJobCompleted(jobId: string): Promise<void>;
  markJobFailed(
    jobId: string,
    errorMessage: string,
    expectedWorkerId?: string,
  ): Promise<boolean>;
  queueJob(params: QueueJobParams): Promise<Selectable<VideoJobTable>>;
  getJob(jobId: string): Promise<Selectable<VideoJobTable> | null>;
}

export function createJobManager(options: {
  db: Kysely<Database>;
  config: FleetManagerConfig;
}): JobManager {
  const { db, config } = options;

  return {
    async claimNextJob(): Promise<Selectable<VideoJobTable> | null> {
      return await claimNextQueuedVideoJob(db);
    },

    async assignWorkerToJob(jobId: string, workerId: string): Promise<void> {
      await db
        .updateTable("video_jobs")
        .set({
          worker_id: workerId,
          updated_at: new Date(),
        })
        .where("id", "=", jobId)
        .execute();
    },

    async markJobCompleted(jobId: string): Promise<void> {
      await db
        .updateTable("video_jobs")
        .set({
          status: "COMPLETED",
          completed_at: new Date(),
          updated_at: new Date(),
        })
        .where("id", "=", jobId)
        .execute();
    },

    async markJobFailed(
      jobId: string,
      errorMessage: string,
      expectedWorkerId?: string,
    ): Promise<boolean> {
      let query = db
        .selectFrom("video_jobs")
        .select(["id", "attempts", "max_attempts", "status", "worker_id"])
        .where("id", "=", jobId);

      if (expectedWorkerId) {
        query = query
          .where("status", "in", ["PROVISIONING", "PROCESSING"])
          .where("worker_id", "=", expectedWorkerId);
      }

      const job = await query.executeTakeFirst();

      if (!job || job.status === "COMPLETED") {
        return false;
      }

      const nextAttempts = job.attempts + 1;
      const shouldRetry = nextAttempts < job.max_attempts;

      let updateQuery = db
        .updateTable("video_jobs")
        .set({
          attempts: nextAttempts,
          status: shouldRetry ? "QUEUED" : "FAILED",
          worker_id: null,
          error_message: errorMessage,
          failed_at: shouldRetry ? null : new Date(),
          updated_at: new Date(),
        })
        .where("id", "=", jobId);

      if (expectedWorkerId) {
        updateQuery = updateQuery
          .where("status", "in", ["PROVISIONING", "PROCESSING"])
          .where("worker_id", "=", expectedWorkerId);
      }

      const result = await updateQuery.executeTakeFirst();
      return result.numUpdatedRows === 1n ? shouldRetry : false;
    },

    async queueJob(params: QueueJobParams): Promise<Selectable<VideoJobTable>> {
      // 1. If an exact jobId is requested, check if it already exists in the database
      if (params.jobId) {
        const existingById = await db
          .selectFrom("video_jobs")
          .selectAll()
          .where("id", "=", params.jobId)
          .executeTakeFirst();
        if (existingById) {
          return existingById;
        }
      }

      // 2. Check if a job is already active for this videoId or videoKey
      const existingActive = await db
        .selectFrom("video_jobs")
        .selectAll()
        .where((eb) =>
          eb.or([
            eb("video_id", "=", params.videoId),
            eb("video_key", "=", params.videoKey),
          ]),
        )
        .where("status", "in", ["QUEUED", "PROVISIONING", "PROCESSING"])
        .orderBy("created_at", "desc")
        .executeTakeFirst();

      if (existingActive) {
        return existingActive;
      }

      const id = params.jobId ?? randomUUID();
      const videoId = params.videoId ?? id;
      const videoSize = params.videoSize ?? 0;
      const now = new Date();

      try {
        const [row] = await db
          .insertInto("video_jobs")
          .values({
            id,
            video_id: videoId,
            status: "QUEUED",
            video_key: params.videoKey,
            output_prefix: params.outputPrefix,
            video_size: videoSize,
            qualities: [...params.qualities],
            worker_id: null,
            attempts: 0,
            max_attempts: config.MAX_RETRIES,
            error_message: null,
            created_at: now,
            started_at: null,
            completed_at: null,
            failed_at: null,
            updated_at: now,
          })
          .returningAll()
          .execute();

        return (
          row ?? {
            id,
            video_id: videoId,
            status: "QUEUED",
            video_key: params.videoKey,
            output_prefix: params.outputPrefix,
            video_size: videoSize,
            qualities: [...params.qualities],
            worker_id: null,
            progress_percent: 0,
            attempts: 0,
            max_attempts: config.MAX_RETRIES,
            error_message: null,
            created_at: now,
            started_at: null,
            completed_at: null,
            failed_at: null,
            updated_at: now,
          }
        );
      } catch (insertErr) {
        // If a concurrent insert occurred (unique constraint violation), return the existing row
        const raceWinner = await db
          .selectFrom("video_jobs")
          .selectAll()
          .where((eb) =>
            eb.or([
              eb("id", "=", id),
              eb("video_id", "=", videoId),
              eb("video_key", "=", params.videoKey),
            ]),
          )
          .orderBy("created_at", "desc")
          .executeTakeFirst();

        if (raceWinner) {
          return raceWinner;
        }

        throw insertErr;
      }
    },

    async getJob(jobId: string): Promise<Selectable<VideoJobTable> | null> {
      const row = await db
        .selectFrom("video_jobs")
        .selectAll()
        .where("id", "=", jobId)
        .executeTakeFirst();

      return row ?? null;
    },
  };
}
