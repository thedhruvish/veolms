import { createDatabase } from "../../database/src/index.ts";
import { createFleetManager } from "../../../apps/fleet-manager/src/core/fleet-manager.ts";
import { loadFleetManagerConfig } from "@veolms/config";
import { loadAwsProviderConfig } from "./config.ts";
import { createAwsProvider } from "./provider.ts";

export interface LambdaEvent {
  action?: "tick" | "claim" | "monitor" | "queue";
  [key: string]: unknown;
}

export interface LambdaResponse {
  statusCode: number;
  body: string;
}

export async function handler(
  event: LambdaEvent = {},
): Promise<LambdaResponse> {
  console.info(
    "[lambda] VeoLMS Fleet Manager Lambda invoked with event:",
    JSON.stringify(event),
  );

  const fleetConfig = loadFleetManagerConfig(process.env);
  const awsConfig = loadAwsProviderConfig(process.env);
  const db = createDatabase(fleetConfig.DATABASE_URL);

  const provider = createAwsProvider({
    region: awsConfig.AWS_REGION,
    iamInstanceProfile: awsConfig.EC2_IAM_INSTANCE_PROFILE,
    useSpot: awsConfig.EC2_USE_SPOT,
    keyName: awsConfig.KEY_NAME,
    securityGroupIds: awsConfig.SECURITY_GROUP_IDS
      ? awsConfig.SECURITY_GROUP_IDS.split(",")
          .map((id) => id.trim())
          .filter(Boolean)
      : undefined,
    defaultEnv: {
      DATABASE_URL: fleetConfig.DATABASE_URL,
      STORAGE_PROVIDER: awsConfig.STORAGE_PROVIDER,
      ...(awsConfig.S3_BUCKET
        ? {
            S3_BUCKET: awsConfig.S3_BUCKET,
            S3_BUCKET_NAME: awsConfig.S3_BUCKET,
          }
        : {}),
      AWS_REGION: awsConfig.AWS_REGION,
      S3_USE_INSTANCE_ROLE: "true",
      ...(awsConfig.WORKER_IDLE_POLL_SECONDS
        ? {
            WORKER_IDLE_POLL_SECONDS: String(
              awsConfig.WORKER_IDLE_POLL_SECONDS,
            ),
          }
        : {}),
    },
  });

  const fleet = createFleetManager({
    provider,
    db,
    config: fleetConfig,
  });

  try {
    // 1. Run monitoring cycle first to clean up stale/timed-out workers and free capacity
    const monitorResult = await fleet.runMonitoringCycle();

    // 2. Claim and provision next queued job
    const claimed = await fleet.processNextJob();

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        jobClaimed: claimed,
        monitorResult,
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[lambda] Execution error:", message);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: message,
      }),
    };
  } finally {
    // A throw here would otherwise replace whatever the try/catch above
    // already decided to return (JS finally-block semantics), turning a
    // successful 200 response into a spurious Lambda execution failure.
    try {
      await db.destroy();
    } catch (destroyErr: unknown) {
      console.error("[lambda] Error closing database connection:", destroyErr);
    }
  }
}
