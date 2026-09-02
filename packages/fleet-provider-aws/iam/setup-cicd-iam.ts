import {
  IAMClient,
  CreateUserCommand,
  GetUserCommand,
  CreatePolicyCommand,
  GetPolicyCommand,
  CreatePolicyVersionCommand,
  AttachUserPolicyCommand,
  CreateAccessKeyCommand,
  ListAccessKeysCommand,
} from "@aws-sdk/client-iam";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";

const USER_NAME = "veolms-cicd-infra-deployer";
const POLICY_NAME = "veolms-cicd-infra-deployer-policy";

async function main(): Promise<void> {
  const region =
    process.env["AWS_REGION"] ||
    process.env["FLEET_MANAGER_LAMBDA_REGION"] ||
    "ap-south-1";

  const bucketName =
    process.env["S3_BUILD_BUCKET"] ||
    process.env["S3_BUCKET_NAME"] ||
    process.env["S3_BUCKET"];

  if (!bucketName) {
    console.error(
      "✘ Error: S3_BUILD_BUCKET, S3_BUCKET_NAME, or S3_BUCKET environment variable must be specified.",
    );
    console.info("Example: S3_BUILD_BUCKET=my-build-bucket node setup-cicd-iam.ts");
    process.exit(1);
  }

  console.info(`\n=============================================================`);
  console.info(`  VeoLMS CI/CD Deployer IAM User Setup`);
  console.info(`=============================================================\n`);

  const sts = new STSClient({ region });
  const iam = new IAMClient({ region });

  console.info(`Resolving AWS Account ID dynamically via STS...`);
  const caller = await sts.send(new GetCallerIdentityCommand({}));
  const accountId = caller.Account;
  if (!accountId) {
    throw new Error("Could not determine AWS Account ID from active credentials.");
  }
  console.info(`  ✔ AWS Account ID: ${accountId}`);
  console.info(`  ✔ AWS Region:     ${region}`);
  console.info(`  ✔ S3 Bucket:      ${bucketName}\n`);

  // 1. Create or verify IAM User
  console.info(`1. Checking IAM user: ${USER_NAME}...`);
  try {
    await iam.send(new GetUserCommand({ UserName: USER_NAME }));
    console.info(`  ✔ IAM user ${USER_NAME} already exists.`);
  } catch (err: any) {
    if (err.name === "NoSuchEntityException" || err.name === "NoSuchEntity") {
      await iam.send(new CreateUserCommand({ UserName: USER_NAME }));
      console.info(`  ✔ Created IAM user ${USER_NAME}.`);
    } else {
      throw err;
    }
  }

  // 2. Build Policy Document
  const policyDocument = JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Sid: "S3BuildBucketUploadAndRead",
        Effect: "Allow",
        Action: [
          "s3:PutObject",
          "s3:GetObject",
          "s3:HeadObject",
          "s3:ListBucket"
        ],
        Resource: [
          `arn:aws:s3:::${bucketName}`,
          `arn:aws:s3:::${bucketName}/*`
        ]
      },
      {
        Sid: "LambdaFunctionCodeUpdate",
        Effect: "Allow",
        Action: [
          "lambda:UpdateFunctionCode",
          "lambda:GetFunction",
          "lambda:GetFunctionConfiguration",
          "lambda:PublishVersion"
        ],
        Resource: [
          `arn:aws:lambda:${region}:${accountId}:function:veolms-fleet-manager`,
          `arn:aws:lambda:${region}:${accountId}:function:veolms-video-metadata-probe`
        ]
      },
      {
        Sid: "CloudWatchLogsDescribe",
        Effect: "Allow",
        Action: [
          "logs:DescribeLogGroups"
        ],
        Resource: "*"
      }
    ]
  }, null, 2);

  const policyArn = `arn:aws:iam::${accountId}:policy/${POLICY_NAME}`;

  // 3. Create or Update Policy
  console.info(`\n2. Setting up policy: ${POLICY_NAME}...`);
  try {
    await iam.send(new GetPolicyCommand({ PolicyArn: policyArn }));
    console.info(`  Policy exists, adding new policy version...`);
    await iam.send(
      new CreatePolicyVersionCommand({
        PolicyArn: policyArn,
        PolicyDocument: policyDocument,
        SetAsDefault: true,
      }),
    );
    console.info(`  ✔ Updated policy ${POLICY_NAME} with current bucket and region.`);
  } catch (err: any) {
    if (err.name === "NoSuchEntityException" || err.name === "NoSuchEntity") {
      await iam.send(
        new CreatePolicyCommand({
          PolicyName: POLICY_NAME,
          PolicyDocument: policyDocument,
          Description: "Least-privilege CI/CD deployer policy for VeoLMS video fleet artifacts & Lambdas",
        }),
      );
      console.info(`  ✔ Created policy ${POLICY_NAME}.`);
    } else {
      throw err;
    }
  }

  // 4. Attach Policy to User
  console.info(`\n3. Attaching policy to ${USER_NAME}...`);
  await iam.send(
    new AttachUserPolicyCommand({
      UserName: USER_NAME,
      PolicyArn: policyArn,
    }),
  );
  console.info(`  ✔ Policy attached successfully.`);

  // 5. Check / Create Access Keys
  console.info(`\n4. Checking access keys for ${USER_NAME}...`);
  const keys = await iam.send(new ListAccessKeysCommand({ UserName: USER_NAME }));
  let accessKeyId = "";
  let secretAccessKey = "";

  if (keys.AccessKeyMetadata && keys.AccessKeyMetadata.length > 0) {
    accessKeyId = keys.AccessKeyMetadata[0].AccessKeyId || "";
    console.info(`  User already has active access key: ${accessKeyId}`);
    console.info(`  (If you need to rotate keys, use: aws iam create-access-key --user-name ${USER_NAME})`);
  } else {
    const createdKey = await iam.send(new CreateAccessKeyCommand({ UserName: USER_NAME }));
    accessKeyId = createdKey.AccessKey?.AccessKeyId || "";
    secretAccessKey = createdKey.AccessKey?.SecretAccessKey || "";
    console.info(`  ✔ Created new access key for ${USER_NAME}.`);
  }

  console.info(`\n=============================================================`);
  console.info(`  GitHub Repository Secrets Setup`);
  console.info(`=============================================================`);
  console.info(`Add the following in your GitHub Repository Settings:`);
  console.info(`(Settings -> Secrets and variables -> Actions -> New repository secret)\n`);
  console.info(`  AWS_ACCESS_KEY_ID:     ${accessKeyId}`);
  if (secretAccessKey) {
    console.info(`  AWS_SECRET_ACCESS_KEY: ${secretAccessKey}`);
  } else {
    console.info(`  AWS_SECRET_ACCESS_KEY: <your-existing-secret-key>`);
  }
  console.info(`  AWS_REGION:            ${region}`);
  console.info(`  S3_BUILD_BUCKET:       ${bucketName}`);
  console.info(`\n=============================================================\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
