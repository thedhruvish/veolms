/**
 * VeoLMS AWS Infrastructure Setup
 *
 * Interactive CLI that provisions all required AWS resources for the
 * Fleet Manager and Media Worker pipeline. Lives inside
 * @veolms/fleet-provider-aws so all AWS-specific concerns stay
 * isolated in one package.
 *
 * Dispatched via: apps/fleet-manager/src/infra.ts
 * Triggered by:   pnpm fleet:infra  (when FLEET_PROVIDER=aws)
 *
 * Resources created:
 *  - IAM Role + Instance Profile for EC2 workers
 *  - (Optional) Lambda function + CloudWatch log group (serverless mode)
 *  - (Optional) S3 bucket permission on EC2 role
 *  - CloudWatch log groups for worker and fleet logs
 *  - Per-app .env files: apps/fleet-manager/.env + apps/media-worker/.env
 */

import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import * as fs from "node:fs/promises";
import * as fsSync from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

import {
  IAMClient,
  CreateRoleCommand,
  AttachRolePolicyCommand,
  CreateInstanceProfileCommand,
  AddRoleToInstanceProfileCommand,
  PutRolePolicyCommand,
  GetRoleCommand,
} from "@aws-sdk/client-iam";
import {
  LambdaClient,
  CreateFunctionCommand,
  GetFunctionCommand,
  Runtime,
  PackageType,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
} from "@aws-sdk/client-lambda";
import {
  CloudWatchLogsClient,
  CreateLogGroupCommand,
  DescribeLogGroupsCommand,
  PutRetentionPolicyCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import {
  S3Client,
  HeadBucketCommand,
  GetBucketLocationCommand,
} from "@aws-sdk/client-s3";
import {
  bold,
  cyan,
  dim,
  green,
  red,
  yellow,
} from "@veolms/fleet-types/terminal";

import { checkAwsCredentials } from "./aws-cli-check.ts";

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLE_NAME = "VeoLMSWorkerRole";
const INSTANCE_PROFILE_NAME = "VeoLMSWorkerInstanceProfile";
const LAMBDA_FUNCTION_NAME = "veolms-fleet-manager";
const LOG_GROUP_WORKERS = "/veolms/workers";
const LOG_GROUP_FLEET = "/veolms/fleet-manager";
const LOG_RETENTION_DAYS = 30;
const LOCALSTACK_DOCKER_AMI_ID = "ami-df5de72bdb3b3";

// ─── Types ────────────────────────────────────────────────────────────────────

type TargetEnv = "aws" | "localstack";
type FleetMode = "serverless" | "serverful";
type StorageProvider = "s3" | "other";
type CredentialMode = "automatic" | "manual";
type BootMode = "fresh" | "ami";
type PricingModel = "spot" | "on-demand";

const DEFAULT_LOCALSTACK_ENDPOINT = "http://localhost.localstack.cloud:4566";

interface SetupAnswers {
  readonly targetEnv: TargetEnv;
  readonly endpointUrl: string | null;
  readonly region: string;
  readonly accountId: string;
  readonly databaseUrl: string;
  readonly fleetMode: FleetMode;
  readonly storageProvider: StorageProvider;
  readonly s3BucketName: string | null;
  readonly s3CredentialMode: CredentialMode | null;
  readonly allowedInstanceTypes: readonly string[];
  readonly bootMode: BootMode;
  readonly maxWorkers: number;
  readonly useSpot: boolean;
}

interface SetupResult {
  readonly workerRoleArn: string;
  readonly instanceProfileArn: string;
  readonly lambdaFunctionArn: string | null;
  readonly logGroupWorkers: string;
  readonly logGroupFleet: string;
  readonly s3BucketName: string | null;
}

// ─── Terminal Helpers ─────────────────────────────────────────────────────────

function banner(): void {
  console.log(`
${bold(cyan("╔══════════════════════════════════════════════════════╗"))}
${bold(cyan("║"))}        ${bold("VeoLMS AWS Infrastructure Setup")}             ${bold(cyan("║"))}
${bold(cyan("║"))}   Fleet Manager + Media Worker EC2 Transcoding Fleet ${bold(cyan("║"))}
${bold(cyan("╚══════════════════════════════════════════════════════╝"))}
`);
}

function step(n: number, total: number, title: string): void {
  console.log(`\n${bold(cyan(`[${n}/${total}]`))} ${bold(title)}`);
  console.log(dim("─".repeat(52)));
}

function ok(msg: string): void {
  console.log(`  ${green("✔")} ${msg}`);
}
function info(msg: string): void {
  console.log(`  ${cyan("ℹ")} ${msg}`);
}
function warn(msg: string): void {
  console.log(`  ${yellow("⚠")} ${msg}`);
}

async function ask(
  rl: readline.Interface,
  question: string,
  defaultVal?: string,
): Promise<string> {
  const hint = defaultVal !== undefined ? dim(` (default: ${defaultVal})`) : "";
  const answer = await rl.question(`  ${bold("?")} ${question}${hint}: `);
  const trimmed = answer.trim();
  return trimmed === "" && defaultVal !== undefined ? defaultVal : trimmed;
}

async function askChoice<T extends string>(
  rl: readline.Interface,
  question: string,
  choices: ReadonlyArray<{ readonly label: string; readonly value: T }>,
  defaultIndex = 0,
): Promise<T> {
  console.log(`  ${bold("?")} ${question}`);
  choices.forEach((c, i) => {
    const marker = i === defaultIndex ? green("→") : " ";
    console.log(`    ${marker} ${bold(`${i + 1}.`)} ${c.label}`);
  });
  const answer = await rl.question(
    `  Enter number ${dim(`(default: ${defaultIndex + 1})`)}: `,
  );
  const trimmed = answer.trim();
  const num = trimmed === "" ? defaultIndex + 1 : parseInt(trimmed, 10);
  const choice = choices[num - 1];
  if (!choice) {
    warn(`Invalid choice. Using default: ${choices[defaultIndex]!.label}`);
    return choices[defaultIndex]!.value;
  }
  return choice.value;
}

// ─── AWS Resource Provisioners ────────────────────────────────────────────────

async function createRole(iam: IAMClient): Promise<string> {
  info(`Creating IAM role ${bold(ROLE_NAME)}...`);

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

  const createResult = await iam.send(
    new CreateRoleCommand({
      RoleName: ROLE_NAME,
      AssumeRolePolicyDocument: trustPolicy,
      Description:
        "VeoLMS EC2 Worker Role - CloudWatch Logs, SSM, and optional S3 access.",
      Tags: [
        { Key: "ManagedBy", Value: "veolms-infra-setup" },
        { Key: "Project", Value: "VeoLMS" },
      ],
    }),
  );

  const roleArn = createResult.Role?.Arn;
  if (!roleArn) throw new Error("Failed to get ARN for created IAM role");

  ok(`Created IAM role: ${bold(ROLE_NAME)}`);
  return roleArn;
}

export async function checkOrCreateRole(
  iam: IAMClient,
  useS3: boolean,
  s3BucketName: string | null,
): Promise<string> {
  let roleArn: string;

  try {
    const existing = await iam.send(
      new GetRoleCommand({ RoleName: ROLE_NAME }),
    );
    if (existing.Role?.Arn) {
      ok(`IAM role ${bold(ROLE_NAME)} already exists — reusing.`);
      roleArn = existing.Role.Arn;
    } else {
      roleArn = await createRole(iam);
    }
  } catch {
    roleArn = await createRole(iam);
  }

  // Policies are re-applied on every run (not just at creation) so a
  // reused role from an earlier setup still picks up permission changes
  // — e.g. a new inline statement added since that role was first created.
  // Attach/PutRolePolicy calls are idempotent upserts, safe to repeat.

  // Always attach: CloudWatch Logs + SSM + Lambda basic execution managed
  // policies. These are independent, so run them concurrently.
  await Promise.all([
    iam.send(
      new AttachRolePolicyCommand({
        RoleName: ROLE_NAME,
        PolicyArn: "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy",
      }),
    ),
    iam.send(
      new AttachRolePolicyCommand({
        RoleName: ROLE_NAME,
        PolicyArn: "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore",
      }),
    ),
    iam.send(
      new AttachRolePolicyCommand({
        RoleName: ROLE_NAME,
        PolicyArn:
          "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
      }),
    ),
  ]);
  ok("Attached CloudWatch + SSM + Lambda managed policies");

  // Conditionally add S3 access
  if (useS3 && s3BucketName) {
    const s3Policy = JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "VeoLMSS3Access",
          Effect: "Allow",
          Action: [
            "s3:GetObject",
            "s3:PutObject",
            "s3:DeleteObject",
            "s3:ListBucket",
          ],
          Resource: [
            `arn:aws:s3:::${s3BucketName}`,
            `arn:aws:s3:::${s3BucketName}/*`,
          ],
        },
      ],
    });

    await iam.send(
      new PutRolePolicyCommand({
        RoleName: ROLE_NAME,
        PolicyName: "VeoLMSS3BucketAccess",
        PolicyDocument: s3Policy,
      }),
    );
    ok(`Attached S3 inline policy for bucket ${bold(s3BucketName)}`);
  } else {
    info("Skipping S3 policy — storage provider is not S3.");
  }

  // Always attach EC2 worker provisioning and IAM PassRole permissions
  const ec2ControlPolicy = JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Sid: "EC2WorkerControl",
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
        Sid: "PassWorkerRole",
        Effect: "Allow",
        Action: "iam:PassRole",
        Resource: roleArn,
      },
      {
        // Read-only access to AWS's public Debian AMI parameters, so the
        // provider can resolve the current Debian AMI ID at launch time
        // instead of a hardcoded one. These parameters live under an
        // AWS-managed account, hence the account-less resource ARN.
        Sid: "ResolveDebianAmi",
        Effect: "Allow",
        Action: "ssm:GetParameter",
        Resource: "arn:aws:ssm:*::parameter/aws/service/debian/*",
      },
    ],
  });

  await iam.send(
    new PutRolePolicyCommand({
      RoleName: ROLE_NAME,
      PolicyName: "VeoLMSEC2WorkerManagement",
      PolicyDocument: ec2ControlPolicy,
    }),
  );
  ok("Attached EC2 worker control + PassRole inline policy");

  return roleArn;
}

