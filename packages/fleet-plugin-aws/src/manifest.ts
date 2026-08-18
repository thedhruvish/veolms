import type { FleetPluginManifest } from "@veolms/fleet-types";

export const awsPluginManifest: FleetPluginManifest = {
  packageName: "@veolms/fleet-plugin-aws",
  provider: "aws",
  name: "AWS Cloud (EC2 Spot / ECS Fargate)",
  description:
    "Cloud-native EC2 Spot & ECS Fargate worker fleet with dual S3 buckets and Postgres queue",
  defaultRunnerMode: "spot",
  supportedRunnerModes: ["spot", "on_demand", "ecs_fargate"],
  envVars: [
    {
      key: "AWS_REGION",
      description: "Primary AWS Region for EC2 instances and S3 buckets",
      required: true,
      defaultValue: "us-east-1",
    },
    {
      key: "AWS_EC2_AMI_ID",
      description:
        "Amazon Machine Image ID for Media Worker instances (auto-populated by fleet:infra)",
      required: false,
    },
    {
      key: "AWS_EC2_INSTANCE_TYPE",
      description: "Baseline EC2 Instance Type (Default: c6i.xlarge)",
      required: false,
      defaultValue: "c6i.xlarge",
    },
    {
      key: "AWS_EC2_INSTANCE_TYPES",
      description:
        "Comma-separated list of allowed EC2 instance types for dynamic workload scaling (e.g. c6i.large,c6i.xlarge,c6i.2xlarge,g4dn.xlarge)",
      required: false,
      defaultValue: "c6i.large,c6i.xlarge,c6i.2xlarge,g4dn.xlarge",
    },
    {
      key: "AWS_SUBNET_ID",
      description: "VPC Subnet ID where worker instances will launch",
      required: false,
    },
    {
      key: "AWS_SECURITY_GROUP_ID",
      description:
        "VPC Security Group ID for worker instances (auto-populated by fleet:infra)",
      required: false,
    },
    {
      key: "AWS_IAM_ROLE_ARN",
      description:
        "IAM Instance Profile ARN granting S3 access to workers (auto-populated by fleet:infra)",
      required: false,
    },
    {
      key: "AWS_SPOT_MAX_PRICE",
      description:
        "Maximum hourly Spot price cap in USD (leave blank for market price)",
      required: false,
    },
    {
      key: "S3_TEMP_BUCKET",
      description: "Temporary S3 bucket for raw split video cuts",
      required: true,
      defaultValue: "veolms-temp-scratch-bucket",
    },
    {
      key: "S3_PROD_BUCKET",
      description:
        "Production S3 bucket for finalized multi-rendition HLS streams",
      required: true,
      defaultValue: "veolms-production-media-bucket",
    },
  ],
  getEnvTemplate: (config) => {
    const env: Record<string, string> = {
      AWS_REGION: process.env.AWS_REGION || "us-east-1",
      AMI_MODE: process.env.AMI_MODE || "golden_ami",
      RUNNER_MODE: config.runnerMode || "spot",
      AWS_EC2_INSTANCE_TYPE: "c6i.large",
      AWS_EC2_INSTANCE_TYPES: "c6i.large,c6i.xlarge,c6i.2xlarge,g4dn.xlarge",
      STORAGE_DRIVER: "s3",
      S3_TEMP_BUCKET:
        process.env.S3_TEMP_BUCKET || "veolms-temp-scratch-bucket",
      S3_PROD_BUCKET:
        process.env.S3_PROD_BUCKET || "veolms-production-media-bucket",
    };
    if (process.env.DEBUG === "true") {
      env.DEBUG = "true";
    }
    if (process.env.AWS_EC2_AMI_ID) {
      env.AWS_EC2_AMI_ID = process.env.AWS_EC2_AMI_ID;
    }
    if (process.env.AWS_SECURITY_GROUP_ID) {
      env.AWS_SECURITY_GROUP_ID = process.env.AWS_SECURITY_GROUP_ID;
    }
    if (process.env.AWS_IAM_ROLE_ARN) {
      env.AWS_IAM_ROLE_ARN = process.env.AWS_IAM_ROLE_ARN;
    }
    return env;
  },
  provisionInfra: async (options) => {
    const action = options.action || "setup";
    const region = options.region || process.env.AWS_REGION || "us-east-1";
    const { validateAwsCredentials } = await import("./infra/auth-check.ts");
    const auth = await validateAwsCredentials(region);

    if (!auth.valid) {
      return {
        provider: "aws",
        action,
        success: false,
        message: auth.helpMessage || "AWS Authentication failed.",
        details: {
          error: auth.errorMessage,
          region,
        },
        instructions: [
          "1. Run `aws configure` to login with AWS Access Key ID and Secret Access Key.",
          "2. Or add AWS_ACCESS_KEY_ID & AWS_SECRET_ACCESS_KEY to apps/fleet-manager/.env.local",
          "3. Or attach an IAM Role (Instance Profile) to your EC2/ECS host.",
        ],
      };
    }

    const defaultTemp = auth.accountId
      ? `veolms-temp-${auth.accountId}`
      : "veolms-temp-scratch-bucket";
    const defaultProd = auth.accountId
      ? `veolms-prod-${auth.accountId}`
      : "veolms-production-media-bucket";

    const tempBucket =
      options.tempBucketName || process.env.S3_TEMP_BUCKET || defaultTemp;
    const prodBucket =
      options.prodBucketName || process.env.S3_PROD_BUCKET || defaultProd;

    const { provisionDualS3Buckets, destroyDualS3Buckets, checkDualS3Buckets } =
      await import("./infra/s3.ts");
    const { provisionIamRoles, destroyIamRoles, checkIamRoles } =
      await import("./infra/iam.ts");
    const { provisionSecurityGroup, destroySecurityGroup, checkSecurityGroup } =
      await import("./infra/security-groups.ts");
    const {
      provisionCloudWatchLogs,
      destroyCloudWatchLogs,
      checkCloudWatchLogs,
    } = await import("./infra/cloudwatch.ts");
    const { bakeGoldenAmiViaEc2, checkGoldenAmi, destroyGoldenAmi } =
      await import("./infra/ami-builder.ts");
    const {
      deployServerlessLambda,
      destroyServerlessLambda,
      checkServerlessLambda,
    } = await import("./infra/lambda-deploy.ts");

    // 1. DESTROY ACTION
    if (action === "destroy") {
      console.log("  🗑️  Destroying Dual S3 Buckets...");
      const s3Res = await destroyDualS3Buckets({
        region,
        tempBucketName: tempBucket,
        prodBucketName: prodBucket,
      });
      console.log("  🗑️  Destroying IAM Roles & Profiles...");
      const iamRes = await destroyIamRoles({ region });
      console.log("  🗑️  Destroying Security Groups...");
      const sgRes = await destroySecurityGroup({ region });
      console.log("  🗑️  Destroying Serverless Lambda & CloudWatch Logs...");
      const lambdaDeleted = await destroyServerlessLambda({ region });
      const logsDeleted = await destroyCloudWatchLogs({ region });
      const amiDeleted = await destroyGoldenAmi({ region });

      return {
        provider: "aws",
        action: "destroy",
        success: true,
        message: `AWS Infrastructure torn down cleanly in region ${region}.`,
        details: {
          s3BucketsDeleted: s3Res,
          iamRolesDeleted: iamRes.rolesDeleted,
          iamProfilesDeleted: iamRes.profilesDeleted,
          securityGroupDeleted: sgRes,
          lambdaDeleted,
          cloudWatchLogsDeleted: logsDeleted,
          goldenAmiDeleted: amiDeleted,
        },
      };
    }

    // 2. STATUS ACTION
    if (action === "status") {
      console.log("  🔍 Inspecting Dual S3 Buckets...");
      const s3Status = await checkDualS3Buckets({
        region,
        tempBucketName: tempBucket,
        prodBucketName: prodBucket,
      });
      console.log("  🔍 Inspecting IAM Roles & Profiles...");
      const iamStatus = await checkIamRoles({ region });
      console.log("  🔍 Inspecting Security Group...");
      const sgStatus = await checkSecurityGroup({ region });
      console.log("  🔍 Inspecting CloudWatch Log Groups...");
      const cwStatus = await checkCloudWatchLogs({ region });
      console.log("  🔍 Inspecting Golden AMI...");
      const amiStatus = await checkGoldenAmi({ region });
      console.log("  🔍 Inspecting Serverless Lambda...");
      const lambdaStatus = await checkServerlessLambda({ region });

      const allHealthy =
        s3Status.tempExists &&
        s3Status.prodExists &&
        iamStatus.workerRole &&
        iamStatus.workerProfile &&
        sgStatus.exists;

      return {
        provider: "aws",
        action: "status",
        success: allHealthy,
        message: allHealthy
          ? `AWS Infrastructure is fully healthy in region ${region}.`
          : `AWS Infrastructure is incomplete or partially provisioned in ${region}.`,
        details: {
          s3TempBucket: s3Status.tempExists ? "Active ✅" : "Missing ❌",
          s3ProdBucket: s3Status.prodExists ? "Active ✅" : "Missing ❌",
          workerIamRole: iamStatus.workerRole ? "Active ✅" : "Missing ❌",
          workerInstanceProfile: iamStatus.workerProfile
            ? "Active ✅"
            : "Missing ❌",
          securityGroup: sgStatus.exists
            ? `Active (${sgStatus.groupId}) ✅`
            : "Missing ❌",
          cloudWatchLogs:
            cwStatus.managerLogsActive && cwStatus.workerLogsActive
              ? "Active (/aws/veolms/*) ✅"
              : "Partially Configured ⚠️",
          goldenAmi: amiStatus.exists
            ? `Active (${amiStatus.imageId}) ✅`
            : "Not Baked (Using Dynamic UserData Mode)",
          serverlessLambda: lambdaStatus.exists
            ? `Active (${lambdaStatus.runtime} / ${lambdaStatus.architecture || "arm64"}) ✅`
            : "Not Deployed (Serverful mode)",
        },
      };
    }

    // 3. REINSTALL ACTION (Destroy + Setup)
    if (action === "reinstall") {
      console.log("  🔄 Re-installing: Cleaning existing resources first...");
      await destroyDualS3Buckets({
        region,
        tempBucketName: tempBucket,
        prodBucketName: prodBucket,
      });
      await destroyIamRoles({ region });
      await destroySecurityGroup({ region });
      await destroyServerlessLambda({ region });
      await destroyCloudWatchLogs({ region });
    }

    // 4. SETUP ACTION (or Reinstall second phase)
    console.log("  [1/5] 🗄️  Provisioning Dual S3 Buckets (Scratch + Prod)...");
    const s3Res = await provisionDualS3Buckets({
      region,
      tempBucketName: tempBucket,
      prodBucketName: prodBucket,
      autoPruneTempDays: 1,
      enableCors: true,
    });

    console.log(
      "  [2/5] 🔑 Provisioning IAM Roles & Worker Instance Profile...",
    );
    const iamRes = await provisionIamRoles({
      region,
      tempBucketName: tempBucket,
      prodBucketName: prodBucket,
    });

    console.log("  [3/5] 🛡️  Provisioning Transcoding Security Group...");
    const sgRes = await provisionSecurityGroup({
      region,
    });

    console.log(
      "  [4/5] 📊 Provisioning CloudWatch Log Groups (14-day retention)...",
    );
    const cwRes = await provisionCloudWatchLogs({
      region,
      retentionInDays: 14,
    });

    // 5. EC2 Golden AMI Baking (if Golden AMI mode selected)
    let goldenAmiRes: { imageId?: string; imageName?: string } | undefined =
      undefined;
    if (options.amiMode === "golden_ami") {
      console.log(
        "  [+] 🔨 Baking Pre-baked Golden AMI with latest GitHub Release FFmpeg...",
      );
      goldenAmiRes = await bakeGoldenAmiViaEc2({
        region,
        securityGroupId: sgRes.securityGroupId,
        workerInstanceProfileName: "VeoLMSMediaWorkerInstanceProfile",
      });
    }

    let lambdaRes: { functionName?: string; functionArn?: string } | undefined =
      undefined;
    const shouldDeployLambda = Boolean(
      options.architecture === "serverless" ||
      options.deployLambda === true ||
      options.runnerMode === "serverless" ||
      process.env.FLEET_ARCHITECTURE === "serverless",
    );

    if (shouldDeployLambda) {
      console.log(
        "  [5/5] ⚡ Deploying Serverless Lambda Function (VeoLMS-FleetManager-ControlPlane)...",
      );
      lambdaRes = await deployServerlessLambda({
        region,
        roleArn: iamRes.managerRoleArn,
        tempBucket: s3Res.tempBucketName,
        prodBucket: s3Res.prodBucketName,
        databaseUrl: options.databaseUrl || process.env.DATABASE_URL,
      });
    } else {
      console.log(
        "  [5/5] 🖥️  Configured Serverful Control Plane (Node daemon / EC2).",
      );
    }

    return {
      provider: "aws",
      action,
      success: true,
      message: `AWS Infrastructure Provisioned successfully in region ${region}.`,
      details: {
        tempBucket: s3Res.tempBucketName,
        prodBucket: s3Res.prodBucketName,
        workerRoleArn: iamRes.workerRoleArn,
        workerInstanceProfileArn: iamRes.workerInstanceProfileArn,
        managerRoleArn: iamRes.managerRoleArn,
        securityGroupId: sgRes.securityGroupId,
        cloudWatchManagerLogs: cwRes.managerLogGroup,
        cloudWatchWorkerLogs: cwRes.workerLogGroup,
        ...(goldenAmiRes
          ? {
              goldenAmiId: goldenAmiRes.imageId,
              goldenAmiName: goldenAmiRes.imageName,
            }
          : { workerBootstrapping: "Dynamic UserData ($0 idle fees)" }),
        ...(lambdaRes
          ? {
              serverlessLambdaArn: lambdaRes.functionArn,
              serverlessLambdaName: lambdaRes.functionName,
            }
          : {}),
      },
      outputs: {
        S3_TEMP_BUCKET: s3Res.tempBucketName,
        S3_PROD_BUCKET: s3Res.prodBucketName,
        AWS_IAM_ROLE_ARN: iamRes.workerInstanceProfileArn,
        AWS_SECURITY_GROUP_ID: sgRes.securityGroupId,
        CLOUDWATCH_WORKER_LOGS: cwRes.workerLogGroup,
        ...(goldenAmiRes?.imageId ? { AWS_AMI_ID: goldenAmiRes.imageId } : {}),
        ...(lambdaRes?.functionArn
          ? { AWS_LAMBDA_FUNCTION_ARN: lambdaRes.functionArn }
          : {}),
      },
    };
  },
};
