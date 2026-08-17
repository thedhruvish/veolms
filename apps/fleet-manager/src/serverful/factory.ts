import { createConfiguredDriver } from "./driver-instance.ts";
import type { CloudDriver } from "@veolms/fleet-types";

export interface DriverFactoryOptions {
  readonly workerScriptPath?: string;
  readonly containerImage?: string;
  readonly containerBinaryPath?: string;
  readonly volumeMounts?: readonly string[];
  readonly networkMode?: string;
  readonly environment?: Readonly<Record<string, string>>;
  readonly bootDelayMs?: number;
}

/**
 * Creates the designated CloudDriver instance using the configured provider driver factory.
 */
export function createCloudDriver(
  _driverType?: string,
  _options: DriverFactoryOptions = {},
): CloudDriver {
  return createConfiguredDriver();
}