export async function createInstanceProfile(
  iam: IAMClient,
  roleArn: string,
): Promise<string> {
  try {
    const createProfile = await iam.send(
      new CreateInstanceProfileCommand({
        InstanceProfileName: INSTANCE_PROFILE_NAME,
        Tags: [{ Key: "ManagedBy", Value: "veolms-infra-setup" }],
      }),
    );
    const profileArn =
      createProfile.InstanceProfile?.Arn ??
      `arn:aws:iam::unknown:instance-profile/${INSTANCE_PROFILE_NAME}`;

    await iam.send(
      new AddRoleToInstanceProfileCommand({
        InstanceProfileName: INSTANCE_PROFILE_NAME,
        RoleName: ROLE_NAME,
      }),
    );
    ok(`Created instance profile ${bold(INSTANCE_PROFILE_NAME)}`);
    return profileArn;
  } catch (err: unknown) {
    // AWS SDK v3 puts the exception type on `.name`
    // ("EntityAlreadyExistsException"); LocalStack's message text for this
    // case doesn't contain "EntityAlreadyExists" at all ("Instance Profile
    // ... already exists."), so a message-substring check alone misses it
    // there while still matching real AWS.
    const name = err instanceof Error ? err.name : "";
    const msg = err instanceof Error ? err.message : String(err);
    if (
      name === "EntityAlreadyExistsException" ||
      /already exists/i.test(msg)
    ) {
      ok(
        `Instance profile ${bold(INSTANCE_PROFILE_NAME)} already exists — reusing.`,
      );
      const accountId = roleArn.split(":")[4] ?? "unknown";
      return `arn:aws:iam::${accountId}:instance-profile/${INSTANCE_PROFILE_NAME}`;
    }
    throw err;
  }
}

