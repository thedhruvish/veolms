import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import type { Database } from "@veolms/database";
import {
  estimateJobHardware,
  type FleetEventType,
  type FleetProvider,
  type Job,
  type VideoQualityLevel,
  type WorkerHandle,
  type WorkerSpec,
} from "@veolms/fleet-types";
import type { FleetManagerConfig } from "@veolms/config";
import type { Scheduler } from "./scheduler.ts";

// Statuses that occupy a worker slot; COMPLETED/FAILED/TERMINATED have
// released their capacity back to the pool.
const ACTIVE_WORKER_STATUSES = [
  "PENDING",
  "PROVISIONING",
  "STARTING",
  "READY",
  "PROCESSING",
  "TERMINATING",
] as const;

export interface WorkerManager {
  calculateWorkerSpec(job: Job): WorkerSpec;
  countActiveWorkers(): Promise<number>;
  provisionWorker(job: Job): Promise<WorkerHandle>;
  terminateWorker(workerId: string): Promise<void>;
  recordEvent(
    event: FleetEventType,
    workerId: string | null,
    jobId: string | null,
    metadata?: Readonly<Record<string, unknown>>,
  ): Promise<void>;
}

export function calculateWorkerSpec(
  job: { videoSize: number; qualities: readonly VideoQualityLevel[] },
  options: { databaseUrl?: string; jobId?: string } = {},
): WorkerSpec {
  const hw = estimateJobHardware(job.videoSize, job.qualities);

  return {
    cpu: hw.minCpu,
    memoryMb: hw.minMemoryMb,
    architecture: hw.architecture,
    storageGb: hw.storageGb,
    region: "local",
    environmentVariables: {
      ...(options.jobId ? { JOB_ID: options.jobId } : {}),
      ...(options.databaseUrl ? { DATABASE_URL: options.databaseUrl } : {}),
    },
  };
}

export function createWorkerManager(options: {
  provider: FleetProvider;
  db: Kysely<Database>;
  scheduler: Scheduler;
  config: FleetManagerConfig;
}): WorkerManager {
  const { provider, db, scheduler, config } = options;

  const recordEvent = async (
    event: FleetEventType,
    workerId: string | null,
    jobId: string | null,
    metadata: Readonly<Record<string, unknown>> = {},
  ): Promise<void> => {
    try {
      await db
        .insertInto("worker_events")
        .values({
          id: randomUUID(),
          worker_id: workerId,
          job_id: jobId,
          event,
          metadata: { ...metadata },
          created_at: new Date(),
        })
        .execute();
    } catch (err) {
      console.error(`Failed to log worker event ${event}:`, err);
    }
  };

  return {
    recordEvent,

    calculateWorkerSpec(job: Job): WorkerSpec {
      return calculateWorkerSpec(job, {
        databaseUrl: config.DATABASE_URL,
        jobId: job.id,
      });
    },

    async countActiveWorkers(): Promise<number> {
      const result = await db
        .selectFrom("workers")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where("status", "in", ACTIVE_WORKER_STATUSES)
        .executeTakeFirst();
      return Number(result?.count ?? 0);
    },

    async provisionWorker(job: Job): Promise<WorkerHandle> {
      const workerId = randomUUID();

      if (job.videoSize <= 0) {
        // Falls back to baseline (qualities-only) sizing in
        // estimateJobHardware() — worth surfacing here since a large video
        // queued without a real size would otherwise be silently
        // under-provisioned instead of failing loudly.
        console.warn(
          `[fleet-manager] Job ${job.id} has no video_size (${job.videoSize}) — sizing worker from qualities alone.`,
        );
      }

      const spec = this.calculateWorkerSpec(job);

      // 1. Insert PENDING worker record
      await db
        .insertInto("workers")
        .values({
          id: workerId,
          provider: provider.name,
          provider_worker_id: "pending",
          status: "PENDING",
          architecture: spec.architecture,
          cpu: spec.cpu,
          memory_mb: spec.memoryMb,
          storage_gb: spec.storageGb,
          region: spec.region,
          job_id: job.id,
          metadata: {},
          last_heartbeat_at: null,
          created_at: new Date(),
          started_at: null,
          terminated_at: null,
          updated_at: new Date(),
        })
        .execute();

      await recordEvent("WORKER_CREATED", workerId, job.id, {
        cpu: spec.cpu,
        memoryMb: spec.memoryMb,
        qualities: job.qualities,
      });

      // 2. Call provider to launch worker
      const handle = await provider.createWorker(workerId, spec);

      // 3. Update status to PROVISIONING with provider_worker_id
      await db
        .updateTable("workers")
        .set({
          provider_worker_id: handle.providerWorkerId,
          status: "PROVISIONING",
          updated_at: new Date(),
        })
        .where("id", "=", workerId)
        .execute();

      await recordEvent("WORKER_PROVISIONING", workerId, job.id, {
        providerWorkerId: handle.providerWorkerId,
      });

      // 4. Initialize worker_monitoring schedule
      const estimatedDuration = estimateJobHardware(
        job.videoSize,
        job.qualities,
      ).estimatedDurationSeconds;
      const initialCheck = scheduler.calculateNextCheck({
        estimatedDurationSec: estimatedDuration,
        progressPercent: 0,
      });

      await db
        .insertInto("worker_monitoring")
        .values({
          worker_id: workerId,
          next_check_at: initialCheck.nextCheckAt,
          last_check_at: null,
          estimated_duration_sec: estimatedDuration,
          progress_percent: 0.0,
          last_progress_at: null,
          monitoring_attempts: 0,
          check_interval_sec: initialCheck.checkIntervalSec,
          updated_at: new Date(),
        })
        .execute();

      return handle;
    },

    async terminateWorker(workerId: string): Promise<void> {
      const worker = await db
        .selectFrom("workers")
        .select(["id", "provider_worker_id", "job_id", "status"])
        .where("id", "=", workerId)
        .executeTakeFirst();

      if (!worker || worker.status === "TERMINATED") {
        return;
      }

      // Safe Ordering: Mark TERMINATING in DB first
      await db
        .updateTable("workers")
        .set({
          status: "TERMINATING",
          updated_at: new Date(),
        })
        .where("id", "=", workerId)
        .execute();

      await recordEvent(
        "WORKER_TERMINATION_REQUESTED",
        workerId,
        worker.job_id,
      );

      // Call provider termination
      if (
        worker.provider_worker_id &&
        worker.provider_worker_id !== "pending"
      ) {
        try {
          await provider.terminateWorker(worker.provider_worker_id);
        } catch (err) {
          console.error(`Provider error terminating worker ${workerId}:`, err);
        }
      }

      // Mark TERMINATED in DB
      await db
        .updateTable("workers")
        .set({
          status: "TERMINATED",
          terminated_at: new Date(),
          updated_at: new Date(),
        })
        .where("id", "=", workerId)
        .execute();

      await recordEvent("WORKER_TERMINATED", workerId, worker.job_id);
    },
  };
}
