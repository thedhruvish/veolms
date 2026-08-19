import {
  DescribeInstancesCommand,
  DescribeInstanceStatusCommand,
  EC2Client,
  RunInstancesCommand,
  TerminateInstancesCommand,
  type _InstanceType,
  type Instance,
} from "@aws-sdk/client-ec2";
import {
  GetCommandInvocationCommand,
  SendCommandCommand,
  SSMClient,
} from "@aws-sdk/client-ssm";
import type {
  ExecutionResult,
  FleetProvider,
  HealthStatus,
  WorkerHandle,
  WorkerSpec,
  WorkerStatus,
} from "@veolms/fleet-types";
import {
  encodeUserDataBase64,
  generateUserDataScript,
} from "./bootstrapper.ts";
import { selectOptimalInstanceType } from "./instance-types.ts";

export interface AwsProviderConfig {
  readonly region?: string;
  readonly amiId?: string;
  readonly securityGroupIds?: readonly string[];
  readonly subnetId?: string;
  readonly keyName?: string;
  readonly iamInstanceProfile?: string;
  readonly useSpot?: boolean;
  readonly usePrebakedAmi?: boolean;
  readonly defaultEnv?: Readonly<Record<string, string>>;
  readonly ec2Client?: EC2Client;
  readonly ssmClient?: SSMClient;
}

export function mapEc2StateToWorkerStatus(stateName?: string): WorkerStatus {
  switch (stateName) {
    case "pending":
      return "STARTING";
    case "running":
      return "PROCESSING";
    case "shutting-down":
      return "TERMINATING";
    case "terminated":
      return "TERMINATED";
    case "stopping":
    case "stopped":
      return "FAILED";
    default:
      return "PENDING";
  }
}

