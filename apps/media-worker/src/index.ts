import { resolve } from "node:path";
import { createDatabase } from "@veolms/database";
import { loadMediaWorkerConfig } from "./config.ts";
import { executeTranscodeJob } from "./processor.ts";
import { initMediaWorker, pollForNextJob } from "./worker.ts";

export async function run(): Promise<void> {
  const config = loadMediaWorkerConfig();
  const db = createDatabase(config.DATABASE_URL);

  console.info(`[media-worker] Initializing worker ${config.WORKER_ID}...`);
  const workerCtx = await initMediaWorker({ config, db });
  const shutdownController = new AbortController();

  const cleanup = () => {
    if (shutdownController.signal.aborted) {
      return;
    }
    console.info(
      `[media-worker] Shutdown signal received for worker ${config.WORKER_ID}...`,
    );
    shutdownController.abort();
  };

  process.on("SIGTERM", cleanup);
  process.on("SIGINT", cleanup);

  try {
    let jobId =
      config.JOB_ID ??
      (await pollForNextJob(workerCtx, shutdownController.signal));

    if (!jobId) {
      console.info(
        `[media-worker] No compatible queued work found for worker ${config.WORKER_ID}.`,
      );
    }

    // Keep this already-booted worker busy: after each job, check the
    // queue for the next one instead of terminating immediately. Reuses
    // the instance across many jobs, skipping the fresh-boot cost each
    // subsequent job would otherwise pay.
    while (jobId && !shutdownController.signal.aborted) {
      console.info(`[media-worker] Processing job ${jobId}...`);
      try {
        await executeTranscodeJob(workerCtx, jobId, shutdownController.signal);
        console.info(`[media-worker] Job ${jobId} finished successfully.`);
      } catch (err) {
        console.error(`[media-worker] Job ${jobId} encountered an error:`, err);
        if (shutdownController.signal.aborted) {
          break;
        }
      }

      jobId = await pollForNextJob(workerCtx, shutdownController.signal);
    }

    if (shutdownController.signal.aborted) {
      console.info(
        `[media-worker] Worker ${config.WORKER_ID} shut down safely.`,
      );
    } else {
      console.info(
        `[media-worker] No more compatible queued work — worker ${config.WORKER_ID} shutting down.`,
      );
    }
  } finally {
    process.off("SIGTERM", cleanup);
    process.off("SIGINT", cleanup);
    workerCtx.stopHeartbeat();
    try {
      await db
        .updateTable("workers")
        .set({
          status: "COMPLETED",
          job_id: null,
          updated_at: new Date(),
        })
        .where("id", "=", config.WORKER_ID)
        .where("status", "=", "READY")
        .execute();
    } finally {
      await db.destroy();
    }
  }
}

// Auto-run when executed directly as main script
const isMain =
  typeof require !== "undefined"
    ? require.main === module
    : typeof process !== "undefined" &&
      process.argv[1] &&
      (import.meta?.url?.endsWith(process.argv[1]) ||
        import.meta?.url === `file://${resolve(process.argv[1])}`);

if (isMain) {
  run().catch((err) => {
    console.error("[media-worker] Fatal error during startup:", err);
    process.exit(1);
  });
}
