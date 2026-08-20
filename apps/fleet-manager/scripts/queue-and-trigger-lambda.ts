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
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createDatabase } from "@veolms/database";
import { loadServerConfig } from "@veolms/config";
import {
  videoQualityLevelSchema,
  type VideoQualityLevel,
} from "@veolms/fleet-types";

const REGION = process.env.AWS_REGION || "us-east-1";
const LAMBDA_NAME = process.env.LAMBDA_FUNCTION_NAME || "veolms-fleet-manager";
const VIDEO_KEY = process.env.VIDEO_KEY || "raw/video.mp4";
const ENDPOINT_URL = process.env.AWS_ENDPOINT_URL;
const QUALITIES: VideoQualityLevel[] = (
  process.env.QUALITIES?.split(",") ?? ["240p"]
).map((q) => videoQualityLevelSchema.parse(q.trim()));

async function main(): Promise<void> {
  const config = loadServerConfig(process.env);
  const db = createDatabase(config.DATABASE_URL);

  try {
    const jobId = randomUUID();
    const outputPrefix = `hls/test-${jobId.slice(0, 8)}/`;

    console.info(
      `\n╔══════════════════════════════════════════════════════════════╗`,
    );
    console.info(
      `║     VeoLMS AWS Queue & Trigger (Serverless Fleet Manager)    ║`,
    );
    console.info(
      `╚══════════════════════════════════════════════════════════════╝\n`,
    );

    console.info(`[1/3] Adding job to PostgreSQL database...`);
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

    console.info(`✔ Job [${jobId}] queued.\n`);

    console.info(
      `[2/3] Invoking Lambda "${LAMBDA_NAME}" to claim and launch EC2 worker...`,
    );
    const outFile = join(tmpdir(), `lambda-invoke-${jobId.slice(0, 8)}.json`);
    const invokeArgs = [
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
    ];
    if (ENDPOINT_URL) {
      invokeArgs.push("--endpoint-url", ENDPOINT_URL);
    }
    invokeArgs.push(outFile);

    try {
      execFileSync("aws", invokeArgs, { stdio: "pipe" });
      const responseRaw = readFileSync(outFile, "utf-8").trim();
      unlinkSync(outFile);

      let parsedPayload: Record<string, unknown> = {};
      try {
        const topLevel = JSON.parse(responseRaw);
        parsedPayload =
          typeof topLevel.body === "string"
            ? JSON.parse(topLevel.body)
            : topLevel;
      } catch {
        parsedPayload = { raw: responseRaw };
      }

      if (parsedPayload.success === false) {
        console.error(`✘ Lambda returned an error: ${parsedPayload.error}`);
        process.exitCode = 1;
        return;
      }

      console.info(`✔ Lambda executed successfully.`);
      console.info(
        `  Claim Result: ${parsedPayload.jobClaimed ? "Job Claimed & EC2 Worker Launched" : "No job claimed (at worker capacity or queue empty)"}`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`✘ Lambda invoke failed: ${msg}`);
      process.exitCode = 1;
      return;
    }

    console.info(`\n[3/3] Checking worker and EC2 instance status...`);
    // Allow brief time for instance record in database
    await new Promise((r) => setTimeout(r, 2000));

    const updatedJob = await db
      .selectFrom("jobs")
      .select(["id", "status", "worker_id", "error_message"])
      .where("id", "=", jobId)
      .executeTakeFirst();

    if (updatedJob?.worker_id) {
      const worker = await db
        .selectFrom("workers")
        .selectAll()
        .where("id", "=", updatedJob.worker_id)
        .executeTakeFirst();

      if (worker) {
        console.info(`✔ Worker record created in PostgreSQL:`);
        console.info(`  Worker ID:           ${worker.id}`);
        console.info(`  Provider Worker ID:  ${worker.provider_worker_id}`);
        console.info(`  Worker Status:       ${worker.status}`);

        const ec2InstanceId = worker.provider_worker_id;
        if (ec2InstanceId && ec2InstanceId.startsWith("i-")) {
          try {
            const descArgs = [
              "ec2",
              "describe-instances",
              "--instance-ids",
              ec2InstanceId,
              "--region",
              REGION,
              "--output",
              "json",
            ];
            if (ENDPOINT_URL) {
              descArgs.push("--endpoint-url", ENDPOINT_URL);
            }
            const descOut = JSON.parse(
              execFileSync("aws", descArgs, { stdio: "pipe" }).toString(),
            );
            const instance = descOut.Reservations?.[0]?.Instances?.[0];
            if (instance) {
              const state = instance.State?.Name ?? "unknown";
              const publicIp = instance.PublicIpAddress;
              const privateIp = instance.PrivateIpAddress;
              const keyName =
                instance.KeyName || process.env.KEY_NAME || "mykey";

              console.info(`\n  EC2 Instance Details:`);
              console.info(`    Instance ID:       ${ec2InstanceId}`);
              console.info(`    State:             ${state}`);
              console.info(`    Instance Type:     ${instance.InstanceType}`);
              console.info(
                `    Public IP:         ${publicIp || "(assigning...)"}`,
              );
              console.info(
                `    Private IP:        ${privateIp || "(assigning...)"}`,
              );
              console.info(`    Key Pair:          ${keyName}`);

              // Find matching .pem key file in repo root
              const repoRoot = resolve(process.cwd(), "../..");
              const possibleKeys = [
                join(process.cwd(), "mykey.pem"),
                join(repoRoot, "mykey.pem"),
                join(process.cwd(), `${keyName}.pem`),
                join(repoRoot, `${keyName}.pem`),
              ];
              const foundKey = possibleKeys.find((k) => existsSync(k));
              const keyArg = foundKey
                ? `-i "${foundKey}"`
                : `-i "${keyName}.pem"`;

              if (publicIp) {
                console.info(`\n  SSH Access to Worker:`);
                console.info(`    ssh ${keyArg} admin@${publicIp}`);
                console.info(`\n  Live Worker Logs:`);
                console.info(
                  `    ssh ${keyArg} admin@${publicIp} "tail -f /var/log/veolms-bootstrap.log /var/log/veolms-worker.log"`,
                );
              } else {
                console.info(
                  `\n  Note: Public IP is being allocated. You can check again in a few seconds:`,
                );
                console.info(
                  `    aws ec2 describe-instances --instance-ids ${ec2InstanceId} --region ${REGION} --query "Reservations[0].Instances[0].PublicIpAddress" --output text`,
                );
              }
            }
          } catch (descErr: unknown) {
            const descMsg =
              descErr instanceof Error ? descErr.message : String(descErr);
            console.info(`  (Could not fetch EC2 details yet: ${descMsg})`);
          }
        }
      }
    } else {
      console.info(`  Job status in database: ${updatedJob?.status}`);
      if (updatedJob?.error_message) {
        console.error(`  Error message: ${updatedJob.error_message}`);
      }
    }

    console.info(`\nTo monitor jobs & workers continuously:`);
    console.info(`  pnpm fleet:cli status ${jobId}`);
    console.info(
      `  aws logs tail /veolms/workers --follow --region ${REGION}\n`,
    );
  } finally {
    await db.destroy();
  }
}

main().catch((err: unknown) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