async function ensureLogGroup(
  cw: CloudWatchLogsClient,
  logGroupName: string,
): Promise<void> {
  const existing = await cw.send(
    new DescribeLogGroupsCommand({ logGroupNamePrefix: logGroupName }),
  );
  const found = existing.logGroups?.find(
    (g) => g.logGroupName === logGroupName,
  );

  if (found) {
    ok(`Log group ${bold(logGroupName)} already exists — reusing.`);
    return;
  }

  await cw.send(new CreateLogGroupCommand({ logGroupName }));
  await cw.send(
    new PutRetentionPolicyCommand({
      logGroupName,
      retentionInDays: LOG_RETENTION_DAYS,
    }),
  );
  ok(
    `Created log group ${bold(logGroupName)} (${LOG_RETENTION_DAYS}d retention)`,
  );
}

async function checkS3Bucket(
  region: string,
  bucketName: string,
): Promise<"exists" | "not-found" | "no-access"> {
  const s3 = new S3Client({ region });
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucketName }));
    const loc = await s3.send(
      new GetBucketLocationCommand({ Bucket: bucketName }),
    );
    const bucketRegion = loc.LocationConstraint ?? "us-east-1";
    if (bucketRegion !== region) {
      warn(
        `Bucket ${bold(bucketName)} is in region ${bold(bucketRegion)}, you selected ${bold(region)}.`,
      );
      warn(
        "Workers will cross-region to access S3 — consider moving the bucket.",
      );
    }
    return "exists";
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("NoSuchBucket") || msg.includes("404")) return "not-found";
    if (msg.includes("403") || msg.includes("Forbidden")) return "no-access";
    return "not-found";
  }
}

/**
 * Creates a minimal valid ZIP buffer containing an index.js Lambda handler.
 * Uses only Node.js built-ins — no external zip library required.
 */
function createPlaceholderLambdaZip(): Uint8Array {
  const encoder = new TextEncoder();
  const jsContent = encoder.encode(
    `exports.handler = async (event) => {
  console.log('[veolms-fleet-manager] Lambda invoked', JSON.stringify(event));
  return { statusCode: 200, body: 'VeoLMS Fleet Manager — serverless mode' };
};`,
  );
  const fileName = encoder.encode("index.js");

  const now = new Date();
  const dosDate =
    (((now.getFullYear() - 1980) << 9) |
      ((now.getMonth() + 1) << 5) |
      now.getDate()) >>>
    0;
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5)) >>> 0;

  const localHeader = new Uint8Array(30 + fileName.length);
  const lhView = new DataView(localHeader.buffer);
  lhView.setUint32(0, 0x04034b50, true);
  lhView.setUint16(4, 20, true);
  lhView.setUint16(6, 0, true);
  lhView.setUint16(8, 0, true);
  lhView.setUint16(10, dosTime, true);
  lhView.setUint16(12, dosDate, true);
  lhView.setUint32(14, 0, true);
  lhView.setUint32(18, jsContent.length, true);
  lhView.setUint32(22, jsContent.length, true);
  lhView.setUint16(26, fileName.length, true);
  lhView.setUint16(28, 0, true);
  localHeader.set(fileName, 30);

  const centralDir = new Uint8Array(46 + fileName.length);
  const cdView = new DataView(centralDir.buffer);
  cdView.setUint32(0, 0x02014b50, true);
  cdView.setUint16(4, 20, true);
  cdView.setUint16(6, 20, true);
  cdView.setUint16(8, 0, true);
  cdView.setUint16(10, 0, true);
  cdView.setUint16(12, dosTime, true);
  cdView.setUint16(14, dosDate, true);
  cdView.setUint32(16, 0, true);
  cdView.setUint32(20, jsContent.length, true);
  cdView.setUint32(24, jsContent.length, true);
  cdView.setUint16(28, fileName.length, true);
  cdView.setUint32(42, 0, true);
  centralDir.set(fileName, 46);

  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(8, 1, true);
  eocdView.setUint16(10, 1, true);
  eocdView.setUint32(12, centralDir.length, true);
  eocdView.setUint32(16, localHeader.length + jsContent.length, true);

  const total = new Uint8Array(
    localHeader.length + jsContent.length + centralDir.length + eocd.length,
  );
  let offset = 0;
  total.set(localHeader, offset);
  offset += localHeader.length;
  total.set(jsContent, offset);
  offset += jsContent.length;
  total.set(centralDir, offset);
  offset += centralDir.length;
  total.set(eocd, offset);
  return total;
}