export function createAwsProvider(
  config: AwsProviderConfig = {},
): FleetProvider {
  const region = config.region ?? "us-east-1";
  const ec2 = config.ec2Client ?? new EC2Client({ region });
  const ssm = config.ssmClient ?? new SSMClient({ region });
  const defaultAmiId = config.amiId ?? "ami-0c7217cdde317cfec"; // Debian 14 / Ubuntu base default

  return {
    name: "aws",

    async createWorker(id: string, spec: WorkerSpec): Promise<WorkerHandle> {
      const instanceType = selectOptimalInstanceType(spec);
      const userDataScript = generateUserDataScript({
        workerId: id,
        spec,
        usePrebakedAmi: config.usePrebakedAmi,
        extraEnv: config.defaultEnv,
      });

      const userDataBase64 = encodeUserDataBase64(userDataScript);

      const command = new RunInstancesCommand({
        ImageId: defaultAmiId,
        InstanceType: instanceType as _InstanceType,
        MinCount: 1,
        MaxCount: 1,
        UserData: userDataBase64,
        SubnetId: config.subnetId,
        SecurityGroupIds: config.securityGroupIds
          ? [...config.securityGroupIds]
          : undefined,
        KeyName: config.keyName,
        IamInstanceProfile: config.iamInstanceProfile
          ? { Name: config.iamInstanceProfile }
          : undefined,
        InstanceMarketOptions: config.useSpot
          ? { MarketType: "spot" }
          : undefined,
        BlockDeviceMappings: [
          {
            DeviceName: "/dev/xvda",
            Ebs: {
              VolumeSize: Math.max(30, spec.storageGb),
              VolumeType: "gp3",
              DeleteOnTermination: true,
            },
          },
        ],
        TagSpecifications: [
          {
            ResourceType: "instance",
            Tags: [
              { Key: "Name", Value: `veolms-worker-${id.slice(0, 8)}` },
              { Key: "WorkerId", Value: id },
              { Key: "ManagedBy", Value: "veolms-fleet-manager" },
              { Key: "Architecture", Value: spec.architecture },
            ],
          },
        ],
      });

      const response = await ec2.send(command);
      const instance = response.Instances?.[0];

      if (!instance || !instance.InstanceId) {
        throw new Error(`Failed to launch EC2 instance for worker ${id}`);
      }

      return {
        id,
        providerWorkerId: instance.InstanceId,
        provider: "aws",
        status: "STARTING",
        privateIp: instance.PrivateIpAddress ?? null,
        publicIp: instance.PublicIpAddress ?? null,
        createdAt: instance.LaunchTime
          ? new Date(instance.LaunchTime)
          : new Date(),
      };
    },

    async getWorker(providerWorkerId: string): Promise<WorkerHandle | null> {
      try {
        const response = await ec2.send(
          new DescribeInstancesCommand({
            InstanceIds: [providerWorkerId],
          }),
        );

        const reservation = response.Reservations?.[0];
        const instance: Instance | undefined = reservation?.Instances?.[0];

        if (!instance || !instance.InstanceId) {
          return null;
        }

        const workerIdTag = instance.Tags?.find(
          (t) => t.Key === "WorkerId",
        )?.Value;
        const workerId = workerIdTag ?? instance.InstanceId;

        return {
          id: workerId,
          providerWorkerId: instance.InstanceId,
          provider: "aws",
          status: mapEc2StateToWorkerStatus(instance.State?.Name),
          privateIp: instance.PrivateIpAddress ?? null,
          publicIp: instance.PublicIpAddress ?? null,
          createdAt: instance.LaunchTime
            ? new Date(instance.LaunchTime)
            : new Date(),
        };
      } catch (err: unknown) {
        console.error(`Error describing instance ${providerWorkerId}:`, err);
        return null;
      }
    },

    async getWorkerStatus(providerWorkerId: string): Promise<WorkerStatus> {
      try {
        const response = await ec2.send(
          new DescribeInstancesCommand({
            InstanceIds: [providerWorkerId],
          }),
        );

        const instance = response.Reservations?.[0]?.Instances?.[0];
        if (!instance) {
          return "TERMINATED";
        }

        return mapEc2StateToWorkerStatus(instance.State?.Name);
      } catch {
        return "TERMINATED";
      }
    },

    async terminateWorker(providerWorkerId: string): Promise<void> {
      try {
        await ec2.send(
          new TerminateInstancesCommand({
            InstanceIds: [providerWorkerId],
          }),
        );
      } catch (err: unknown) {
        console.error(`Error terminating instance ${providerWorkerId}:`, err);
      }
    },

    async healthCheck(providerWorkerId: string): Promise<HealthStatus> {
      try {
        const response = await ec2.send(
          new DescribeInstanceStatusCommand({
            InstanceIds: [providerWorkerId],
            IncludeAllInstances: true,
          }),
        );

        const status = response.InstanceStatuses?.[0];
        if (!status) {
          return {
            healthy: false,
            state: "TERMINATED",
            message: `Instance status not found for ${providerWorkerId}`,
          };
        }

        const state = mapEc2StateToWorkerStatus(status.InstanceState?.Name);
        const systemOk = status.SystemStatus?.Status === "ok";
        const instanceOk = status.InstanceStatus?.Status === "ok";
        const isHealthy = state === "PROCESSING" && systemOk && instanceOk;

        return {
          healthy: isHealthy,
          state,
          message: `EC2 state: ${status.InstanceState?.Name ?? "unknown"}, System: ${status.SystemStatus?.Status ?? "unknown"}, Instance: ${status.InstanceStatus?.Status ?? "unknown"}`,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          healthy: false,
          state: "FAILED",
          message: `Health check failed: ${message}`,
        };
      }
    },

    async execute(
      providerWorkerId: string,
      command: readonly string[],
    ): Promise<ExecutionResult> {
      if (command.length === 0) {
        return { exitCode: 0, stdout: "", stderr: "" };
      }

      try {
        const sendCmd = new SendCommandCommand({
          InstanceIds: [providerWorkerId],
          DocumentName: "AWS-RunShellScript",
          Parameters: {
            commands: [command.join(" ")],
          },
        });

        const sendRes = await ssm.send(sendCmd);
        const commandId = sendRes.Command?.CommandId;

        if (!commandId) {
          return {
            exitCode: 1,
            stdout: "",
            stderr: "Failed to dispatch SSM command",
          };
        }

        // Wait briefly for SSM command execution
        const maxWaitMs = 10000;
        const start = Date.now();

        while (Date.now() - start < maxWaitMs) {
          await new Promise((r) => setTimeout(r, 1000));
          try {
            const inv = await ssm.send(
              new GetCommandInvocationCommand({
                CommandId: commandId,
                InstanceId: providerWorkerId,
              }),
            );

            if (inv.Status === "Success" || inv.Status === "Failed") {
              return {
                exitCode:
                  inv.ResponseCode ?? (inv.Status === "Success" ? 0 : 1),
                stdout: inv.StandardOutputContent ?? "",
                stderr: inv.StandardErrorContent ?? "",
              };
            }
          } catch {
            // Invocation might not be available immediately
          }
        }

        return {
          exitCode: 0,
          stdout: `Dispatched SSM command ${commandId}`,
          stderr: "",
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { exitCode: 1, stdout: "", stderr: message };
      }
    },
  };
}
