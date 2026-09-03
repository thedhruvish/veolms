import {
  IAMClient,
  CreateUserCommand,
  GetUserCommand,
  CreatePolicyCommand,
  GetPolicyCommand,
  CreatePolicyVersionCommand,
  ListPolicyVersionsCommand,
  DeletePolicyVersionCommand,
  AttachUserPolicyCommand,
  CreateAccessKeyCommand,
  ListAccessKeysCommand,
} from "@aws-sdk/client-iam";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import { isMainModule } from "@veolms/fleet-types";
import {
  bold,
  cyan,
  dim,
  green,
  red,
  yellow,
} from "@veolms/fleet-types/terminal";
import { resolveS3BucketName, resolveS3BuildBucketName } from "../src/config.ts";

const USER_NAME = "veolms-cicd-infra-deployer";
const POLICY_NAME = "veolms-cicd-infra-deployer-policy";

export interface SetupCicdOptions {
  readonly region?: string;
  readonly bucketName?: string;
  readonly profile?: string | null;
}

export interface SetupCicdResult {
  readonly accountId: string;
  readonly region: string;
  readonly bucketName: string;
  readonly accessKeyId: string;
  readonly secretAccessKey?: string;
}

export async function runSetupCicdIam(
  options?: SetupCicdOptions,
): Promise<SetupCicdResult> {
  const profile =
    options?.profile ?? process.env["AWS_PROFILE"] ?? undefined;
  const region =
    options?.region ||
    process.env["AWS_REGION"] ||
    process.env["FLEET_MANAGER_LAMBDA_REGION"] ||
    "us-east-1";

  const bucketName =
    options?.bucketName ||
    resolveS3BuildBucketName(process.env) ||
    resolveS3BucketName(process.env);

  if (!bucketName) {
    throw new Error(
      "S3_BUILD_BUCKET, S3_BUCKET_NAME, or S3_BUCKET environment variable must be specified to configure least-privilege CI/CD permissions.\n" +
        "Run `pnpm fleet:infra` first to provision the bucket, or pass S3_BUILD_BUCKET=<name>.",
    );
  }

  console.info(`\n╔══════════════════════════════════════════════════════╗`);
  console.info(`║    VeoLMS CI/CD Deployer IAM User Setup             ║`);
  console.info(`╚══════════════════════════════════════════════════════╝\n`);

  if (profile) {
    console.info(`  Active AWS Profile: ${bold(cyan(profile))}`);
  }
  console.info(`  Target Region:      ${bold(cyan(region))}`);
  console.info(`  Target S3 Bucket:   ${bold(cyan(bucketName))}\n`);

  const clientConfig = {
    region,
    profile,
  };

  const sts = new STSClient(clientConfig);
  const iam = new IAMClient(clientConfig);

  console.info(`[1/4] Resolving AWS Account ID dynamically via STS...`);
  let caller;
  try {
    caller = await sts.send(new GetCallerIdentityCommand({}));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to verify AWS credentials with STS: ${msg}\n` +
        `Please ensure valid AWS credentials are configured (e.g. run 'aws configure' or specify --profile=<name>).`,
    );
  }

  const accountId = caller.Account;
  if (!accountId) {
    throw new Error("Could not determine AWS Account ID from active credentials.");
  }
  console.info(`  ${green("✔")} AWS Account ID: ${bold(accountId)}`);

  // 1. Create or verify IAM User
  console.info(`\n[2/4] Checking IAM user ${bold(USER_NAME)}...`);
  try {
    await iam.send(new GetUserCommand({ UserName: USER_NAME }));
    console.info(`  ${green("✔")} IAM user ${bold(USER_NAME)} already exists.`);
  } catch (err: any) {
    if (err.name === "NoSuchEntityException" || err.name === "NoSuchEntity") {
      await iam.send(new CreateUserCommand({ UserName: USER_NAME }));
      console.info(`  ${green("✔")} Created IAM user ${bold(USER_NAME)}.`);
    } else {
      throw err;
    }
  }

  // 2. Build Policy Document
  const policyDocument = JSON.stringify(
    {
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "S3BuildBucketUploadAndRead",
          Effect: "Allow",
          Action: [
            "s3:PutObject",
            "s3:GetObject",
            "s3:HeadObject",
            "s3:ListBucket",
          ],
          Resource: [
            `arn:aws:s3:::${bucketName}`,
            `arn:aws:s3:::${bucketName}/*`,
          ],
        },
        {
          Sid: "LambdaFunctionCodeUpdate",
          Effect: "Allow",
          Action: [
            "lambda:UpdateFunctionCode",
            "lambda:GetFunction",
            "lambda:GetFunctionConfiguration",
            "lambda:PublishVersion",
          ],
          Resource: [
            `arn:aws:lambda:${region}:${accountId}:function:veolms-fleet-manager`,
            `arn:aws:lambda:${region}:${accountId}:function:veolms-video-metadata-probe`,
          ],
        },
        {
          Sid: "CloudWatchLogsDescribe",
          Effect: "Allow",
          Action: ["logs:DescribeLogGroups"],
          Resource: "*",
        },
      ],
    },
    null,
    2,
  );

  const policyArn = `arn:aws:iam::${accountId}:policy/${POLICY_NAME}`;

  // 3. Create or Update Policy & Attach to User
  console.info(`\n[3/4] Updating CI/CD policy ${bold(POLICY_NAME)}...`);
  try {
    await iam.send(new GetPolicyCommand({ PolicyArn: policyArn }));
    console.info(`  Policy exists — rotating policy versions...`);
    const versionsRes = await iam.send(
      new ListPolicyVersionsCommand({ PolicyArn: policyArn }),
    );
    for (const v of versionsRes.Versions || []) {
      if (!v.IsDefaultVersion && v.VersionId) {
        await iam.send(
          new DeletePolicyVersionCommand({
            PolicyArn: policyArn,
            VersionId: v.VersionId,
          }),
        );
      }
    }
    await iam.send(
      new CreatePolicyVersionCommand({
        PolicyArn: policyArn,
        PolicyDocument: policyDocument,
        SetAsDefault: true,
      }),
    );
    console.info(`  ${green("✔")} Updated policy with current S3 bucket & region.`);
  } catch (err: any) {
    if (err.name === "NoSuchEntityException" || err.name === "NoSuchEntity") {
      await iam.send(
        new CreatePolicyCommand({
          PolicyName: POLICY_NAME,
          PolicyDocument: policyDocument,
          Description:
            "Least-privilege CI/CD deployer policy for VeoLMS video fleet artifacts & Lambdas",
        }),
      );
      console.info(`  ${green("✔")} Created policy ${bold(POLICY_NAME)}.`);
    } else {
      throw err;
    }
  }

  await iam.send(
    new AttachUserPolicyCommand({
      UserName: USER_NAME,
      PolicyArn: policyArn,
    }),
  );
  console.info(`  ${green("✔")} Attached policy to ${bold(USER_NAME)}.`);

  // 4. Check / Create Access Keys
  console.info(`\n[4/4] Checking access keys for ${bold(USER_NAME)}...`);
  const keys = await iam.send(new ListAccessKeysCommand({ UserName: USER_NAME }));
  let accessKeyId = "";
  let secretAccessKey: string | undefined = undefined;

  if (keys.AccessKeyMetadata && keys.AccessKeyMetadata.length > 0) {
    accessKeyId = keys.AccessKeyMetadata[0]?.AccessKeyId || "";
    console.info(`  ${green("✔")} User already has an active access key: ${bold(accessKeyId)}`);
    console.info(
      `  ${dim(`(To rotate keys, delete the old key in AWS IAM and re-run this script)`)}`,
    );
  } else {
    const createdKey = await iam.send(
      new CreateAccessKeyCommand({ UserName: USER_NAME }),
    );
    accessKeyId = createdKey.AccessKey?.AccessKeyId || "";
    secretAccessKey = createdKey.AccessKey?.SecretAccessKey || "";
    console.info(`  ${green("✔")} Created new access key for ${bold(USER_NAME)}.`);
  }

  console.info(`\n${bold(cyan("╔══════════════════════════════════════════════════════╗"))}`);
  console.info(`${bold(cyan("║"))}          ${bold(green("CI/CD IAM User Setup Complete!"))}              ${bold(cyan("║"))}`);
  console.info(`${bold(cyan("╚══════════════════════════════════════════════════════╝"))}\n`);
  console.info(`${bold("GitHub Repository Secrets:")}`);
  console.info(
    `Configure these secrets under: ${cyan("Settings -> Secrets and variables -> Actions")}\n`,
  );
  console.info(`  ${bold("AWS_ACCESS_KEY_ID")}:     ${bold(green(accessKeyId))}`);
  if (secretAccessKey) {
    console.info(
      `  ${bold("AWS_SECRET_ACCESS_KEY")}: ${bold(green(secretAccessKey))}`,
    );
  } else {
    console.info(
      `  ${bold("AWS_SECRET_ACCESS_KEY")}: ${dim("<existing-secret-access-key>")}`,
    );
  }
  console.info(`  ${bold("AWS_REGION")}:            ${bold(region)}`);
  console.info(`  ${bold("S3_BUILD_BUCKET")}:       ${bold(bucketName)}\n`);

  return {
    accountId,
    region,
    bucketName,
    accessKeyId,
    secretAccessKey,
  };
}

if (isMainModule(import.meta.url)) {
  runSetupCicdIam().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\n${red("✘")} ${bold("CI/CD Setup Failed:")} ${msg}\n`);
    process.exit(1);
  });
}
