import { sql, type Kysely } from "kysely";
import type { Database } from "@veolms/database";
import type { FleetProvider } from "@veolms/fleet-types";
import type { FleetManagerConfig } from "@veolms/config";
import type { JobManager } from "./job-manager.ts";
import type { Scheduler } from "./scheduler.ts";
import type { WorkerManager } from "./worker-manager.ts";

export interface Monitor {
  checkHeartbeatTimeouts(): Promise<number>;
  checkDueWorkers(): Promise<number>;
  checkOrphanedJobs(): Promise<number>;
}

export function createMonitor(options: {
  provider: FleetProvider;
  db: Kysely<Database>;
  scheduler: Scheduler;
  jobManager: JobManager;
  workerManager: WorkerManager;
  config: FleetManagerConfig;
}): Monitor {
  const { db, scheduler, jobManager, workerManager, config } = options;
  const timeoutMs = config.HEARTBEAT_TIMEOUT_SECONDS * 1000;

  return {
    async checkOrphanedJobs(): Promise<number> {
      const cutoff = new Date(Date.now() - timeoutMs);

      const orphanedJobs = await db
        .selectFrom("jobs")
        .select(["id", "video_key", "started_at"])
        .where("status", "=", "PROCESSING")
        .where("worker_id", "is", null)
        .where((eb) =>
          eb.or([
            eb("started_at", "<", cutoff),
            eb.and([
              eb("started_at", "is", null),
              eb("created_at", "<", cutoff),
            ]),
          ]),
        )
        .execute();

      for (const job of orphanedJobs) {
        console.warn(`Recovering orphaned processing job ${job.id}`);
        await jobManager.markJobFailed(
          job.id,
          `Recovered orphaned job: worker assignment timed out or was interrupted`,
        );
      }

      return orphanedJobs.length;
    },

    async checkHeartbeatTimeouts(): Promise<number> {
      const cutoff = new Date(Date.now() - timeoutMs);

      const staleWorkers = await db
        .selectFrom("workers")
        .select(["id", "job_id", "status", "last_heartbeat_at", "created_at"])
        .where("status", "in", [
          "PENDING",
          "PROVISIONING",
          "STARTING",
          "READY",
          "PROCESSING",
        ])
        .where((eb) =>
          eb.or([
            eb("last_heartbeat_at", "<", cutoff),
            eb.and([
              eb("last_heartbeat_at", "is", null),
              eb("created_at", "<", cutoff),
            ]),
          ]),
        )
        .execute();

      for (const worker of staleWorkers) {
        console.warn(
          `Worker ${worker.id} missed heartbeat timeout (cutoff ${cutoff.toISOString()})`,
        );

        await workerManager.recordEvent(
          "HEARTBEAT_TIMEOUT",
          worker.id,
          worker.job_id,
          {
            lastHeartbeatAt: worker.last_heartbeat_at?.toISOString() ?? null,
            timeoutSeconds: config.HEARTBEAT_TIMEOUT_SECONDS,
          },
        );

        // Mark worker FAILED
        await db
          .updateTable("workers")
          .set({
            status: "FAILED",
            updated_at: new Date(),
          })
          .where("id", "=", worker.id)
          .execute();

        // Mark associated job failed / retryable only if still assigned to this worker
        if (worker.job_id) {
          await jobManager.markJobFailed(
            worker.job_id,
            `Worker ${worker.id} missed heartbeat timeout (${config.HEARTBEAT_TIMEOUT_SECONDS}s)`,
            worker.id,
          );
        }

        // Terminate worker
        await workerManager.terminateWorker(worker.id);
      }

      return staleWorkers.length;
    },

    async checkDueWorkers(): Promise<number> {
      const now = new Date();

      const dueMonitoring = await db
        .selectFrom("worker_monitoring")
        .innerJoin("workers", "workers.id", "worker_monitoring.worker_id")
        .leftJoin("jobs", "jobs.id", "workers.job_id")
        .select([
          "worker_monitoring.worker_id",
          "worker_monitoring.estimated_duration_sec",
          "worker_monitoring.progress_percent",
          "worker_monitoring.monitoring_attempts",
          "worker_monitoring.check_interval_sec",
          "workers.status as worker_status",
          "workers.job_id",
          "jobs.status as job_status",
        ])
        .where("worker_monitoring.next_check_at", "<=", now)
        .where("workers.status", "not in", ["TERMINATING", "TERMINATED"])
        .execute();

      for (const item of dueMonitoring) {
        if (
          item.job_status === "COMPLETED" ||
          item.worker_status === "COMPLETED"
        ) {
          await workerManager.terminateWorker(item.worker_id);
          continue;
        }

        if (item.job_status === "FAILED" || item.worker_status === "FAILED") {
          await workerManager.terminateWorker(item.worker_id);
          continue;
        }

        // Recalculate next check time dynamically based on reported progress
        const nextCheck = scheduler.calculateNextCheck({
          estimatedDurationSec: item.estimated_duration_sec,
          progressPercent: item.progress_percent,
          lastCheckIntervalSec: item.check_interval_sec,
        });

        await db
          .updateTable("worker_monitoring")
          .set({
            next_check_at: nextCheck.nextCheckAt,
            last_check_at: now,
            check_interval_sec: nextCheck.checkIntervalSec,
            monitoring_attempts: item.monitoring_attempts + 1,
            updated_at: new Date(),
          })
          .where("worker_id", "=", item.worker_id)
          .execute();
      }

      return dueMonitoring.length;
    },
  };
}
