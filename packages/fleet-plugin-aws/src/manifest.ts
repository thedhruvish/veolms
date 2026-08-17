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
      description: "Amazon Machine Image ID for Media Worker instances",
      required: false,
      defaultValue: "ami-0c7217cdde317cfec",
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
      description: "VPC Security Group ID for worker instances",
      required: false,
    },
    {
      key: "AWS_IAM_ROLE_ARN",
      description: "IAM Instance Profile ARN granting S3 access to workers",
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
    return {
      PROVIDER: "aws",
      RUNNER_MODE: config.runnerMode || "spot",
      AWS_REGION: "us-east-1",
      AWS_EC2_INSTANCE_TYPE: "c6i.xlarge",
      AWS_EC2_INSTANCE_TYPES: "c6i.large,c6i.xlarge,c6i.2xlarge,g4dn.xlarge",
      AWS_EC2_AMI_ID: "ami-0c7217cdde317cfec",
      AWS_SUBNET_ID: "subnet-0123456789abcdef0",
      AWS_SECURITY_GROUP_ID: "sg-0123456789abcdef0",
      AWS_IAM_ROLE_ARN:
        "arn:aws:iam::123456789012:instance-profile/VeoLMSWorkerProfile",
      S3_TEMP_BUCKET: "veolms-temp-scratch-bucket",
      S3_PROD_BUCKET: "veolms-production-media-bucket",
      STORAGE_DRIVER: "s3",
      FLEET_MANAGER_API_URL: config.fleetManagerUrl || "http://127.0.0.1:4000",
      DATABASE_URL:
        config.databaseUrl ||
        "postgresql://postgres:postgres@localhost:5432/veolms",
    };
  },
  provisionInfra: async (options) => {
    const action = options.action || "setup";
    const region = options.region || process.env.AWS_REGION || "us-east-1";
    const tempBucket =
      options.tempBucketName ||
      process.env.S3_TEMP_BUCKET ||
      "veolms-temp-scratch-bucket";
    const prodBucket =
      options.prodBucketName ||
      process.env.S3_PROD_BUCKET ||
      "veolms-production-media-bucket";

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

    const {
      provisionDualS3Buckets,
      destroyDualS3Buckets,
      checkDualS3Buckets,
    } = await import("./infra/s3.ts");
    const {
      provisionIamRoles,
      destroyIamRoles,
      checkIamRoles,
    } = await import("./infra/iam.ts");
    const {
      provisionSecurityGroup,
      destroySecurityGroup,
      checkSecurityGroup,
    } = await import("./infra/security-groups.ts");

    // 1. DESTROY ACTION
    if (action === "destroy") {
      const s3Res = await destroyDualS3Buckets({
        region,
        tempBucketName: tempBucket,
        prodBucketName: prodBucket,
      });
      const iamRes = await destroyIamRoles({ region });
      const sgRes = await destroySecurityGroup({ region });

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
        },
      };
    }

    // 2. STATUS ACTION
    if (action === "status") {
      const s3Status = await checkDualS3Buckets({
        region,
        tempBucketName: tempBucket,
        prodBucketName: prodBucket,
      });
      const iamStatus = await checkIamRoles({ region });
      const sgStatus = await checkSecurityGroup({ region });

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
          workerInstanceProfile: iamStatus.workerProfile ? "Active ✅" : "Missing ❌",
          securityGroup: sgStatus.exists ? `Active (${sgStatus.groupId}) ✅` : "Missing ❌",
        },
      };
    }

    // 3. REINSTALL ACTION (Destroy + Setup)
    if (action === "reinstall") {
      await destroyDualS3Buckets({
        region,
        tempBucketName: tempBucket,
        prodBucketName: prodBucket,
      });
      await destroyIamRoles({ region });
      await destroySecurityGroup({ region });
    }

    // 4. SETUP ACTION (or Reinstall second phase)
    const s3Res = await provisionDualS3Buckets({
      region,
      tempBucketName: tempBucket,
      prodBucketName: prodBucket,
      autoPruneTempDays: 1,
      enableCors: true,
    });

    const iamRes = await provisionIamRoles({
      region,
      tempBucketName: tempBucket,
      prodBucketName: prodBucket,
    });

    const sgRes = await provisionSecurityGroup({
      region,
    });

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
      },
      outputs: {
        S3_TEMP_BUCKET: s3Res.tempBucketName,
        S3_PROD_BUCKET: s3Res.prodBucketName,
        AWS_IAM_ROLE_ARN: iamRes.workerInstanceProfileArn,
        AWS_SECURITY_GROUP_ID: sgRes.securityGroupId,
      },
    };
  },
};
