import {
  CloudWatchLogsClient,
  CreateLogGroupCommand,
  DeleteLogGroupCommand,
  DescribeLogGroupsCommand,
  PutRetentionPolicyCommand,
} from "@aws-sdk/client-cloudwatch-logs";

export interface CloudWatchLogsProvisionOptions {
  readonly region: string;
  readonly retentionInDays?: number;
  readonly managerLogGroupName?: string;
  readonly workerLogGroupName?: string;
  readonly lambdaLogGroupName?: string;
}

export interface CloudWatchLogsProvisionResult {
  readonly managerLogGroup: string;
  readonly workerLogGroup: string;
  readonly lambdaLogGroup: string;
  readonly retentionInDays: number;
}

/**
 * Automates provisioning of CloudWatch Log Groups with retention policies
 * for both Fleet Manager Control Plane and Media Worker EC2 Transcoders.
 */
export async function provisionCloudWatchLogs(
  options: CloudWatchLogsProvisionOptions,
): Promise<CloudWatchLogsProvisionResult> {
  const {
    region,
    retentionInDays = 14,
    managerLogGroupName = "/aws/veolms/fleet-manager",
    workerLogGroupName = "/aws/veolms/media-worker",
    lambdaLogGroupName = "/aws/lambda/VeoLMS-FleetManager-ControlPlane",
  } = options;

  const logs = new CloudWatchLogsClient({ region });
  const logGroups = [
    managerLogGroupName,
    workerLogGroupName,
    lambdaLogGroupName,
  ];

  for (const groupName of logGroups) {
    try {
      await logs.send(new CreateLogGroupCommand({ logGroupName: groupName }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("ResourceAlreadyExistsException")) {
        // Ignore if already exists
      }
    }

    // Set cost-optimized retention policy (e.g. 14 days)
    try {
      await logs.send(
        new PutRetentionPolicyCommand({
          logGroupName: groupName,
          retentionInDays,
        }),
      );
    } catch {
      // Ignore retention policy error
    }
  }

  return {
    managerLogGroup: managerLogGroupName,
    workerLogGroup: workerLogGroupName,
    lambdaLogGroup: lambdaLogGroupName,
    retentionInDays,
  };
}

/**
 * Tears down and deletes VeoLMS CloudWatch Log Groups.
 */
export async function destroyCloudWatchLogs(options: {
  region: string;
  managerLogGroupName?: string;
  workerLogGroupName?: string;
  lambdaLogGroupName?: string;
}): Promise<boolean> {
  const {
    region,
    managerLogGroupName = "/aws/veolms/fleet-manager",
    workerLogGroupName = "/aws/veolms/media-worker",
    lambdaLogGroupName = "/aws/lambda/VeoLMS-FleetManager-ControlPlane",
  } = options;

  const logs = new CloudWatchLogsClient({ region });
  const logGroups = [
    managerLogGroupName,
    workerLogGroupName,
    lambdaLogGroupName,
  ];

  let anyDeleted = false;
  for (const groupName of logGroups) {
    try {
      await logs.send(new DeleteLogGroupCommand({ logGroupName: groupName }));
      anyDeleted = true;
    } catch {
      // Ignore if not present
    }
  }

  return anyDeleted;
}

/**
 * Inspects status and existence of CloudWatch Log Groups.
 */
export async function checkCloudWatchLogs(options: {
  region: string;
  managerLogGroupName?: string;
  workerLogGroupName?: string;
}): Promise<{
  managerLogsActive: boolean;
  workerLogsActive: boolean;
}> {
  const {
    region,
    managerLogGroupName = "/aws/veolms/fleet-manager",
    workerLogGroupName = "/aws/veolms/media-worker",
  } = options;

  const logs = new CloudWatchLogsClient({ region });

  try {
    const res = await logs.send(
      new DescribeLogGroupsCommand({
        logGroupNamePrefix: "/aws/veolms/",
      }),
    );

    const names = (res.logGroups ?? []).map((g) => g.logGroupName);
    return {
      managerLogsActive: names.includes(managerLogGroupName),
      workerLogsActive: names.includes(workerLogGroupName),
    };
  } catch {
    return {
      managerLogsActive: false,
      workerLogsActive: false,
    };
  }
}