function buildLambdaBundleZip(): Uint8Array {
  try {
    const lambdaSource = fileURLToPath(
      new URL("../lambda.ts", import.meta.url),
    );
    const distDir = path.join(process.cwd(), "dist/lambda");
    if (!fsSync.existsSync(distDir)) {
      fsSync.mkdirSync(distDir, { recursive: true });
    }
    const outfile = path.join(distDir, "index.js");
    esbuild.buildSync({
      entryPoints: [lambdaSource],
      bundle: true,
      platform: "node",
      target: "node22",
      format: "cjs",
      outfile,
      logLevel: "silent",
    });
    const zipPath = path.join(distDir, "function.zip");
    execSync(`cd "${distDir}" && zip -q -9 function.zip index.js`, {
      stdio: "pipe",
    });
    return fsSync.readFileSync(zipPath);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    warn(
      `Could not build full Lambda bundle automatically (${msg}). Falling back to placeholder.`,
    );
    return createPlaceholderLambdaZip();
  }
}

export function buildAndUploadWorkerBundle(
  s3BucketName: string,
  region: string,
): void {
  try {
    // Resolved relative to this module's own location — not process.cwd() —
    // since callers invoke this via `pnpm --filter`, which sets cwd to the
    // fleet-manager package directory, not the repo root. A cwd-relative
    // path here silently resolved to a non-existent file and the bundle
    // was never uploaded, with no error at all (the existsSync guard below
    // just skipped everything silently).
    const repoRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
      "..",
      "..",
      "..",
    );
    const workerSource = path.join(repoRoot, "apps/media-worker/src/index.ts");
    if (fsSync.existsSync(workerSource)) {
      const distDir = path.join(repoRoot, "dist/worker");
      if (!fsSync.existsSync(distDir)) {
        fsSync.mkdirSync(distDir, { recursive: true });
      }
      const outfile = path.join(distDir, "media-worker.js");
      esbuild.buildSync({
        entryPoints: [workerSource],
        bundle: true,
        platform: "node",
        target: "node22",
        format: "cjs",
        outfile,
        logLevel: "silent",
      });
      execSync(
        `aws s3 cp "${outfile}" "s3://${s3BucketName}/bundles/media-worker.js" --region "${region}"`,
        { stdio: "pipe" },
      );
      ok(
        `Bundled and uploaded media worker to ${bold(`s3://${s3BucketName}/bundles/media-worker.js`)}`,
      );
    } else {
      warn(
        `Media worker source not found at ${workerSource} — skipping bundle upload.`,
      );
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    warn(`Could not upload worker bundle to S3: ${msg}`);
  }
}

async function updateExistingLambda(
  lambda: LambdaClient,
  roleArn: string,
  envVars: Readonly<Record<string, string>>,
  functionArn: string,
): Promise<string> {
  ok(`Lambda function ${bold(LAMBDA_FUNCTION_NAME)} already exists — updating.`);

  const lambdaZip = buildLambdaBundleZip();
  await lambda.send(
    new UpdateFunctionCodeCommand({
      FunctionName: LAMBDA_FUNCTION_NAME,
      ZipFile: lambdaZip,
    }),
  );
  await waitUntilFunctionUpdated(lambda);

  await lambda.send(
    new UpdateFunctionConfigurationCommand({
      FunctionName: LAMBDA_FUNCTION_NAME,
      Role: roleArn,
      Environment: {
        Variables: {
          LOG_LEVEL: "info",
          FLEET_MODE: "serverless",
          ...envVars,
        },
      },
    }),
  );
  ok(`Updated code + configuration for ${bold(LAMBDA_FUNCTION_NAME)}`);
  return functionArn;
}

async function waitUntilFunctionUpdated(lambda: LambdaClient): Promise<void> {
  // Code/config updates apply asynchronously (LastUpdateStatus goes
  // InProgress -> Successful); a second update issued while one is still
  // in flight is rejected with ResourceConflictException, so the
  // configuration update below must wait for the code update to land.
  for (let attempt = 0; attempt < 15; attempt++) {
    const res = await lambda.send(
      new GetFunctionCommand({ FunctionName: LAMBDA_FUNCTION_NAME }),
    );
    if (res.Configuration?.LastUpdateStatus !== "InProgress") return;
    await new Promise((r) => setTimeout(r, 2000));
  }
}

