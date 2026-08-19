import { createDatabase } from "@veolms/database";
import { loadMediaWorkerConfig } from "./config.ts";
import { executeTranscodeJob } from "./processor.ts";
import { initMediaWorker } from "./worker.ts";

export async function run(): Promise<void> {
  const config = loadMediaWorkerConfig();
  const db = createDatabase(config.DATABASE_URL);

  console.info(`[media-worker] Initializing worker ${config.WORKER_ID}...`);
  const workerCtx = await initMediaWorker({ config, db });

  if (config.JOB_ID) {
    console.info(`[media-worker] Processing assigned job ${config.JOB_ID}...`);
    try {
      await executeTranscodeJob(workerCtx, config.JOB_ID);
      console.info(
        `[media-worker] Job ${config.JOB_ID} finished successfully.`,
      );
    } catch (err) {
      console.error(
        `[media-worker] Job ${config.JOB_ID} encountered an error:`,
        err,
      );
      process.exitCode = 1;
    } finally {
      workerCtx.stopHeartbeat();
    }
  } else {
    console.info(
      `[media-worker] Worker ${config.WORKER_ID} running idle, waiting for commands.`,
    );
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  run().catch((err) => {
    console.error("[media-worker] Fatal error during startup:", err);
    process.exit(1);
  });
}
