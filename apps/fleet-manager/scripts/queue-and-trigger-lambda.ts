/**
 * Queues one transcode job into PostgreSQL and invokes the serverless
 * Fleet Manager Lambda once to claim it — nothing else. No infra
 * provisioning here; run `pnpm fleet:infra` first (against real AWS or
 * LocalStack, per its own target-environment prompt).
 *
 * Meant to be run multiple times in a row to queue several jobs and
 * verify the fleet provisions one worker per job (e.g. run twice, then
 * check `aws ec2 describe-instances` shows two running instances).
 *
 * Respects whatever AWS target the current apps/fleet-manager/.env points
 * at (AWS_ENDPOINT_URL for LocalStack, or real AWS if unset) — same as
 * every other AWS-facing script in this package.
 *
 * Usage:
 *   pnpm fleet:queue:trigger
 *   VIDEO_KEY=raw/other.mp4 QUALITIES=240p,360p pnpm fleet:queue:trigger
 */
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDatabase } from "@veolms/database";
import { loadServerConfig } from "@veolms/config";
import { videoQualityLevelSchema, type VideoQualityLevel } from "@veolms/fleet-types";

const REGION = process.env.AWS_REGION || "us-east-1";
const LAMBDA_NAME = process.env.LAMBDA_FUNCTION_NAME || "veolms-fleet-manager";
const VIDEO_KEY = process.env.VIDEO_KEY || "raw/video.mp4";
const QUALITIES: VideoQualityLevel[] = (
  process.env.QUALITIES?.split(",") ?? ["240p"]
).map((q) => videoQualityLevelSchema.parse(q.trim()));

async function main(): Promise<void> {
  const config = loadServerConfig(process.env);
  const db = createDatabase(config.DATABASE_URL);

  try {
    const jobId = randomUUID();
    const outputPrefix = `hls/test-${jobId.slice(0, 8)}/`;

    console.info(`[Queue] Adding job to database...`);
    console.info(`  Job ID:        ${jobId}`);
    console.info(`  Video Key:     ${VIDEO_KEY}`);
    console.info(`  Output Prefix: ${outputPrefix}`);
    console.info(`  Qualities:     ${QUALITIES.join(", ")}`);

    await db
      .insertInto("jobs")
      .values({
        id: jobId,
        status: "QUEUED",
        video_key: VIDEO_KEY,
        output_prefix: outputPrefix,
        requirements: {
          qualities: QUALITIES,
          videoCodec: "h264",
          audioCodec: "aac",
          segmentDurationSeconds: 4,
          hardware: {
            minCpu: 2,
            minMemoryMb: 2048,
            architecture: "arm64",
            storageGb: 10,
            estimatedDurationSeconds: 60,
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

    console.info(`✓ Job [${jobId}] queued.\n`);

    console.info(`[Trigger] Invoking Lambda "${LAMBDA_NAME}"...`);
    const outFile = join(tmpdir(), `lambda-invoke-${jobId.slice(0, 8)}.json`);
    try {
      execFileSync(
        "aws",
        [
          "lambda",
          "invoke",
          "--function-name",
          LAMBDA_NAME,
          "--payload",
          JSON.stringify({ action: "claim", jobId }),
          "--cli-binary-format",
          "raw-in-base64-out",
          "--region",
          REGION,
          outFile,
        ],
        { stdio: "pipe" },
      );
      const responseBody = readFileSync(outFile, "utf-8").trim();
      console.info(`✓ Lambda invoked. Response: ${responseBody}`);
      unlinkSync(outFile);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`✘ Lambda invoke failed: ${msg}`);
      process.exitCode = 1;
      return;
    }

    console.info(`\nCheck status: pnpm fleet:cli status ${jobId}`);
  } finally {
    await db.destroy();
  }
}

main().catch((err: unknown) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