async function setupLambda(
  region: string,
  roleArn: string,
  envVars: Readonly<Record<string, string>>,
): Promise<string | null> {
  const lambda = new LambdaClient({ region });

  try {
    const existing = await lambda.send(
      new GetFunctionCommand({ FunctionName: LAMBDA_FUNCTION_NAME }),
    );
    if (existing.Configuration?.FunctionArn) {
      return await updateExistingLambda(
        lambda,
        roleArn,
        envVars,
        existing.Configuration.FunctionArn,
      );
    }
  } catch {
    // Doesn't exist — create it
  }

  info(
    `Building and creating Lambda function ${bold(LAMBDA_FUNCTION_NAME)}...`,
  );
  const lambdaZip = buildLambdaBundleZip();

  // IAM role might take a few seconds to propagate for Lambda assumption
  const maxRetries = 5;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const created = await lambda.send(
        new CreateFunctionCommand({
          FunctionName: LAMBDA_FUNCTION_NAME,
          Runtime: Runtime.nodejs22x,
          Role: roleArn,
          Handler: "index.handler",
          Code: { ZipFile: lambdaZip },
          PackageType: PackageType.Zip,
          Description:
            "VeoLMS Fleet Manager - serverless control plane for video transcoding jobs",
          Timeout: 900,
          MemorySize: 512,
          Environment: {
            Variables: {
              LOG_LEVEL: "info",
              FLEET_MODE: "serverless",
              ...envVars,
            },
          },
          Tags: {
            ManagedBy: "veolms-infra-setup",
            Project: "VeoLMS",
          },
          LoggingConfig: {
            LogFormat: "JSON",
            LogGroup: LOG_GROUP_FLEET,
          },
        }),
      );
      const fnArn = created.FunctionArn ?? null;
      if (fnArn) ok(`Created Lambda function ${bold(LAMBDA_FUNCTION_NAME)}`);
      return fnArn;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // AWS SDK v3 puts the exception type on `.name` (e.g.
      // "InvalidParameterValueException"), not embedded in `.message`.
      const name = err instanceof Error ? err.name : "";
      if (
        (msg.includes("cannot be assumed by Lambda") ||
          name === "InvalidParameterValueException") &&
        attempt < maxRetries
      ) {
        info(
          `Waiting for IAM role propagation (attempt ${attempt}/${maxRetries})...`,
        );
        await new Promise((r) => setTimeout(r, 4000));
        continue;
      }
      warn(`Could not create Lambda function: ${msg}`);
      warn(
        "Deploy the fleet-manager Lambda manually after building the bundle.",
      );
      return null;
    }
  }
  return null;
}

// ─── Env File Writer ──────────────────────────────────────────────────────────

async function writeEnvFile(
  filePath: string,
  vars: Readonly<Record<string, string>>,
): Promise<void> {
  const lines = [
    "# Generated by VeoLMS AWS Infrastructure Setup",
    `# Run: pnpm fleet:infra  to regenerate`,
    "",
    ...Object.entries(vars).map(([k, v]) => `${k}="${v}"`),
    "",
  ];
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, lines.join("\n"), "utf-8");
  ok(`Written ${bold(path.relative(process.cwd(), filePath))}`);
}

async function generateEnvFiles(
  answers: SetupAnswers,
  result: SetupResult,
  repoRoot: string,
): Promise<void> {
  // apps/fleet-manager/.env
  const fleetEnv: Record<string, string> = {
    DATABASE_URL: answers.databaseUrl,
    AWS_REGION: answers.region,
    FLEET_MODE: answers.fleetMode,
    FLEET_PROVIDER: "aws",
    EC2_IAM_INSTANCE_PROFILE: INSTANCE_PROFILE_NAME,
    EC2_USE_SPOT: String(answers.useSpot),
    EC2_BOOT_MODE: answers.bootMode,
    // Read by apps/fleet-manager (provider-agnostic — it's the number of
    // concurrent workers, not something EC2-specific), so this key must
    // match what @veolms/fleet-provider-local's setup writes too.
    MAX_WORKERS: String(answers.maxWorkers),
    EC2_ALLOWED_INSTANCE_TYPES: answers.allowedInstanceTypes.join(","),
    WORKER_LOG_GROUP: result.logGroupWorkers,
    FLEET_LOG_GROUP: result.logGroupFleet,
    STORAGE_PROVIDER: answers.storageProvider,
  };

  if (answers.s3BucketName) {
    fleetEnv["S3_BUCKET_NAME"] = answers.s3BucketName;
  }
  if (result.lambdaFunctionArn) {
    fleetEnv["LAMBDA_FUNCTION_ARN"] = result.lambdaFunctionArn;
  }
  if (answers.targetEnv === "localstack" && answers.endpointUrl) {
    fleetEnv["AWS_ENDPOINT_URL"] = answers.endpointUrl;
    fleetEnv["EC2_VM_MANAGER"] = "docker";
    fleetEnv["AMI_ID"] = LOCALSTACK_DOCKER_AMI_ID;
    fleetEnv["AWS_ACCESS_KEY_ID"] = "test";
    fleetEnv["AWS_SECRET_ACCESS_KEY"] = "test";
  }

  await writeEnvFile(
    path.join(repoRoot, "apps", "fleet-manager", ".env"),
    fleetEnv,
  );

  // apps/media-worker/.env
  const workerEnv: Record<string, string> = {
    DATABASE_URL: answers.databaseUrl,
    AWS_REGION: answers.region,
    FLEET_PROVIDER: "aws",
    WORKER_LOG_GROUP: result.logGroupWorkers,
    STORAGE_PROVIDER: answers.storageProvider,
  };

  if (answers.s3BucketName) {
    workerEnv["S3_BUCKET_NAME"] = answers.s3BucketName;
    if (answers.s3CredentialMode === "automatic") {
      workerEnv["S3_USE_INSTANCE_ROLE"] = "true";
    }
  }
  if (answers.targetEnv === "localstack" && answers.endpointUrl) {
    workerEnv["AWS_ENDPOINT_URL"] = answers.endpointUrl;
    workerEnv["AWS_ACCESS_KEY_ID"] = "test";
    workerEnv["AWS_SECRET_ACCESS_KEY"] = "test";
  }

  await writeEnvFile(
    path.join(repoRoot, "apps", "media-worker", ".env"),
    workerEnv,
  );
}

