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
 *
 * If VIDEO_KEY and/or QUALITIES aren't passed as env vars, it prompts for
 * them interactively instead of silently defaulting.
 */
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import * as readline from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { createDatabase } from "@veolms/database";
import {
  loadFleetManagerConfig,
  loadServerConfig,
  resolveProviderName,
} from "@veolms/config";
import {
  videoQualityLevelSchema,
  type VideoQualityLevel,
} from "@veolms/fleet-types";
import { createFleetManager } from "../src/core/fleet-manager.ts";
import { resolveFleetProvider } from "../src/core/provider-resolver.ts";

function resolveAwsRegion(): string {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg?.startsWith("--region=")) {
      const val = arg.split("=")[1]?.trim();
      if (val) return val;
    }
    if (
      arg === "--region" &&
      i + 1 < args.length &&
      !args[i + 1]?.startsWith("-")
    ) {
      const val = args[i + 1]?.trim();
      if (val) return val;
    }
  }
  if (process.env.AWS_REGION) {
    return process.env.AWS_REGION;
  }
  if (process.env.AWS_DEFAULT_REGION) {
    return process.env.AWS_DEFAULT_REGION;
  }
  if (process.env.FLEET_MANAGER_LAMBDA_REGION) {
    return process.env.FLEET_MANAGER_LAMBDA_REGION;
  }
  if (process.env.LAMBDA_FUNCTION_ARN) {
    const match = /^arn:aws:lambda:([^:]+):/i.exec(
      process.env.LAMBDA_FUNCTION_ARN,
    );
    if (match?.[1]) {
      return match[1];
    }
  }
  return "us-east-1";
}

function resolveAwsProfile(): string | undefined {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg?.startsWith("--profile=") || arg?.startsWith("--aws-profile=")) {
      return arg.split("=")[1]?.trim();
    }
    if (
      (arg === "--profile" || arg === "--aws-profile") &&
      i + 1 < args.length &&
      !args[i + 1]?.startsWith("-")
    ) {
      return args[i + 1]?.trim();
    }
  }
  return process.env.AWS_PROFILE;
}

function resolveTargetLambda(): {
  name: string;
  isDirectFleetManager: boolean;
} {
  const args = process.argv.slice(2);
  const isDirect =
    args.includes("--fleet-manager") ||
    args.includes("--direct") ||
    args.includes("--target=fleet-manager") ||
    args.includes("--target=fleet") ||
    process.env["TRIGGER_TARGET"] === "fleet-manager" ||
    process.env["TRIGGER_TARGET"] === "fleet" ||
    process.env["TARGET"] === "fleet-manager" ||
    process.env["TARGET"] === "fleet" ||
    process.env["DIRECT"] === "true" ||
    process.env["DIRECT_TRIGGER"] === "true";

  for (const arg of args) {
    if (arg.startsWith("--lambda=") || arg.startsWith("--function-name=")) {
      const customName = arg.split("=")[1]?.trim();
      if (customName) {
        return { name: customName, isDirectFleetManager: isDirect };
      }
    }
  }

  if (isDirect) {
    if (process.env.FLEET_MANAGER_LAMBDA_NAME) {
      return {
        name: process.env.FLEET_MANAGER_LAMBDA_NAME,
        isDirectFleetManager: true,
      };
    }
    if (process.env.LAMBDA_FUNCTION_NAME) {
      return {
        name: process.env.LAMBDA_FUNCTION_NAME,
        isDirectFleetManager: true,
      };
    }
    if (process.env.LAMBDA_FUNCTION_ARN) {
      const match = /:function:([^:]+)$/i.exec(
        process.env.LAMBDA_FUNCTION_ARN,
      );
      if (match?.[1]) {
        return { name: match[1], isDirectFleetManager: true };
      }
    }
    return { name: "veolms-fleet-manager", isDirectFleetManager: true };
  }

  // Default: veolms-video-metadata-probe
  if (process.env.PROBE_LAMBDA_NAME) {
    return {
      name: process.env.PROBE_LAMBDA_NAME,
      isDirectFleetManager: false,
    };
  }
  if (process.env.PROBE_LAMBDA_ARN) {
    const match = /:function:([^:]+)$/i.exec(process.env.PROBE_LAMBDA_ARN);
    if (match?.[1]) {
      return { name: match[1], isDirectFleetManager: false };
    }
  }
  return {
    name: "veolms-video-metadata-probe",
    isDirectFleetManager: false,
  };
}

