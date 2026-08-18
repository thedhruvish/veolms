import {
  DescribeInstancesCommand,
  EC2Client,
  RunInstancesCommand,
  TerminateInstancesCommand,
} from "@aws-sdk/client-ec2";
import type {
  CloudDriver,
  WorkerLaunchResult,
  WorkerLaunchSpec,
  WorkerProviderType,
  WorkerStatusResult,
} from "@veolms/fleet-types";

import type { AwsCloudDriverOptions } from "./options.ts";
import { selectBestEC2Instance } from "./ec2-instances.ts";

function quoteForShell(val?: string | null): string {
  if (val === undefined || val === null) return "''";
  return `'${String(val).replace(/'/g, `'\\''`)}'`;
}

/**
 * AwsCloudDriver: Hexagonal driver for AWS EC2 Spot Instances & ECS Fargate workers.
 */
export class AwsCloudDriver implements CloudDriver {
  readonly name = "aws";
  readonly options: AwsCloudDriverOptions;
  private readonly ec2Client: EC2Client;
  private readonly workerInstanceMap = new Map<string, string>();

  constructor(options: AwsCloudDriverOptions) {
    this.options = options;
    this.ec2Client = new EC2Client({
      region: options.region || process.env.AWS_REGION || "us-east-1",
    });
  }

  get providerType(): WorkerProviderType {
    if (this.options.useSpotInstances === false) {
      return "aws_ec2";
    }
    return "aws_ec2";
  }

  private generateUserDataScript(spec: WorkerLaunchSpec): string {
    const isContainer = Boolean(this.options.workerContainerImage);
    const containerImage = this.options.workerContainerImage || "";
    const apiKey =
      process.env.FLEET_API_KEY || spec.environment?.FLEET_API_KEY || "";

    const workerIdVal = quoteForShell(spec.workerId);
    const managerUrlVal = quoteForShell(
      spec.managerApiUrl || this.options.fleetManagerApiUrl || "",
    );
    const dbUrlVal = quoteForShell(
      spec.queueConnectionString || this.options.databaseUrl || "",
    );
    const tempBucketVal = quoteForShell(this.options.tempS3Bucket || "");
    const prodBucketVal = quoteForShell(this.options.prodS3Bucket || "");
    const regionVal = quoteForShell(this.options.region || "us-east-1");
    const forceHwVal = quoteForShell(
      this.options.forceSoftwareEncoder ? "true" : "false",
    );
    const apiKeyVal = quoteForShell(apiKey);
    const containerImageVal = quoteForShell(containerImage);
    const safeContainerName = `veolms-worker-${spec.workerId.replace(/[^a-zA-Z0-9_-]/g, "")}`;

    const script = `#!/bin/bash
set -ex

# 1. Export Environment Variables for VeoLMS Media Worker
export WORKER_ID=${workerIdVal}
export FLEET_MANAGER_API_URL=${managerUrlVal}
export DATABASE_URL=${dbUrlVal}
export STORAGE_DRIVER="s3"
export S3_TEMP_BUCKET=${tempBucketVal}
export S3_PROD_BUCKET=${prodBucketVal}
export AWS_REGION=${regionVal}
export FORCE_SOFTWARE_ENCODER=${forceHwVal}
export FLEET_API_KEY=${apiKeyVal}

${
  isContainer
    ? `# 2. Container Execution Mode (Docker / Containerd)
docker pull ${containerImageVal} || true

docker run -d --restart=unless-stopped --name "${safeContainerName}" \\
  --net=host \\
  -e WORKER_ID="$WORKER_ID" \\
  -e FLEET_MANAGER_API_URL="$FLEET_MANAGER_API_URL" \\
  -e DATABASE_URL="$DATABASE_URL" \\
  -e STORAGE_DRIVER="s3" \\
  -e S3_TEMP_BUCKET="$S3_TEMP_BUCKET" \\
  -e S3_PROD_BUCKET="$S3_PROD_BUCKET" \\
  -e AWS_REGION="$AWS_REGION" \\
  -e FORCE_SOFTWARE_ENCODER="$FORCE_SOFTWARE_ENCODER" \\
  -e FLEET_API_KEY="$FLEET_API_KEY" \\
  ${containerImageVal}`
    : `# 2. Bare-Metal Native Host Process Execution (Zero-Docker Overhead)
cd /opt/veolms || cd /home/ec2-user/veolms || cd /app || true
if [ -f "apps/media-worker/src/index.ts" ]; then
  nohup node apps/media-worker/src/index.ts > /var/log/veolms-worker.log 2>&1 &
elif [ -f "node_modules/@veolms/media-worker/dist/index.js" ]; then
  nohup node node_modules/@veolms/media-worker/dist/index.js > /var/log/veolms-worker.log 2>&1 &
elif command -v pnpm >/dev/null 2>&1; then
  nohup pnpm --filter @veolms/media-worker start > /var/log/veolms-worker.log 2>&1 &
fi`
}
`;

    return Buffer.from(script, "utf-8").toString("base64");
  }

  /**
   * Provisions and boots a new EC2 Spot / On-Demand worker instance.
   * Dynamically selects the best machine type for the workload from the allowed instance pool.
   */
  async launchWorker(spec: WorkerLaunchSpec): Promise<WorkerLaunchResult> {
    const allowedPool =
      this.options.allowedInstanceTypes &&
      this.options.allowedInstanceTypes.length > 0
        ? this.options.allowedInstanceTypes
        : [this.options.instanceType || "c6i.xlarge"];

    const meta =
      (spec as unknown as { metadata?: Record<string, unknown> }).metadata ||
      {};

    const instanceType =
      spec.instanceType ||
      selectBestEC2Instance(allowedPool, {
        complexityScore:
          (meta.complexityScore as number) ||
          (spec.environment?.COMPLEXITY_SCORE
            ? parseFloat(spec.environment.COMPLEXITY_SCORE)
            : undefined),
        is4KOrAbove: Boolean(meta.is4K || spec.environment?.IS_4K === "true"),
        isGpuPreferred:
          !this.options.forceSoftwareEncoder &&
          Boolean(
            meta.isGpuPreferred || spec.environment?.GPU_PREFERRED === "true",
          ),
      });

    const userDataBase64 = this.generateUserDataScript(spec);

    const runCmd = new RunInstancesCommand({
      ImageId: this.options.amiId || "ami-0c7217cdde317cfec",
      InstanceType: instanceType as never,
      MinCount: 1,
      MaxCount: 1,
      SubnetId: this.options.subnetId,
      SecurityGroupIds: this.options.securityGroupIds,
      IamInstanceProfile: this.options.iamInstanceProfileArn
        ? { Arn: this.options.iamInstanceProfileArn }
        : undefined,
      KeyName: this.options.keyName,
      UserData: userDataBase64,
      InstanceMarketOptions:
        this.options.useSpotInstances !== false
          ? {
              MarketType: "spot",
              SpotOptions: {
                MaxPrice: this.options.spotMaxPrice,
                SpotInstanceType: "one-time",
              },
            }
          : undefined,
      TagSpecifications: [
        {
          ResourceType: "instance",
          Tags: [
            { Key: "Name", Value: `veolms-worker-${spec.workerId}` },
            { Key: "Project", Value: "VeoLMS" },
            { Key: "VeoLMSWorkerId", Value: spec.workerId },
          ],
        },
      ],
    });

    try {
      const res = await this.ec2Client.send(runCmd);
      const instance = res.Instances?.[0];
      const instanceId = instance?.InstanceId || `i-mock-${spec.workerId}`;

      this.workerInstanceMap.set(spec.workerId, instanceId);

      return {
        workerId: spec.workerId,
        instanceId,
        provider: this.providerType,
        state: "PROVISIONING",
        launchedAt: new Date(),
        metadata: {
          instanceId,
          instanceType,
          privateIp: instance?.PrivateIpAddress,
        },
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes("Credentials") ||
        msg.includes("AuthFailure") ||
        msg.includes("UnauthorizedOperation") ||
        msg.includes("AccessDenied")
      ) {
        throw new Error(
          `AWS EC2 Launch Failed: Authentication or IAM Permission Error.\n👉 Please run 'aws configure' or attach an IAM Role (Instance Profile).\nDetails: ${msg}`,
        );
      }
      throw err;
    }
  }

  /**
   * Decommissions and terminates an active EC2 worker instance.
   */
  async terminateWorker(workerId: string): Promise<void> {
    const instanceId = this.workerInstanceMap.get(workerId) || workerId;
    try {
      await this.ec2Client.send(
        new TerminateInstancesCommand({
          InstanceIds: [instanceId],
        }),
      );
    } catch {
      // Ignore if already terminated
    } finally {
      this.workerInstanceMap.delete(workerId);
    }
  }

  /**
   * Queries the live status and health of an EC2 worker instance.
   */
  async getWorkerStatus(workerId: string): Promise<WorkerStatusResult> {
    const instanceId = this.workerInstanceMap.get(workerId) || workerId;
    try {
      const res = await this.ec2Client.send(
        new DescribeInstancesCommand({
          InstanceIds: [instanceId],
        }),
      );

      const stateName = res.Reservations?.[0]?.Instances?.[0]?.State?.Name;
      const isHealthy = stateName === "running" || stateName === "pending";

      return {
        workerId,
        instanceId,
        provider: this.providerType,
        state: isHealthy ? "IDLE" : "TERMINATED",
        isHealthy,
        metadata: {
          awsState: stateName,
        },
      };
    } catch {
      return {
        workerId,
        instanceId,
        provider: this.providerType,
        state: "TERMINATED",
        isHealthy: false,
      };
    }
  }

  /**
   * Lists all active EC2 worker instances tagged for VeoLMS.
   */
  async listWorkers(): Promise<readonly WorkerStatusResult[]> {
    try {
      const res = await this.ec2Client.send(
        new DescribeInstancesCommand({
          Filters: [
            { Name: "tag:Project", Values: ["VeoLMS"] },
            {
              Name: "instance-state-name",
              Values: ["pending", "running"],
            },
          ],
        }),
      );

      const workers: WorkerStatusResult[] = [];
      for (const reservation of res.Reservations ?? []) {
        for (const inst of reservation.Instances ?? []) {
          const workerTag = inst.Tags?.find((t) => t.Key === "VeoLMSWorkerId");
          const workerId = workerTag?.Value || inst.InstanceId || "unknown";
          const isHealthy = inst.State?.Name === "running";

          workers.push({
            workerId,
            instanceId: inst.InstanceId || workerId,
            provider: this.providerType,
            state: isHealthy ? "IDLE" : "PROVISIONING",
            isHealthy,
            metadata: {
              privateIp: inst.PrivateIpAddress,
              publicIp: inst.PublicIpAddress,
            },
          });
        }
      }

      return workers;
    } catch {
      return [];
    }
  }
}
