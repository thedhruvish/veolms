import { randomUUID } from "node:crypto";
import { execFileSync, execSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as esbuild from "esbuild";
import { createDatabase } from "@veolms/database";
import { loadServerConfig } from "@veolms/config";
import type { VideoQualityLevel } from "@veolms/fleet-types";

const REGION = process.env.AWS_REGION || "us-east-1";
const S3_BUCKET = process.env.S3_BUCKET || "veo-lms-test";
const ROLE_NAME = "VeoLMSWorkerRole";
const INSTANCE_PROFILE_NAME = "VeoLMSWorkerInstanceProfile";
const LAMBDA_NAME = "veolms-fleet-manager";

function exec(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf-8", stdio: "pipe" }).trim();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Command failed: ${cmd}\n${message}`);
  }
}

// Uses execFileSync (no shell) so argument values — like a Postgres
// connection string that may contain quotes or other shell metacharacters
// — are passed to the `aws` process literally instead of being
// re-interpreted by /bin/sh.
function execFileArgs(cmd: string, args: readonly string[]): string {
  try {
    return execFileSync(cmd, [...args], { encoding: "utf-8", stdio: "pipe" }).trim();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Command failed: ${cmd} ${args.join(" ")}\n${message}`);
  }
}

function execSilent(cmd: string): boolean {
  try {
    execSync(cmd, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function ensureAwsInfrastructure(databaseUrl: string): Promise<string> {
  console.info("\n[1/5] Checking / Provisioning AWS Infrastructure...");

  // 1. Ensure IAM Role exists
  let roleArn: string = "";
  try {
    const roleJson = JSON.parse(
      exec(`aws iam get-role --role-name ${ROLE_NAME} --output json`),
    );
    roleArn = roleJson.Role.Arn;
    console.info(`  ✔ IAM Role already exists: ${ROLE_NAME}`);
  } catch {
    console.info(`  Creating IAM Role: ${ROLE_NAME}...`);
    const trustPolicy = JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: {
            Service: ["ec2.amazonaws.com", "lambda.amazonaws.com"],
          },
          Action: "sts:AssumeRole",
        },
      ],
    });
    const res = JSON.parse(
      exec(
        `aws iam create-role --role-name ${ROLE_NAME} --assume-role-policy-document '${trustPolicy}' --description "VeoLMS Role" --output json`,
      ),
    );
    roleArn = res.Role.Arn;

    exec(
      `aws iam attach-role-policy --role-name ${ROLE_NAME} --policy-arn arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy`,
    );
    exec(
      `aws iam attach-role-policy --role-name ${ROLE_NAME} --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore`,
    );
    exec(
      `aws iam attach-role-policy --role-name ${ROLE_NAME} --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole`,
    );

    const s3Policy = JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: [
            "s3:GetObject",
            "s3:PutObject",
            "s3:DeleteObject",
            "s3:ListBucket",
          ],
          Resource: [
            `arn:aws:s3:::${S3_BUCKET}`,
            `arn:aws:s3:::${S3_BUCKET}/*`,
          ],
        },
      ],
    });
    exec(
      `aws iam put-role-policy --role-name ${ROLE_NAME} --policy-name VeoLMSS3Access --policy-document '${s3Policy}'`,
    );

    const ec2Policy = JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: [
            "ec2:RunInstances",
            "ec2:TerminateInstances",
            "ec2:DescribeInstances",
            "ec2:DescribeInstanceStatus",
            "ec2:CreateTags",
            "ec2:RequestSpotInstances",
          ],
          Resource: "*",
        },
        {
          Effect: "Allow",
          Action: "iam:PassRole",
          Resource: roleArn,
        },
      ],
    });
    exec(
      `aws iam put-role-policy --role-name ${ROLE_NAME} --policy-name VeoLMSEC2WorkerManagement --policy-document '${ec2Policy}'`,
    );
    console.info(`  ✔ IAM Role created and configured.`);
  }

  // 2. Ensure Instance Profile exists
  try {
    exec(
      `aws iam get-instance-profile --instance-profile-name ${INSTANCE_PROFILE_NAME}`,
    );
    console.info(`  ✔ Instance Profile exists: ${INSTANCE_PROFILE_NAME}`);
  } catch {
    console.info(`  Creating Instance Profile: ${INSTANCE_PROFILE_NAME}...`);
    exec(
      `aws iam create-instance-profile --instance-profile-name ${INSTANCE_PROFILE_NAME}`,
    );
    exec(
      `aws iam add-role-to-instance-profile --instance-profile-name ${INSTANCE_PROFILE_NAME} --role-name ${ROLE_NAME}`,
    );
    console.info(`  ✔ Instance Profile created and attached to role.`);
  }

  // 3. Ensure EC2 Spot Service-Linked Role exists
  execSilent(
    `aws iam create-service-linked-role --aws-service-name spot.amazonaws.com --region ${REGION}`,
  );

  // 4. Ensure S3 Public Bucket Policy
  execSilent(
    `aws s3api put-public-access-block --bucket ${S3_BUCKET} --public-access-block-configuration "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false" --region ${REGION}`,
  );
  const publicPolicy = JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Sid: "PublicReadGetObject",
        Effect: "Allow",
        Principal: "*",
        Action: "s3:GetObject",
        Resource: `arn:aws:s3:::${S3_BUCKET}/*`,
      },
    ],
  });
  execSilent(
    `aws s3api put-bucket-policy --bucket ${S3_BUCKET} --policy '${publicPolicy}' --region ${REGION}`,
  );

  // 5. Build and upload standalone Media Worker bundle to S3
  console.info("  Building and uploading media-worker.js to S3...");
  const distWorkerDir = join(process.cwd(), "dist/worker");
  mkdirSync(distWorkerDir, { recursive: true });
  const workerOutfile = join(distWorkerDir, "media-worker.js");
  esbuild.buildSync({
    entryPoints: [join(process.cwd(), "apps/media-worker/src/index.ts")],
    bundle: true,
    platform: "node",
    target: "node22",
    format: "cjs",
    outfile: workerOutfile,
    logLevel: "silent",
  });
  exec(
    `aws s3 cp "${workerOutfile}" "s3://${S3_BUCKET}/bundles/media-worker.js" --region ${REGION}`,
  );
  console.info(
    `  ✔ Media Worker bundle uploaded to s3://${S3_BUCKET}/bundles/media-worker.js`,
  );

  // 6. Build and deploy AWS Lambda function
  console.info("  Building and deploying Lambda function...");
  const distLambdaDir = join(process.cwd(), "dist/lambda");
  mkdirSync(distLambdaDir, { recursive: true });
  const lambdaOutfile = join(distLambdaDir, "index.js");
  esbuild.buildSync({
    entryPoints: [
      join(process.cwd(), "packages/fleet-provider-aws/src/lambda.ts"),
    ],
    bundle: true,
    platform: "node",
    target: "node22",
    format: "cjs",
    outfile: lambdaOutfile,
    logLevel: "silent",
  });
  exec(`cd "${distLambdaDir}" && zip -q -9 function.zip index.js`);

  let lambdaExists = false;
  try {
    exec(
      `aws lambda get-function --function-name ${LAMBDA_NAME} --region ${REGION}`,
    );
    lambdaExists = true;
  } catch {
    lambdaExists = false;
  }

  const envVarsArg = `Variables={DATABASE_URL="${databaseUrl}",STORAGE_PROVIDER="s3",S3_BUCKET="${S3_BUCKET}",EC2_IAM_INSTANCE_PROFILE="${INSTANCE_PROFILE_NAME}",EC2_USE_SPOT="true",PROVIDER="aws"}`;

  if (lambdaExists) {
    exec(
      `aws lambda update-function-code --function-name ${LAMBDA_NAME} --zip-file fileb://${distLambdaDir}/function.zip --region ${REGION}`,
    );
    execFileArgs("aws", [
      "lambda",
      "update-function-configuration",
      "--function-name",
      LAMBDA_NAME,
      "--environment",
      envVarsArg,
      "--timeout",
      "900",
      "--memory-size",
      "512",
      "--region",
      REGION,
    ]);
    console.info(`  ✔ Updated existing Lambda function: ${LAMBDA_NAME}`);
  } else {
    // Wait for IAM role propagation if newly created
    console.info("  Creating Lambda function...");
    let created = false;
    for (let attempt = 1; attempt <= 6; attempt++) {
      try {
        execFileArgs("aws", [
          "lambda",
          "create-function",
          "--function-name",
          LAMBDA_NAME,
          "--runtime",
          "nodejs22.x",
          "--role",
          roleArn,
          "--handler",
          "index.handler",
          "--zip-file",
          `fileb://${distLambdaDir}/function.zip`,
          "--timeout",
          "900",
          "--memory-size",
          "512",
          "--environment",
          envVarsArg,
          "--region",
          REGION,
        ]);
        created = true;
        break;
      } catch {
        console.info(`  Waiting for IAM role propagation (${attempt}/6)...`);
        exec("sleep 4");
      }
    }
    if (!created) {
      throw new Error(
        "Failed to create Lambda function after multiple retries.",
      );
    }
    console.info(`  ✔ Created Lambda function: ${LAMBDA_NAME}`);
  }

  return roleArn;
}

async function main() {
  const serverConfig = loadServerConfig(process.env);
  const db = createDatabase(serverConfig.DATABASE_URL);

  console.info(
    "\n╔══════════════════════════════════════════════════════════════╗",
  );
  console.info(
    "║     AWS SERVERLESS TRANSCODE TEST (240p, 360p, 720p on S3)   ║",
  );
  console.info(
    "╚══════════════════════════════════════════════════════════════╝",
  );

  await ensureAwsInfrastructure(serverConfig.DATABASE_URL);

  const jobId = randomUUID();
  const videoKey = "raw/video.mp4";
  const outputPrefix = "hls/test-video/";
  const qualities: VideoQualityLevel[] = ["240p", "360p", "720p"];

  console.info(`\n  Job ID:            ${jobId}`);
  console.info(`  S3 Bucket:         ${S3_BUCKET}`);
  console.info(`  S3 Source Video:   s3://${S3_BUCKET}/${videoKey}`);
  console.info(`  S3 HLS Output:     s3://${S3_BUCKET}/${outputPrefix}`);
  console.info(`  Target Qualities:  ${qualities.join(", ")}`);
  console.info(`  PostgreSQL DB:     Neon Cloud Database`);
  console.info(`  Fleet Manager:     AWS Lambda (${LAMBDA_NAME})`);
  console.info(
    "────────────────────────────────────────────────────────────────\n",
  );

  // Step 2: Queue job into database
  console.info(
    `[2/5] Queueing job [${jobId}] into PostgreSQL with qualities: [${qualities.join(", ")}]...`,
  );
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
          storageGb: 15,
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
  console.info(`✔ Job [${jobId}] successfully QUEUED.\n`);

  // Step 3: Invoke Lambda
  console.info(`[3/5] Invoking AWS Lambda function (${LAMBDA_NAME})...`);
  const lambdaPayload = JSON.stringify({ action: "claim", jobId });
  exec(
    `aws lambda invoke --function-name ${LAMBDA_NAME} --payload '${lambdaPayload}' --cli-binary-format raw-in-base64-out --region ${REGION} /tmp/lambda-test-res.json`,
  );
  const responseBody = readFileSync("/tmp/lambda-test-res.json", "utf-8");
  console.info(`✔ Lambda response: ${responseBody.trim()}\n`);

  // Step 4: Monitor transcode execution
  console.info("[4/5] Monitoring AWS EC2 Worker transcoding progress...");
  let isDone = false;
  let attempts = 0;
  const maxWaitAttempts = 60; // 5 minutes max

  while (!isDone && attempts < maxWaitAttempts) {
    await new Promise((r) => setTimeout(r, 5000));
    attempts++;

    const job = await db
      .selectFrom("jobs")
      .selectAll()
      .where("id", "=", jobId)
      .executeTakeFirst();

    if (!job) break;

    const worker = job.worker_id
      ? await db
          .selectFrom("workers")
          .selectAll()
          .where("id", "=", job.worker_id)
          .executeTakeFirst()
      : null;

    const workerInfo = worker
      ? `Worker [${worker.id.slice(0, 8)}] (${worker.status}, EC2: ${worker.provider_worker_id})`
      : "Provisioning EC2...";

    const progressEvt = await db
      .selectFrom("worker_events")
      .selectAll()
      .where("job_id", "=", jobId)
      .where("event", "=", "PROGRESS_UPDATED")
      .orderBy("created_at", "desc")
      .executeTakeFirst();

    const progressMeta = progressEvt?.metadata as
      Record<string, unknown> | undefined;
    const progressPercent =
      progressMeta?.progressPercent !== undefined
        ? `${Number(progressMeta.progressPercent).toFixed(1)}%`
        : "Starting...";

    process.stdout.write(
      `\r  [${attempts * 5}s] Status: ${job.status} | ${workerInfo} | Progress: ${progressPercent}   `,
    );

    if (job.status === "COMPLETED") {
      isDone = true;
      console.info("\n\n✔ Job COMPLETED successfully in AWS!");
      break;
    }

    if (job.status === "FAILED") {
      isDone = true;
      console.error(`\n\n✘ Job FAILED: ${job.error_message}`);
      break;
    }
  }

  // Step 5: Verify playlists on S3
  console.info("\n[5/5] Verifying HLS Renditions & Playlists on Public S3...");
  const s3BaseUrl = `https://${S3_BUCKET}.s3.${REGION}.amazonaws.com/${outputPrefix}`;

  console.info(`\n  📄 Master Playlist:  ${s3BaseUrl}master.m3u8`);
  for (const q of qualities) {
    console.info(`  🎥 ${q.padEnd(4)} Rendition:  ${s3BaseUrl}${q}/${q}.m3u8`);
  }

  try {
    const s3Files = exec(
      `aws s3 ls s3://${S3_BUCKET}/${outputPrefix} --recursive --region ${REGION}`,
    );
    console.info(`\n✔ S3 Artifacts Uploaded:\n${s3Files}`);
  } catch (err: unknown) {
    console.warn("Could not list S3 files:", err);
  }

  console.info("\n╔══════════════════════════════════════════════════════╗");
  console.info(
    "║           🎉 ALL AWS RENDITIONS VERIFIED & COMPLETE!         ║",
  );
  console.info("╚══════════════════════════════════════════════════════╝\n");

  await db.destroy();
}

main().catch((err) => {
  console.error("\n❌ AWS pipeline test error:", err);
  process.exit(1);
});
