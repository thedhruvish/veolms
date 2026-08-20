import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import { claimNextQueuedJob, type Database } from "@veolms/database";
import type {
  Job,
  JobRequirements,
  JobStatus,
  VideoQualityLevel,
} from "@veolms/fleet-types";
import type { FleetManagerConfig } from "../config/config.ts";

export interface QueueJobParams {
  videoKey: string;
  outputPrefix: string;
  qualities: readonly VideoQualityLevel[];
  hardware?: Partial<JobRequirements["hardware"]>;
  segmentDurationSeconds?: number;
}

export interface JobManager {
  claimNextJob(): Promise<Job | null>;
  assignWorkerToJob(jobId: string, workerId: string): Promise<void>;
  markJobCompleted(jobId: string): Promise<void>;
  markJobFailed(jobId: string, errorMessage: string): Promise<boolean>;
  queueJob(params: QueueJobParams): Promise<Job>;
  getJob(jobId: string): Promise<Job | null>;
}

export function createJobManager(options: {
  db: Kysely<Database>;
  config: FleetManagerConfig;
}): JobManager {
  const { db, config } = options;

  return {
    async claimNextJob(): Promise<Job | null> {
      const row = await claimNextQueuedJob(db);
      if (!row) {
        return null;
      }

      return {
        id: row.id,
        status: "PROCESSING" as JobStatus,
        videoKey: row.video_key,
        outputPrefix: row.output_prefix,
        requirements: row.requirements,
        workerId: row.worker_id,
        attempts: row.attempts,
        maxAttempts: row.max_attempts,
        errorMessage: row.error_message,
        createdAt: row.created_at,
        startedAt: new Date(),
        completedAt: row.completed_at,
        failedAt: row.failed_at,
        updatedAt: new Date(),
      };
    },

    async assignWorkerToJob(jobId: string, workerId: string): Promise<void> {
      await db
        .updateTable("jobs")
        .set({
          worker_id: workerId,
          updated_at: new Date(),
        })
        .where("id", "=", jobId)
        .execute();
    },

    async markJobCompleted(jobId: string): Promise<void> {
      await db
        .updateTable("jobs")
        .set({
          status: "COMPLETED",
          completed_at: new Date(),
          updated_at: new Date(),
        })
        .where("id", "=", jobId)
        .execute();
    },

    async markJobFailed(jobId: string, errorMessage: string): Promise<boolean> {
      const job = await db
        .selectFrom("jobs")
        .select(["id", "attempts", "max_attempts"])
        .where("id", "=", jobId)
        .executeTakeFirst();

      if (!job) {
        return false;
      }

      const nextAttempts = job.attempts + 1;
      const shouldRetry = nextAttempts < job.max_attempts;

      await db
        .updateTable("jobs")
        .set({
          attempts: nextAttempts,
          status: shouldRetry ? "QUEUED" : "FAILED",
          worker_id: null,
          error_message: errorMessage,
          failed_at: shouldRetry ? null : new Date(),
          updated_at: new Date(),
        })
        .where("id", "=", jobId)
        .execute();

      return shouldRetry;
    },

    async queueJob(params: QueueJobParams): Promise<Job> {
      const id = randomUUID();
      const hardware = {
        minCpu: params.hardware?.minCpu ?? 2,
        minMemoryMb: params.hardware?.minMemoryMb ?? 4096,
        architecture: params.hardware?.architecture ?? "arm64",
        storageGb: params.hardware?.storageGb ?? 30,
        estimatedDurationSeconds:
          params.hardware?.estimatedDurationSeconds ?? 600,
      };

      const requirements: JobRequirements = {
        qualities: params.qualities,
        videoCodec: "h264",
        audioCodec: "aac",
        segmentDurationSeconds: params.segmentDurationSeconds ?? 6,
        hardware,
      };

      await db
        .insertInto("jobs")
        .values({
          id,
          status: "QUEUED",
          video_key: params.videoKey,
          output_prefix: params.outputPrefix,
          requirements,
          worker_id: null,
          attempts: 0,
          max_attempts: config.MAX_RETRIES,
          error_message: null,
          created_at: new Date(),
          started_at: null,
          completed_at: null,
          failed_at: null,
          updated_at: new Date(),
        })
        .execute();

      return {
        id,
        status: "QUEUED",
        videoKey: params.videoKey,
        outputPrefix: params.outputPrefix,
        requirements,
        workerId: null,
        attempts: 0,
        maxAttempts: config.MAX_RETRIES,
        errorMessage: null,
        createdAt: new Date(),
        startedAt: null,
        completedAt: null,
        failedAt: null,
        updatedAt: new Date(),
      };
    },

    async getJob(jobId: string): Promise<Job | null> {
      const row = await db
        .selectFrom("jobs")
        .selectAll()
        .where("id", "=", jobId)
        .executeTakeFirst();

      if (!row) {
        return null;
      }

      return {
        id: row.id,
        status: row.status,
        videoKey: row.video_key,
        outputPrefix: row.output_prefix,
        requirements: row.requirements,
        workerId: row.worker_id,
        attempts: row.attempts,
        maxAttempts: row.max_attempts,
        errorMessage: row.error_message,
        createdAt: row.created_at,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        failedAt: row.failed_at,
        updatedAt: row.updated_at,
      };
    },
  };
}
