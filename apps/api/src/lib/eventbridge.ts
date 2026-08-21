import { EventBridgeClient } from "@aws-sdk/client-eventbridge";
import { config } from "../config.ts";

let clientInstance: EventBridgeClient | null = null;

/**
 * Lazily constructs a singleton EventBridge client, mirroring how
 * `getBoss()` (./pg-boss.ts) lazily constructs the pg-boss singleton.
 * Reuses the storage AWS credentials/region rather than introducing a
 * second credential set — see
 * docs/superpowers/specs/2026-08-20-video-processing-dual-dispatch-design.md
 * for why.
 */
export function getEventBridgeClient(): EventBridgeClient {
  if (!clientInstance) {
    clientInstance = new EventBridgeClient({
      region: config.STORAGE_REGION,
      credentials:
        config.STORAGE_ACCESS_KEY_ID && config.STORAGE_SECRET_ACCESS_KEY
          ? {
              accessKeyId: config.STORAGE_ACCESS_KEY_ID,
              secretAccessKey: config.STORAGE_SECRET_ACCESS_KEY,
            }
          : undefined,
    });
  }
  return clientInstance;
}
