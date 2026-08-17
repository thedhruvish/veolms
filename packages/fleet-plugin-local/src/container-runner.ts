import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { WorkerLaunchSpec, WorkerStatusResult } from "@veolms/fleet-types";

import type { LocalDriverOptions } from "./options.ts";

const execFileAsync = promisify(execFile);

interface ActiveContainerEntry {
  readonly workerId: string;
  readonly containerName: string;
  readonly containerId: string;
  readonly provider: "local_podman" | "local_docker";
  readonly launchedAt: Date;
  isStopping: boolean;
}

/**
 * Manages containerized worker execution using Podman (rootless/daemonless) or Docker CLI.
 */
export class ContainerWorkerRunner {
  private readonly containers = new Map<string, ActiveContainerEntry>();

  private getBinary(options: LocalDriverOptions): string {
    if (options.containerBinaryPath) {
      return options.containerBinaryPath;
    }
    return options.runnerMode === "docker" ? "docker" : "podman";
  }

  async isEngineAvailable(options: LocalDriverOptions): Promise<boolean> {
    const binary = this.getBinary(options);
    try {
      await execFileAsync(binary, ["version"]);
      return true;
    } catch {
      return false;
    }
  }

  async spawnContainer(
    spec: WorkerLaunchSpec,
    options: LocalDriverOptions,
  ): Promise<{ readonly containerId: string; readonly containerName: string }> {
    const binary = this.getBinary(options);
    const provider =
      options.runnerMode === "docker" ? "local_docker" : "local_podman";
    const namePrefix = options.namePrefix ?? "veolms-worker";
    const containerName = `${namePrefix}-${spec.workerId}`;
    const image = options.containerImage ?? "veolms-media-worker:latest";

    const args: string[] = ["run", "-d", "--name", containerName];

    // Inject required environment variables
    const envVars: Record<string, string> = {
      ...options.environment,
      ...spec.environment,
      WORKER_ID: spec.workerId,
      INSTANCE_ID: containerName,
      PROVIDER: provider,
      MANAGER_API_URL: spec.managerApiUrl,
      QUEUE_CONNECTION_STRING: spec.queueConnectionString,
    };

    for (const [key, value] of Object.entries(envVars)) {
      args.push("-e", `${key}=${value}`);
    }

    // Add volume mounts if configured
    if (options.volumeMounts && options.volumeMounts.length > 0) {
      for (const mount of options.volumeMounts) {
        args.push("-v", mount);
      }
    }

    args.push(image);

    const { stdout } = await execFileAsync(binary, args);
    const containerId = stdout.trim().substring(0, 12);

    const entry: ActiveContainerEntry = {
      workerId: spec.workerId,
      containerName,
      containerId,
      provider,
      launchedAt: new Date(),
      isStopping: false,
    };

    this.containers.set(spec.workerId, entry);

    return { containerId, containerName };
  }

  async terminateContainer(
    workerId: string,
    options: LocalDriverOptions,
    gracePeriodSeconds = 5,
  ): Promise<void> {
    const entry = this.containers.get(workerId);
    if (!entry) {
      return;
    }

    entry.isStopping = true;
    const binary = this.getBinary(options);

    try {
      // 1. Stop container gracefully with timeout
      await execFileAsync(binary, [
        "stop",
        "-t",
        String(gracePeriodSeconds),
        entry.containerName,
      ]);
    } catch {
      // Container may have already exited
    }

    try {
      // 2. Remove container
      await execFileAsync(binary, ["rm", "-f", entry.containerName]);
    } catch {
      // Ignore if container is already removed
    }

    this.containers.delete(workerId);
  }

  async getContainerStatus(
    workerId: string,
    options: LocalDriverOptions,
  ): Promise<WorkerStatusResult> {
    const entry = this.containers.get(workerId);
    if (!entry) {
      return {
        workerId,
        instanceId: `unknown-${workerId}`,
        provider:
          options.runnerMode === "docker" ? "local_docker" : "local_podman",
        state: "TERMINATED",
        isHealthy: false,
        uptimeSeconds: 0,
      };
    }

    const binary = this.getBinary(options);
    let isRunning = false;

    try {
      const { stdout } = await execFileAsync(binary, [
        "inspect",
        "--format",
        "{{.State.Running}}",
        entry.containerName,
      ]);
      isRunning = stdout.trim() === "true";
    } catch {
      isRunning = false;
    }

    return {
      workerId,
      instanceId: entry.containerId,
      provider: entry.provider,
      state: entry.isStopping
        ? "STOPPING"
        : isRunning
          ? "PROCESSING"
          : "TERMINATED",
      isHealthy: isRunning && !entry.isStopping,
      uptimeSeconds: Math.floor(
        (Date.now() - entry.launchedAt.getTime()) / 1000,
      ),
      metadata: {
        containerName: entry.containerName,
        containerId: entry.containerId,
      },
    };
  }

  async listContainers(
    options: LocalDriverOptions,
  ): Promise<readonly WorkerStatusResult[]> {
    const results: WorkerStatusResult[] = [];
    for (const workerId of this.containers.keys()) {
      results.push(await this.getContainerStatus(workerId, options));
    }
    return results;
  }

  async clearAll(options: LocalDriverOptions): Promise<void> {
    const terminatePromises = Array.from(this.containers.keys()).map((id) =>
      this.terminateContainer(id, options, 2),
    );
    await Promise.all(terminatePromises);
    this.containers.clear();
  }
}