// ─── Exported Entry Point ─────────────────────────────────────────────────────

/**
 * Main entry point for AWS infrastructure setup.
 * Called by apps/fleet-manager/src/infra.ts when FLEET_PROVIDER=aws.
 */
export async function runAwsInfraSetup(): Promise<void> {
  banner();

  // Resolve repo root relative to this package (packages/fleet-provider-aws)
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(__dirname, "..", "..", "..", "..");

  const rl = readline.createInterface({ input, output });
  const TOTAL_STEPS = 11;

  try {
    // ── Step 1: Target Environment ─────────────────────────────────────────────
    step(1, TOTAL_STEPS, "Target Environment");
    const targetEnv = await askChoice(
      rl,
      "Where should this provision resources?",
      [
        { label: "Real AWS (production, billed)", value: "aws" as TargetEnv },
        {
          label:
            "LocalStack (local testing, free — requires LocalStack running)",
          value: "localstack" as TargetEnv,
        },
      ],
    );

    let endpointUrl: string | null = null;
    if (targetEnv === "aws") {
      // `node --env-file-if-exists=.env` loads whatever .env is already on
      // disk before this wizard runs, so picking "Real AWS" here after a
      // prior LocalStack setup would otherwise silently inherit that run's
      // AWS_ENDPOINT_URL and "test"/"test" credentials for the rest of this
      // process — every AWS SDK call below would keep hitting LocalStack
      // even though the user explicitly chose Real AWS. Clear them so this
      // choice actually takes effect.
      delete process.env.AWS_ENDPOINT_URL;
      if (process.env.AWS_ACCESS_KEY_ID === "test") {
        delete process.env.AWS_ACCESS_KEY_ID;
      }
      if (process.env.AWS_SECRET_ACCESS_KEY === "test") {
        delete process.env.AWS_SECRET_ACCESS_KEY;
      }
    } else if (targetEnv === "localstack") {
      endpointUrl = await ask(
        rl,
        "LocalStack endpoint URL",
        DEFAULT_LOCALSTACK_ENDPOINT,
      );
      // Every AWS SDK v3 client and the `aws` CLI itself honor
      // AWS_ENDPOINT_URL from the environment when no explicit endpoint is
      // passed, so setting it once here redirects every client constructed
      // below (and every `aws` CLI shell-out) at LocalStack with no other
      // code changes needed.
      process.env.AWS_ENDPOINT_URL = endpointUrl;
      process.env.AWS_ACCESS_KEY_ID ??= "test";
      process.env.AWS_SECRET_ACCESS_KEY ??= "test";
      process.env.EC2_VM_MANAGER = "docker";
      warn(
        "LocalStack Docker VM mode requires EC2_VM_MANAGER=docker and the " +
          "container-runtime socket mounted at /var/run/docker.sock.",
      );
    }

    // ── Step 2: Region ──────────────────────────────────────────────────────────
    step(2, TOTAL_STEPS, "AWS Region");
    const region = await ask(rl, "Which AWS region?", "us-east-1");

    // ── AWS Credential Pre-flight Check ────────────────────────────────────────
    info("Checking AWS credentials...");
    const identity = await checkAwsCredentials(region);
    const accountId = identity.accountId;

    // ── Step 3: Fleet Manager Mode ─────────────────────────────────────────────
    step(3, TOTAL_STEPS, "Fleet Manager Mode");
    const fleetMode = await askChoice(rl, "How should Fleet Manager run?", [
      {
        label: "Serverless — AWS Lambda (event-driven, scales to zero)",
        value: "serverless" as FleetMode,
      },
      {
        label: "Serverful — Long-running daemon on EC2 / server (always-on)",
        value: "serverful" as FleetMode,
      },
    ]);
    info(
      fleetMode === "serverless"
        ? "Will set up Lambda function + CloudWatch log group."
        : "Will not set up Lambda — daemon runs as a persistent process.",
    );

    // ── Step 4: Storage Provider ───────────────────────────────────────────────
    step(4, TOTAL_STEPS, "Video Storage Provider");
    const storageProvider = await askChoice(
      rl,
      "Where will transcoded HLS output be stored?",
      [
        { label: "AWS S3 (recommended)", value: "s3" as StorageProvider },
        {
          label: "Other / local (no S3 permission added to EC2 role)",
          value: "other" as StorageProvider,
        },
      ],
    );

    let s3BucketName: string | null = null;
    let s3CredentialMode: CredentialMode | null = null;

    if (storageProvider === "s3") {
      const bucketInput = await ask(rl, "S3 bucket name (leave empty to skip)");

      if (bucketInput) {
        s3BucketName = bucketInput;

        info(`Checking bucket ${bold(s3BucketName)}...`);
        const bucketStatus = await checkS3Bucket(region, s3BucketName);

        if (bucketStatus === "exists") {
          ok(
            `Bucket ${bold(s3BucketName)} found — will grant EC2 role access.`,
          );
        } else if (bucketStatus === "no-access") {
          warn(
            `Bucket ${bold(s3BucketName)} exists but this account has no access.`,
          );
          warn("IAM policy will be set. Bucket owner must allow this account.");
        } else {
          info(`Creating S3 bucket ${bold(s3BucketName)} in ${region}...`);
          try {
            if (region === "us-east-1") {
              execSync(
                `aws s3api create-bucket --bucket "${s3BucketName}" --region "${region}"`,
                { stdio: "pipe" },
              );
            } else {
              execSync(
                `aws s3api create-bucket --bucket "${s3BucketName}" --region "${region}" --create-bucket-configuration LocationConstraint="${region}"`,
                { stdio: "pipe" },
              );
            }
            execSync(
              `aws s3api put-public-access-block --bucket "${s3BucketName}" --public-access-block-configuration "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false" --region "${region}"`,
              { stdio: "pipe" },
            );
            const pubPolicy = JSON.stringify({
              Version: "2012-10-17",
              Statement: [
                {
                  Sid: "PublicReadGetObject",
                  Effect: "Allow",
                  Principal: "*",
                  Action: "s3:GetObject",
                  Resource: `arn:aws:s3:::${s3BucketName}/*`,
                },
              ],
            });
            execSync(
              `aws s3api put-bucket-policy --bucket "${s3BucketName}" --policy '${pubPolicy}' --region "${region}"`,
              { stdio: "pipe" },
            );
            ok(
              `Created S3 bucket ${bold(s3BucketName)} with public read enabled.`,
            );
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            warn(`Could not automatically create bucket: ${msg}`);
          }
        }

        s3CredentialMode = await askChoice(
          rl,
          "How should workers authenticate to S3?",
          [
            {
              label:
                "Automatic — EC2 Instance Role (recommended, no key management)",
              value: "automatic" as CredentialMode,
            },
            {
              label:
                "Manual — Provide AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY yourself",
              value: "manual" as CredentialMode,
            },
          ],
        );

        if (s3CredentialMode === "manual") {
          warn(
            "Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in apps/media-worker/.env.",
          );
        }
      }
    }

    // ── Step 5: Database URL ────────────────────────────────────────────────────
    step(5, TOTAL_STEPS, "Database Connection");
    info(
      "The deployed Lambda / EC2 workers need a database URL reachable from " +
        (targetEnv === "localstack" ? "LocalStack" : "AWS") +
        " — not just from this machine.",
    );
    const databaseUrl = await ask(
      rl,
      "PostgreSQL DATABASE_URL for the fleet manager",
      process.env["DATABASE_URL"] ??
        "postgresql://veolms:veolms@localhost:5433/veolms",
    );

    // ── Step 6: Allowed EC2 Instance Types ─────────────────────────────────────
    step(6, TOTAL_STEPS, "Allowed EC2 Instance Types");
    console.log(
      dim(
        "  ARM64 Graviton: t4g.small, c7g.large, c7g.xlarge, c7g.2xlarge, c7g.4xlarge",
      ),
    );
    console.log(
      dim("  x86_64:         t3.small,  c6i.large, c6i.xlarge, c6i.2xlarge"),
    );
    const instanceTypesInput = await ask(
      rl,
      "Allowed instance types (comma separated)",
      "c7g.xlarge,c7g.2xlarge,c6i.xlarge",
    );
    const allowedInstanceTypes = instanceTypesInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    ok(`Allowed: ${bold(allowedInstanceTypes.join(", "))}`);

    // ── Step 7: EC2 Boot Mode ──────────────────────────────────────────────────
    step(7, TOTAL_STEPS, "EC2 Worker Boot Mode");
    const bootMode = await askChoice(
      rl,
      "How should EC2 workers boot?",
      [
        {
          label:
            "Fresh install — Install Node.js + FFmpeg on every boot (~3-5 min)",
          value: "fresh" as BootMode,
        },
        {
          label:
            "Pre-baked AMI — Custom AMI with Node.js + FFmpeg pre-installed (~30s)",
          value: "ami" as BootMode,
        },
      ],
      1,
    );

    if (bootMode === "ami") {
      warn("Pre-baked AMI selected.");
      info(`Build the AMI separately: ${cyan("pnpm fleet:build-ami")}`);
    }

    // ── Step 8: Max Workers ────────────────────────────────────────────────────
    step(8, TOTAL_STEPS, "Maximum Concurrent Workers");
    const maxWorkersInput = await ask(
      rl,
      "Maximum number of concurrent EC2 workers",
      "8",
    );
    const maxWorkers = Math.max(1, parseInt(maxWorkersInput, 10) || 8);
    ok(`Max concurrent workers: ${bold(String(maxWorkers))}`);

    // ── Step 9: Spot vs On-Demand ──────────────────────────────────────────────
    step(9, TOTAL_STEPS, "EC2 Pricing Model");
    const pricingModel = await askChoice(rl, "Which EC2 pricing model?", [
      {
        label:
          "Spot Instances — Up to 90% cheaper, can be interrupted (recommended for batch video)",
        value: "spot" as PricingModel,
      },
      {
        label: "On-Demand — Standard pricing, never interrupted",
        value: "on-demand" as PricingModel,
      },
    ]);
    const useSpot = pricingModel === "spot";
    ok(useSpot ? "Spot Instances selected." : "On-Demand Instances selected.");

    // ── Step 10: Create AWS Resources ──────────────────────────────────────────
    step(10, TOTAL_STEPS, "Creating AWS Resources");

    const iam = new IAMClient({ region });
    const cw = new CloudWatchLogsClient({ region });

    info("Setting up IAM role for EC2 workers...");
    const workerRoleArn = await checkOrCreateRole(
      iam,
      storageProvider === "s3" && s3BucketName !== null,
      s3BucketName,
    );

    const instanceProfileArn = await createInstanceProfile(iam, workerRoleArn);

    info("Setting up CloudWatch log groups...");
    await ensureLogGroup(cw, LOG_GROUP_WORKERS);
    await ensureLogGroup(cw, LOG_GROUP_FLEET);

    let lambdaFunctionArn: string | null = null;
    if (fleetMode === "serverless") {
      info("Setting up Lambda function...");
      const lambdaEnvVars: Record<string, string> = {
        DATABASE_URL: databaseUrl,
        STORAGE_PROVIDER: storageProvider,
        EC2_IAM_INSTANCE_PROFILE: INSTANCE_PROFILE_NAME,
        EC2_USE_SPOT: String(useSpot),
        MAX_WORKERS: String(maxWorkers),
        PROVIDER: "aws",
      };
      if (s3BucketName) {
        lambdaEnvVars["S3_BUCKET"] = s3BucketName;
      }
      if (endpointUrl) {
        // Deliberately NOT setting AWS_ENDPOINT_URL here. On the host (and
        // for the daemon/media-worker, which run as regular processes) it
        // correctly resolves to LocalStack's API. But localhost.localstack
        // .cloud resolves to 127.0.0.1, and inside the Lambda's own
        // isolated execution container that loopback doesn't reach the
        // main LocalStack container — only the host does. LocalStack
        // already wires up Lambda-to-LocalStack networking automatically
        // for calls made from within a function, so overriding the
        // endpoint here breaks it instead: RunInstances (and friends)
        // return what look like valid responses but the resources are
        // never actually created anywhere.
        lambdaEnvVars["AWS_ACCESS_KEY_ID"] = "test";
        lambdaEnvVars["AWS_SECRET_ACCESS_KEY"] = "test";
        // LocalStack's Docker VM manager requires one of its tagged Docker
        // AMIs. Keep the endpoint private to the Lambda runtime, but pass the
        // AMI selection through so RunInstances does not use a real AWS AMI.
        lambdaEnvVars["AMI_ID"] = LOCALSTACK_DOCKER_AMI_ID;
        lambdaEnvVars["EC2_VM_MANAGER"] = "docker";
      }
      lambdaFunctionArn = await setupLambda(
        region,
        workerRoleArn,
        lambdaEnvVars,
      );
    }

    if (storageProvider === "s3" && s3BucketName) {
      info("Building and uploading media worker bundle to S3...");
      buildAndUploadWorkerBundle(s3BucketName, region);
    }

    const result: SetupResult = {
      workerRoleArn,
      instanceProfileArn,
      logGroupWorkers: LOG_GROUP_WORKERS,
      logGroupFleet: LOG_GROUP_FLEET,
      lambdaFunctionArn,
      s3BucketName,
    };

    const answers: SetupAnswers = {
      targetEnv,
      endpointUrl,
      region,
      accountId,
      databaseUrl,
      fleetMode,
      storageProvider,
      s3BucketName,
      s3CredentialMode,
      allowedInstanceTypes,
      bootMode,
      maxWorkers,
      useSpot,
    };

    // ── Step 11: Write .env Files ───────────────────────────────────────────────
    step(11, TOTAL_STEPS, "Writing Per-App .env Files");
    await generateEnvFiles(answers, result, repoRoot);

    // ── Summary ────────────────────────────────────────────────────────────────
    console.log(`
${bold(cyan("╔══════════════════════════════════════════════════════╗"))}
${bold(cyan("║"))}               ${bold(green("AWS Setup Complete!"))}                 ${bold(cyan("║"))}
${bold(cyan("╚══════════════════════════════════════════════════════╝"))}

${bold("Resources:")} ${dim(`(target: ${targetEnv === "localstack" ? `LocalStack @ ${endpointUrl}` : `AWS account ${accountId}`})`)}
  ${green("✔")} IAM Role:             ${bold(ROLE_NAME)}
  ${green("✔")} Instance Profile:     ${bold(INSTANCE_PROFILE_NAME)}
  ${green("✔")} Log Group (workers):  ${bold(LOG_GROUP_WORKERS)}
  ${green("✔")} Log Group (fleet):    ${bold(LOG_GROUP_FLEET)}${lambdaFunctionArn ? `\n  ${green("✔")} Lambda Function:     ${bold(LAMBDA_FUNCTION_NAME)}` : ""}${s3BucketName ? `\n  ${green("✔")} S3 Bucket Policy:    ${bold(s3BucketName)}` : ""}

${bold("Generated .env Files:")}
  ${green("✔")} apps/fleet-manager/.env
  ${green("✔")} apps/media-worker/.env

${bold("Next Steps:")}${bootMode === "ami" ? `\n  1. Build the worker AMI:   ${cyan("pnpm fleet:build-ami")}` : ""}
  ${bootMode === "ami" ? "2" : "1"}. Run AWS transcode test: ${cyan("pnpm test:aws")}
  ${bootMode === "ami" ? "3" : "2"}. Run the fleet daemon:    ${cyan("pnpm fleet:run")}
  ${bootMode === "ami" ? "4" : "3"}. Monitor fleet health:    ${cyan("pnpm fleet:cli health")}
  ${bootMode === "ami" ? "5" : "4"}. Teardown AWS resources:  ${cyan("pnpm fleet:destroy")}
`);
  } finally {
    rl.close();
  }
}
