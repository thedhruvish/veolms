import type { Kysely, Selectable } from "kysely";
import type { Database, VideoJobTable } from "@veolms/database";
import type { FleetProvider, WorkerHandle } from "@veolms/fleet-types";
import type { FleetManagerConfig } from "@veolms/config";
import {
  createJobManager,
  type JobManager,
  type QueueJobParams,
} from "./video-job-manager.ts";
import { createMonitor, type Monitor } from "./monitor.ts";
import { createScheduler, type Scheduler } from "./scheduler.ts";
import { createWorkerManager, type WorkerManager } from "./worker-manager.ts";

export interface FleetManagerDependencies {
  readonly provider: FleetProvider;
  readonly db: Kysely<Database>;
  readonly config: FleetManagerConfig;
}

export interface MonitorCycleResult {
  dueProcessed: number;
  timeoutsProcessed: number;
  orphansProcessed: number;
}

export interface FleetManager {
  readonly jobManager: JobManager;
  readonly workerManager: WorkerManager;
  readonly scheduler: Scheduler;
  readonly monitor: Monitor;

  processNextJob(): Promise<boolean>;
  runMonitoringCycle(): Promise<MonitorCycleResult>;
  runTick(): Promise<void>;
  queueJob(params: QueueJobParams): Promise<Selectable<VideoJobTable>>;
  startServerfulLoop(signal?: AbortSignal): Promise<void>;
}

export function createFleetManager(
  deps: FleetManagerDependencies,
): FleetManager {
  const { provider, db, config } = deps;

  const scheduler = createScheduler(config);
  const jobManager = createJobManager({ db, config });
  const workerManager = createWorkerManager({
    provider,
    db,
    scheduler,
    config,
  });
  const monitor = createMonitor({
    provider,
    db,
    scheduler,
    jobManager,
    workerManager,
    config,
  });

  return {
    jobManager,
    workerManager,
    scheduler,
    monitor,

    async queueJob(params: QueueJobParams): Promise<Selectable<VideoJobTable>> {
      return await jobManager.queueJob(params);
    },

    async processNextJob(): Promise<boolean> {
      const activeWorkers = await workerManager.countActiveWorkers();
      if (activeWorkers >= config.MAX_WORKERS) {
        console.info(
          `[fleet-manager] At worker capacity (${activeWorkers}/${config.MAX_WORKERS}) — leaving queued jobs for a later tick.`,
        );
        return false;
      }

      const job = await jobManager.claimNextJob();
      if (!job) {
        return false;
      }

      console.info(
        `[fleet-manager] Claimed job ${job.id} for processing (qualities: ${Array.isArray(job.qualities) ? job.qualities.join(", ") : "default"})`,
      );

      try {
        const handle: WorkerHandle = await workerManager.provisionWorker(job);
        await jobManager.assignWorkerToJob(job.id, handle.id);
        await workerManager.recordEvent("JOB_ASSIGNED", handle.id, job.id, {
          providerWorkerId: handle.providerWorkerId,
        });

        console.info(
          `[fleet-manager] Assigned worker ${handle.id} (${handle.providerWorkerId}) to job ${job.id}`,
        );
        return true;
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(
          `[fleet-manager] Failed to provision worker for job ${job.id}:`,
          errorMsg,
        );
        await jobManager.markJobFailed(
          job.id,
          `Failed to provision worker: ${errorMsg}`,
        );
        return false;
      }
    },

    async runMonitoringCycle(): Promise<{
      dueProcessed: number;
      timeoutsProcessed: number;
      orphansProcessed: number;
    }> {
      const orphansProcessed = await monitor.checkOrphanedJobs();
      const timeoutsProcessed = await monitor.checkHeartbeatTimeouts();
      const dueProcessed = await monitor.checkDueWorkers();
      return { dueProcessed, timeoutsProcessed, orphansProcessed };
    },

    async runTick(): Promise<void> {
      // Process pending queued jobs in batch up to 5 per tick if available
      let processedAny = false;
      let count = 0;
      while (count < 5) {
        const claimed = await this.processNextJob();
        if (!claimed) break;
        processedAny = true;
        count++;
      }

      await this.runMonitoringCycle();
    },

    async startServerfulLoop(signal?: AbortSignal): Promise<void> {
      console.info(
        `[fleet-manager] Starting serverful loop with poll interval ${config.POLL_INTERVAL_MS}ms...`,
      );

      while (!signal?.aborted) {
        try {
          await this.runTick();
        } catch (err) {
          console.error("[fleet-manager] Error during tick:", err);
        }

        if (signal?.aborted) {
          break;
        }

        await new Promise<void>((resolve) => {
          const timeout = setTimeout(resolve, config.POLL_INTERVAL_MS);
          if (signal) {
            signal.addEventListener(
              "abort",
              () => {
                clearTimeout(timeout);
                resolve();
              },
              { once: true },
            );
          }
        });
      }

      console.info("[fleet-manager] Serverful loop stopped.");
    },
  };
}