const REGION = resolveAwsRegion();
const { name: LAMBDA_NAME, isDirectFleetManager: IS_DIRECT_FLEET_MANAGER } =
  resolveTargetLambda();
const PROFILE = resolveAwsProfile();
const ENDPOINT_URL =
  process.env.AWS_ENDPOINT_URL || process.env.LOCALSTACK_ENDPOINT;
const DEFAULT_VIDEO_KEY = "raw/video.mp4";
const DEFAULT_QUALITIES: readonly VideoQualityLevel[] = ["240p"];

function buildAwsCliArgs(subcommandArgs: string[]): string[] {
  const args = [...subcommandArgs];
  if (REGION) {
    args.push("--region", REGION);
  }
  if (PROFILE) {
    args.push("--profile", PROFILE);
  }
  if (ENDPOINT_URL) {
    args.push("--endpoint-url", ENDPOINT_URL);
  }
  return args;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function parseQualities(raw: string): VideoQualityLevel[] {
  return raw.split(",").map((q) => videoQualityLevelSchema.parse(q.trim()));
}

// Only prompts for whichever of VIDEO_KEY/QUALITIES wasn't passed as an env
// var, so `VIDEO_KEY=... QUALITIES=... pnpm fleet:queue:trigger` still runs
// fully non-interactively for repeated/scripted use.
async function resolveVideoKeyAndQualities(): Promise<{
  videoKey: string;
  qualities: VideoQualityLevel[];
}> {
  const envVideoKey = process.env.VIDEO_KEY;
  const envQualities = process.env.QUALITIES;

  if (envVideoKey && envQualities) {
    return { videoKey: envVideoKey, qualities: parseQualities(envQualities) };
  }

  const rl = readline.createInterface({ input, output });
  try {
    let videoKey = envVideoKey;
    if (!videoKey) {
      const answer = (
        await rl.question(`Video key or URL [${DEFAULT_VIDEO_KEY}]: `)
      ).trim();
      videoKey = answer || DEFAULT_VIDEO_KEY;
    }

    let qualities: VideoQualityLevel[];
    if (envQualities) {
      qualities = parseQualities(envQualities);
    } else {
      qualities = [];
      while (qualities.length === 0) {
        const answer = (
          await rl.question(
            `Target qualities, comma-separated [${DEFAULT_QUALITIES.join(",")}]: `,
          )
        ).trim();
        try {
          qualities = parseQualities(answer || DEFAULT_QUALITIES.join(","));
        } catch {
          console.error(
            `  Invalid quality. Allowed: 2160p, 1440p, 1080p, 720p, 480p, 360p, 240p, 144p`,
          );
        }
      }
    }

    return { videoKey, qualities };
  } finally {
    rl.close();
  }
}

async function resolveVideoSize(videoKey: string): Promise<number> {
  if (process.env.VIDEO_SIZE) {
    return Number(process.env.VIDEO_SIZE);
  }
  if (/^https?:\/\//i.test(videoKey)) {
    try {
      const res = await fetch(videoKey, { method: "HEAD" });
      const contentLength = res.headers.get("content-length");
      if (contentLength) {
        return Number(contentLength);
      }
    } catch {
      // Fall through to the 0 baseline below.
    }
  }
  return 0;
}

async function main(): Promise<void> {
  const config = loadServerConfig(process.env);
  const db = createDatabase(config.DATABASE_URL);

  const providerName = (
    resolveProviderName(undefined, process.env) ?? "local"
  ).toLowerCase();
  const isLocalProvider = providerName === "local";

  try {
    const rawArgs = process.argv.slice(2);
    const isExplicitCancel =
      rawArgs.includes("--cancel") ||
      rawArgs.some(
        (a) =>
          a.startsWith("--status=cancel") ||
          a.startsWith("--cancel-job=") ||
          a.startsWith("--cancel="),
      );

    let targetJobId = "";
    for (const arg of rawArgs) {
      if (
        arg.startsWith("--job-id=") ||
        arg.startsWith("--jobId=") ||
        arg.startsWith("--cancel-job=") ||
        arg.startsWith("--cancel=")
      ) {
        targetJobId = arg.split("=")[1]?.trim() || "";
      }
    }

    const hasExplicitFlags =
      rawArgs.length > 0 ||
      Boolean(process.env.VIDEO_KEY) ||
      Boolean(process.env.QUALITIES) ||
      Boolean(process.env.NON_INTERACTIVE);

    let selectedAction: "queue" | "cancel" = isExplicitCancel
      ? "cancel"
      : "queue";

    if (!isExplicitCancel && !hasExplicitFlags) {
      const rl = readline.createInterface({ input, output });
      try {
        console.info(`\nSelect action:`);
        console.info(`  1) Queue & trigger a new transcode job (default)`);
        console.info(
          `  2) Cancel an active or queued transcode job (with S3 cleanup)`,
        );
        const choice = (await rl.question(`Enter choice [1]: `)).trim();
        if (choice === "2" || choice.toLowerCase().startsWith("c")) {
          selectedAction = "cancel";
        }
      } finally {
        rl.close();
      }
    }

    if (selectedAction === "cancel") {
      const recentJobs = await db
        .selectFrom("video_jobs")
        .select(["id", "status", "video_key", "created_at"])
        .orderBy("created_at", "desc")
        .limit(5)
        .execute();

      if (!targetJobId && recentJobs.length > 0 && !hasExplicitFlags) {
        const rl = readline.createInterface({ input, output });
        try {
          console.info(`\nSelect job to cancel:`);
          recentJobs.forEach((job, idx) => {
            console.info(
              `  ${idx + 1}) [${job.status}] ${job.video_key} (ID: ${job.id})`,
            );
          });
          console.info(`  ${recentJobs.length + 1}) Enter custom Job ID...`);
          const ans = (await rl.question(`Enter choice [1]: `)).trim();
          const num = parseInt(ans, 10);
          if (num >= 1 && num <= recentJobs.length) {
            targetJobId = recentJobs[num - 1]!.id;
          } else if (num === recentJobs.length + 1) {
            targetJobId = (await rl.question(`Enter Job ID: `)).trim();
          } else {
            targetJobId = recentJobs[0]!.id;
          }
        } finally {
          rl.close();
        }
      }

      if (!targetJobId && recentJobs.length > 0) {
        targetJobId = recentJobs[0]!.id;
      }

      if (!targetJobId) {
        console.error("✘ No job found in database to cancel.");
        process.exitCode = 1;
        return;
      }

      console.info(
        `\n╔══════════════════════════════════════════════════════════════╗`,
      );
      console.info(
        `║     VeoLMS Video Job Cancellation & Storage Deletion         ║`,
      );
      console.info(
        `╚══════════════════════════════════════════════════════════════╝\n`,
      );
      if (isLocalProvider) {
        console.info(`[1/2] Cancelling Job [${targetJobId}] in database...`);
        await db
          .updateTable("video_jobs")
          .set({ status: "cancelled", updated_at: new Date() })
          .where("id", "=", targetJobId)
          .execute();
        console.info(`✔ Job [${targetJobId}] successfully marked CANCELLED in database.\n`);
        return;
      }

      console.info(
        `[1/2] Sending cancellation request for Job [${targetJobId}] to Lambda "${LAMBDA_NAME}"...`,
      );
      const cancelPayload = {
        jobId: targetJobId,
        status: "cancelled",
        deleteFiles: true,
      };

      const outFile = join(
        tmpdir(),
        `lambda-cancel-${targetJobId.slice(0, 8)}.json`,
      );
      const invokeArgs = [
        ...buildAwsCliArgs([
          "lambda",
          "invoke",
          "--function-name",
          LAMBDA_NAME,
          "--payload",
          JSON.stringify(cancelPayload),
          "--cli-binary-format",
          "raw-in-base64-out",
        ]),
        outFile,
      ];

      try {
        execFileSync("aws", invokeArgs, {
          stdio: "pipe",
          shell: process.platform === "win32",
        });
        const responseRaw = readFileSync(outFile, "utf-8").trim();
        unlinkSync(outFile);
        console.info(`✔ Cancellation successfully dispatched to Lambda.`);
        console.info(`  Response: ${responseRaw}\n`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`✘ Lambda cancel invoke failed: ${msg}`);
      }
      return;
    }

    const { videoKey: VIDEO_KEY, qualities: QUALITIES } =
      await resolveVideoKeyAndQualities();
    const jobId = randomUUID();
    const outputPrefix = `hls/test-${jobId.slice(0, 8)}/`;
    const videoSize = await resolveVideoSize(VIDEO_KEY);

    console.info(
      `\n╔══════════════════════════════════════════════════════════════╗`,
    );
    console.info(
      `║     VeoLMS ${isLocalProvider ? "Local" : "AWS"} Queue & Trigger (${isLocalProvider ? "Local Fleet Manager" : "Serverless Fleet Manager"})      ║`,
    );
    console.info(
      `╚══════════════════════════════════════════════════════════════╝\n`,
    );

    if (isLocalProvider) {
      await db
        .updateTable("video_jobs")
        .set({ status: "cancelled", updated_at: new Date() })
        .where("status", "in", ["queued", "provisioning", "processing"])
        .execute();
      await db
        .updateTable("workers")
        .set({ status: "terminated", updated_at: new Date() })
        .where("provider", "=", "local")
        .where("status", "in", [
          "pending",
          "provisioning",
          "starting",
          "ready",
          "processing",
        ])
        .execute();
    }

    console.info(`[1/3] Adding job to PostgreSQL database...`);
    console.info(`  Job ID:        ${jobId}`);
    console.info(`  Video Key:     ${VIDEO_KEY}`);
    console.info(`  Output Prefix: ${outputPrefix}`);
    console.info(`  Qualities:     ${QUALITIES.join(", ")}`);
    console.info(`  Video Size:    ${videoSize} bytes`);

    // Ensure a media_assets record exists so foreign key video_jobs.video_id -> media_assets.id is satisfied
    const existingMedia = await db
      .selectFrom("media_assets")
      .selectAll()
      .where("storage_key", "=", VIDEO_KEY)
      .executeTakeFirst();

    const videoId = existingMedia?.id ?? randomUUID();
    if (!existingMedia) {
      const ownerUser = await db
        .selectFrom("users")
        .select("id")
        .limit(1)
        .executeTakeFirst();

      let ownerId = ownerUser?.id;
      if (!ownerId) {
        ownerId = "00000000-0000-4000-8000-000000000001";
        await db
          .insertInto("users")
          .values({
            id: ownerId,
            email: "creator@veolms.org",
            username: "creator",
            display_name: "VeoLMS Creator",
            email_verified_at: new Date(),
          })
          .onConflict((oc) => oc.column("id").doNothing())
          .execute();
      }

      const filename = VIDEO_KEY.split(/[/\\]/).pop() || "video.mp4";
      await db
        .insertInto("media_assets")
        .values({
          id: videoId,
          owner_id: ownerId,
          type: "video",
          storage_provider: process.env.STORAGE_PROVIDER || "s3",
          storage_key: VIDEO_KEY,
          original_filename: filename,
          mime_type: "video/mp4",
          size_bytes: videoSize,
          status: "ready",
        })
        .execute();
    }

    // Check if an active job already exists for this video
    const existingActiveJob = await db
      .selectFrom("video_jobs")
      .selectAll()
      .where("video_id", "=", videoId)
      .where("status", "in", ["queued", "provisioning", "processing"])
      .orderBy("created_at", "desc")
      .executeTakeFirst();

    let actualJobId = jobId;
    let actualOutputPrefix = outputPrefix;

    if (existingActiveJob) {
      actualJobId = existingActiveJob.id;
      actualOutputPrefix = existingActiveJob.output_prefix;
      console.info(
        `✔ Found existing active job [${actualJobId}] in status "${existingActiveJob.status}". Reusing it.\n`,
      );
    } else {
      await db
        .insertInto("video_jobs")
        .values({
          id: jobId,
          video_id: videoId,
          status: "queued",
          video_key: VIDEO_KEY,
          output_prefix: outputPrefix,
          video_size: videoSize,
          qualities: QUALITIES,
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
    }

    if (isLocalProvider) {
      console.info(
        `[2/3] Starting Local Fleet Manager daemon to process job [${actualJobId}]...`,
      );

      const repoRoot = join(
        dirname(fileURLToPath(import.meta.url)),
        "..",
        "..",
        "..",
      );
      const defaultWorkerScript = join(
        repoRoot,
        "apps/media-worker/src/index.ts",
      );
      const workerScript = existsSync(defaultWorkerScript)
        ? defaultWorkerScript
        : undefined;

      // Cancel stale pending jobs from prior runs so the worker focuses on this job
      await db
        .updateTable("video_jobs")
        .set({ status: "cancelled", updated_at: new Date() })
        .where("status", "in", ["queued", "processing"])
        .where("id", "!=", actualJobId)
        .execute();

      const fleetConfig = loadFleetManagerConfig({
        ...process.env,
        PROVIDER: "LOCAL",
        POLL_INTERVAL_MS: 1000,
        HEARTBEAT_TIMEOUT_SECONDS: 90,
      });

      const provider = await resolveFleetProvider("local", {
        workerScriptPath: workerScript,
        cwd: repoRoot,
        defaultEnv: {
          DATABASE_URL: config.DATABASE_URL,
        },
      });

      const fleet = createFleetManager({
        provider,
        db,
        config: fleetConfig,
      });

      const abortController = new AbortController();
      const fleetLoopPromise = fleet.startServerfulLoop(abortController.signal);

      console.info(`[3/3] Watching job progress in database...`);
      const startTime = Date.now();
      let completed = false;

      while (!completed) {
        await new Promise((res) => setTimeout(res, 1000));

        const currentJob = await db
          .selectFrom("video_jobs")
          .select(["status", "worker_id", "error_message"])
          .where("id", "=", actualJobId)
          .executeTakeFirst();

        if (!currentJob) continue;

        if (currentJob.worker_id) {
          const monitoring = await db
            .selectFrom("worker_monitoring")
            .select(["progress_percent", "check_interval_sec"])
            .where("worker_id", "=", currentJob.worker_id)
            .executeTakeFirst();

          const progress = monitoring?.progress_percent ?? 0;
          process.stdout.write(
            `\r  [Progress] Status: ${currentJob.status} | Worker: ${currentJob.worker_id.slice(0, 8)} | Progress: ${Number(progress).toFixed(1)}%   `,
          );
        }

        if (currentJob.status === "completed") {
          completed = true;
          console.info("\n\n✔ Job successfully COMPLETED!");
          break;
        }

        if (currentJob.status === "failed") {
          abortController.abort();
          await fleetLoopPromise.catch(() => {});
          throw new Error(`Job FAILED: ${currentJob.error_message}`);
        }

        // Safety timeout: 600s
        if (Date.now() - startTime > 600000) {
          abortController.abort();
          await fleetLoopPromise.catch(() => {});
          throw new Error("Timeout: Job took longer than 600s");
        }
      }

      abortController.abort();
      await fleetLoopPromise.catch(() => {});

      // Verify generated HLS files on disk
      const cleanPrefix = actualOutputPrefix.replace(/^s3-bucket[/\\]/, "");
      const outputDir = resolve(repoRoot, "s3-bucket", cleanPrefix);
      if (existsSync(outputDir)) {
        console.info(`\n✔ Verified HLS output directory: ${outputDir}`);
        const masterPlaylist = join(outputDir, "master.m3u8");
        if (existsSync(masterPlaylist)) {
          console.info(`  - master.m3u8 found`);
        }
        for (const q of QUALITIES) {
          const qDir = join(outputDir, q);
          if (existsSync(qDir)) {
            console.info(`  - Rendition ${q} created`);
          }
        }
      }

      console.info("\n🎉 Local transcode pipeline completed successfully!\n");
      return;
    }

    console.info(
      `[2/3] Invoking ${IS_DIRECT_FLEET_MANAGER ? "Fleet Manager Lambda (direct)" : "Probe Lambda (metadata probe & forward)"} "${LAMBDA_NAME}" (region: ${REGION}${PROFILE ? `, profile: ${PROFILE}` : ""})...`,
    );
    const outFile = join(
      tmpdir(),
      `lambda-invoke-${actualJobId.slice(0, 8)}.json`,
    );
    const invokeArgs = [
      ...buildAwsCliArgs([
        "lambda",
        "invoke",
        "--function-name",
        LAMBDA_NAME,
        "--payload",
        JSON.stringify({
          action: "claim",
          jobId: actualJobId,
          videoId,
          videoKey: VIDEO_KEY,
          outputPrefix: actualOutputPrefix,
          qualities: QUALITIES,
          videoSize,
        }),
        "--cli-binary-format",
        "raw-in-base64-out",
      ]),
      outFile,
    ];

    try {
      // aws lambda invoke's own stdout JSON carries FunctionError when the
      // function threw unhandled — that's distinct from (and checked
      // before) the payload written to outFile, since a crash produces an
      // {errorMessage, errorType, trace} envelope there, not the
      // {success, ...} shape a normal response has.
      const invokeResultRaw = execFileSync("aws", invokeArgs, {
        stdio: "pipe",
        shell: process.platform === "win32",
      }).toString();
      const responseRaw = readFileSync(outFile, "utf-8").trim();
      unlinkSync(outFile);

      let invokeResult: Record<string, unknown> = {};
      try {
        invokeResult = JSON.parse(invokeResultRaw);
      } catch {
        // Non-JSON CLI output; fall through to inspecting the payload below.
      }

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

      const crashed =
        Boolean(invokeResult["FunctionError"]) ||
        typeof parsedPayload["errorMessage"] === "string";

      if (crashed) {
        console.error(
          `✘ Lambda function crashed (FunctionError: ${invokeResult["FunctionError"] ?? "unknown"}): ${
            parsedPayload["errorMessage"] ?? responseRaw
          }`,
        );
        process.exitCode = 1;
        return;
      }

      if (parsedPayload.success === false) {
        console.error(`✘ Lambda returned an error: ${parsedPayload.error}`);
        process.exitCode = 1;
        return;
      }

      console.info(`✔ Lambda executed successfully.`);
      if (parsedPayload.videoMetadata) {
        const meta = parsedPayload.videoMetadata as Record<string, unknown>;
        console.info(
          `  Video Probed:  ${meta.width}x${meta.height} (${meta.durationSeconds}s, ${meta.fps} fps, codec: ${meta.codec})`,
        );
      }

      const innerResponse =
        (parsedPayload.targetLambdaResponse as Record<string, unknown> | undefined) ??
        parsedPayload;

      const isClaimed = Boolean(innerResponse.jobClaimed || parsedPayload.jobClaimed);
      console.info(
        `  Claim Result:  ${isClaimed ? "Job Claimed & EC2 Worker Launched" : "No job claimed (at worker capacity or queue empty)"}`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`✘ Lambda invoke failed: ${msg}`);
      if (
        msg.includes("CreateOAuth2Token") ||
        msg.includes("InvalidClientTokenId") ||
        msg.includes("ExpiredToken") ||
        msg.includes("AuthFailure") ||
        msg.includes("UnrecognizedClientException")
      ) {
        console.error(`\n  💡 AWS Authentication Hint:`);
        console.error(
          `     Your AWS session or SSO credentials have expired or are not configured.`,
        );
        console.error(
          `     Run: aws sso login${PROFILE ? ` --profile ${PROFILE}` : ""} (or set AWS_ACCESS_KEY_ID & AWS_SECRET_ACCESS_KEY)`,
        );
      } else if (msg.includes("ResourceNotFoundException")) {
        console.error(`\n  💡 Lambda Not Found Hint:`);
        console.error(
          `     Function "${LAMBDA_NAME}" was not found in region "${REGION}".`,
        );
        console.error(
          `     Run "pnpm fleet:infra --provider=aws" to deploy the infrastructure.`,
        );
      }
      process.exitCode = 1;
      return;
    }

    console.info(`\n[3/3] Checking worker and EC2 instance status...`);
    // Poll for the worker_id to land instead of a single fixed-delay check
    // — Lambda's EC2 launch (spot capacity lookup, IAM propagation) can
    // take longer than a couple seconds to persist the workers row.
    let updatedJob:
      | {
          id: string;
          status: string;
          worker_id: string | null;
          error_message: string | null;
        }
      | undefined;
    const maxPollAttempts = 15;
    for (let attempt = 0; attempt < maxPollAttempts; attempt++) {
      updatedJob = await db
        .selectFrom("video_jobs")
        .select(["id", "status", "worker_id", "error_message"])
        .where("id", "=", actualJobId)
        .executeTakeFirst();
      if (updatedJob?.worker_id) break;
      await new Promise((r) => setTimeout(r, 1000));
    }

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
            const descArgs = buildAwsCliArgs([
              "ec2",
              "describe-instances",
              "--instance-ids",
              ec2InstanceId,
              "--output",
              "json",
            ]);
            const descOut = JSON.parse(
              execFileSync("aws", descArgs, {
                stdio: "pipe",
                shell: process.platform === "win32",
              }).toString(),
            );
            const instance = descOut.Reservations?.[0]?.Instances?.[0];
            if (instance) {
              const state = instance.State?.Name ?? "unknown";
              const publicIp = instance.PublicIpAddress;
              const privateIp = instance.PrivateIpAddress;
              const rawKeyName = instance.KeyName || process.env.KEY_NAME;
              const keyName =
                rawKeyName &&
                rawKeyName !== "null" &&
                rawKeyName !== "undefined" &&
                rawKeyName.trim() !== ""
                  ? rawKeyName.trim()
                  : null;

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
              console.info(
                `    Key Pair:          ${keyName || "(None — using EC2 Instance Connect / SSM)"}`,
              );

              if (publicIp && keyName) {
                const repoRoot = resolve(process.cwd(), "../..");
                const possibleKeys = [
                  join(process.cwd(), `${keyName}.pem`),
                  join(repoRoot, `${keyName}.pem`),
                  join(process.cwd(), "mykey.pem"),
                  join(repoRoot, "mykey.pem"),
                ];
                const foundKey = possibleKeys.find((k) => existsSync(k));
                const keyPath = foundKey ?? `${keyName}.pem`;
                const keyArg = `-i ${shellQuote(keyPath)}`;
                const target = `admin@${shellQuote(publicIp)}`;

                console.info(`\n  SSH Access to Worker:`);
                console.info(`    ssh ${keyArg} ${target}`);
                console.info(`\n  Live Worker Logs:`);
                console.info(
                  `    ssh ${keyArg} ${target} ${shellQuote("tail -f /var/log/veolms-bootstrap.log /var/log/veolms-worker.log")}`,
                );
              } else if (publicIp && !keyName) {
                console.info(`\n  Browser Terminal & AWS Console Connect:`);
                console.info(
                  `    AWS Console -> EC2 -> Instances -> ${ec2InstanceId} -> Connect -> EC2 Instance Connect`,
                );
                console.info(`\n  AWS Systems Manager (SSM) Session Manager:`);
                console.info(
                  `    aws ssm start-session --target ${ec2InstanceId} --region ${REGION}`,
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
    console.info(`  pnpm fleet:cli status ${actualJobId}`);
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
