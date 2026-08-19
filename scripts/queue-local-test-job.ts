import { randomUUID } from "node:crypto";
import { createDatabase } from "../packages/database/src/index.ts";
import { loadServerConfig } from "../packages/config/src/index.ts";
import type { VideoQualityLevel } from "../packages/fleet-types/src/index.ts";

const config = loadServerConfig(process.env);
const db = createDatabase(config.DATABASE_URL);

async function queueLocalJob() {
  const jobId = randomUUID();
  const videoKey = "s3-bucket/raw/video.mp4";
  const outputPrefix = "output/video-test/";
  const qualities: VideoQualityLevel[] = ["240p", "144p"];

  console.info(`[Queue] Adding job to database...`);
  console.info(`  Job ID:        ${jobId}`);
  console.info(`  Video Key:     ${videoKey}`);
  console.info(`  Output Prefix: ${outputPrefix}`);
  console.info(`  Qualities:     ${qualities.join(", ")}`);

  try {
    await db
      .insertInto("jobs")
      .values({
        id: jobId,
        status: "QUEUED",
        video_key: videoKey,
        output_prefix: outputPrefix,
        requirements: {
          qualities,
          videoCodec: "h264",
          audioCodec: "aac",
          segmentDurationSeconds: 4,
          hardware: {
            minCpu: 2,
            minMemoryMb: 2048,
            architecture: "arm64",
            storageGb: 10,
            estimatedDurationSeconds: 120,
          },
        },
        worker_id: null,
        attempts: 0,
        max_attempts: 3,
        error_message: null,
        created_at: new Date(),
        started_at: null,
        completed_at: null,
        failed_at: null,
        updated_at: new Date(),
      })
      .execute();

    console.info(`✓ Successfully queued job [${jobId}] into PostgreSQL!`);
    return jobId;
  } finally {
    await db.destroy();
  }
}

queueLocalJob()
  .then((id) => {
    console.info(`\nReady to run fleet manager to process job: ${id}`);
    process.exit(0);
  })
  .catch((err) => {
    console.error("Failed to queue job:", err);
    process.exit(1);
  });
