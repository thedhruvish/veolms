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
};
