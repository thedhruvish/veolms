import { LocalCloudDriver } from "@veolms/fleet-plugin-local";
import { SimulatorCloudDriver } from "@veolms/fleet-plugin-simulator";
import type { CloudDriver } from "@veolms/fleet-types";

export interface DriverFactoryOptions {
  readonly workerScriptPath?: string;
  readonly containerImage?: string;
  readonly containerBinaryPath?: string;
  readonly bootDelayMs?: number;
}

/**
 * Creates the designated CloudDriver instance based on configuration.
 */
export function createCloudDriver(
  driverType: string,
  options: DriverFactoryOptions = {},
): CloudDriver {
  const normalized = driverType.toLowerCase().trim();

  if (normalized === "simulator") {
    return new SimulatorCloudDriver({
      bootDelayMs: options.bootDelayMs ?? 50,
    });
  }

  if (normalized === "local_podman" || normalized === "podman") {
    return new LocalCloudDriver({
      runnerMode: "podman",
      containerImage: options.containerImage,
      containerBinaryPath: options.containerBinaryPath ?? "podman",
    });
  }

  if (normalized === "local_docker" || normalized === "docker") {
    return new LocalCloudDriver({
      runnerMode: "docker",
      containerImage: options.containerImage,
      containerBinaryPath: options.containerBinaryPath ?? "docker",
    });
  }

  // Default: local process runner
  return new LocalCloudDriver({
    runnerMode: "process",
    workerScriptPath: options.workerScriptPath,
  });
}
