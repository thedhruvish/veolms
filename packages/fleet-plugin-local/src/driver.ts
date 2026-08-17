import type {
  CloudDriver,
  WorkerLaunchResult,
  WorkerLaunchSpec,
  WorkerProviderType,
  WorkerStatusResult,
} from "@veolms/fleet-types";

import { ContainerWorkerRunner } from "./container-runner.ts";
import {
  DEFAULT_LOCAL_DRIVER_OPTIONS,
  type LocalDriverOptions,
  type LocalRunnerMode,
} from "./options.ts";
import { ProcessWorkerRunner } from "./process-runner.ts";

/**
 * LocalCloudDriver: Infrastructure driver for running worker processes on the host machine
 * or inside local Podman / Docker rootless containers.
 */
export class LocalCloudDriver implements CloudDriver {
  readonly name = "local";

  private readonly options: LocalDriverOptions;
  private readonly processRunner: ProcessWorkerRunner;
  private readonly containerRunner: ContainerWorkerRunner;

  constructor(options: LocalDriverOptions = {}) {
    this.options = {
      ...DEFAULT_LOCAL_DRIVER_OPTIONS,
      ...options,
    };
    this.processRunner = new ProcessWorkerRunner();
    this.containerRunner = new ContainerWorkerRunner();
  }

  get providerType(): WorkerProviderType {
    const mode = this.options.runnerMode ?? "process";
    if (mode === "podman") return "local_podman";
    if (mode === "docker") return "local_docker";
    return "local_process";
  }

  get runnerMode(): LocalRunnerMode {
    return this.options.runnerMode ?? "process";
  }

  /**
   * Provisions and spawns a new local worker machine (process or Podman container).
   */
  async launchWorker(spec: WorkerLaunchSpec): Promise<WorkerLaunchResult> {
    const mode = this.runnerMode;

    if (mode === "podman" || mode === "docker") {
      const { containerId, containerName } =
        await this.containerRunner.spawnContainer(spec, this.options);

      return {
        workerId: spec.workerId,
        instanceId: containerId,
        provider: this.providerType,
        state: "PROVISIONING",
        launchedAt: new Date(),
        metadata: {
          containerName,
          containerId,
          engine: mode,
        },
      };
    }

    // Default: Process mode
    const { pid, instanceId } = await this.processRunner.spawnWorker(
      spec,
      this.options,
    );

    return {
      workerId: spec.workerId,
      instanceId,
      provider: "local_process",
      state: "PROVISIONING",
      launchedAt: new Date(),
      metadata: {
        pid,
        runner: "process",
      },
    };
  }

  /**
   * Decommissions and terminates an active local worker instance.
   */
  async terminateWorker(workerId: string): Promise<void> {
    const mode = this.runnerMode;
    const graceMs = this.options.terminationGracePeriodMs ?? 5000;

    if (mode === "podman" || mode === "docker") {
      await this.containerRunner.terminateContainer(
        workerId,
        this.options,
        Math.ceil(graceMs / 1000),
      );
      return;
    }

    await this.processRunner.terminateWorker(workerId, graceMs);
  }

  /**
   * Queries the live execution and health status of a local worker.
   */
  async getWorkerStatus(workerId: string): Promise<WorkerStatusResult> {
    const mode = this.runnerMode;

    if (mode === "podman" || mode === "docker") {
      return this.containerRunner.getContainerStatus(workerId, this.options);
    }

    return this.processRunner.getWorkerStatus(workerId);
  }

  /**
   * Lists all local worker instances currently managed by this driver.
   */
  async listWorkers(): Promise<readonly WorkerStatusResult[]> {
    const mode = this.runnerMode;

    if (mode === "podman" || mode === "docker") {
      return this.containerRunner.listContainers(this.options);
    }

    return this.processRunner.listWorkers();
  }

  /**
   * Shuts down all active local workers.
   */
  async clearAll(): Promise<void> {
    const mode = this.runnerMode;

    if (mode === "podman" || mode === "docker") {
      await this.containerRunner.clearAll(this.options);
      return;
    }

    await this.processRunner.clearAll(
      this.options.terminationGracePeriodMs ?? 2000,
    );
  }
}
