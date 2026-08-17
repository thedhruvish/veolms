import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import type { WorkerLaunchSpec, WorkerStatusResult } from "@veolms/fleet-types";

import type { LocalDriverOptions } from "./options.ts";

interface ActiveProcessEntry {
  readonly workerId: string;
  readonly instanceId: string;
  readonly process: ChildProcess;
  readonly pid: number;
  readonly launchedAt: Date;
  isStopping: boolean;
}

/**
 * Manages native background Node.js worker child processes on the local machine.
 */
export class ProcessWorkerRunner {
  private readonly processes = new Map<string, ActiveProcessEntry>();

  async spawnWorker(
    spec: WorkerLaunchSpec,
    options: LocalDriverOptions,
  ): Promise<{ readonly pid: number; readonly instanceId: string }> {
    const instanceId = `proc-${Math.random().toString(36).substring(2, 9)}`;
    const scriptPath =
      options.workerScriptPath ??
      resolve(process.cwd(), "apps/media-worker/src/index.ts");
    const nodeBinary = options.nodeBinaryPath ?? process.execPath;

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ...options.environment,
      ...spec.environment,
      WORKER_ID: spec.workerId,
      INSTANCE_ID: instanceId,
      PROVIDER: "local_process",
      MANAGER_API_URL: spec.managerApiUrl,
      QUEUE_CONNECTION_STRING: spec.queueConnectionString,
    };

    const child = spawn(nodeBinary, [scriptPath], {
      cwd: options.cwd ?? process.cwd(),
      env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
    });

    const pid = child.pid;
    if (!pid) {
      throw new Error(
        `Failed to retrieve PID for spawned worker process: ${spec.workerId}`,
      );
    }

    const entry: ActiveProcessEntry = {
      workerId: spec.workerId,
      instanceId,
      process: child,
      pid,
      launchedAt: new Date(),
      isStopping: false,
    };

    this.processes.set(spec.workerId, entry);

    child.stdout?.on("data", (chunk: Buffer) => {
      options.onLog?.(spec.workerId, "stdout", chunk.toString("utf-8"));
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      options.onLog?.(spec.workerId, "stderr", chunk.toString("utf-8"));
    });

    child.on("exit", (code, signal) => {
      this.processes.delete(spec.workerId);
      options.onExit?.(spec.workerId, code, signal);
    });

    return { pid, instanceId };
  }

  async terminateWorker(workerId: string, gracePeriodMs = 5000): Promise<void> {
    const entry = this.processes.get(workerId);
    if (!entry) {
      return;
    }

    entry.isStopping = true;

    // Send graceful SIGTERM first
    entry.process.kill("SIGTERM");

    // Wait for exit or escalate to SIGKILL
    await new Promise<void>((resolve) => {
      let isDone = false;

      const finish = (): void => {
        if (!isDone) {
          isDone = true;
          this.processes.delete(workerId);
          resolve();
        }
      };

      entry.process.once("exit", finish);

      setTimeout(() => {
        if (!isDone) {
          try {
            entry.process.kill("SIGKILL");
          } catch {
            // Process may have already exited
          }
          finish();
        }
      }, gracePeriodMs);
    });
  }

  getWorkerStatus(workerId: string): WorkerStatusResult {
    const entry = this.processes.get(workerId);
    if (!entry) {
      return {
        workerId,
        instanceId: `unknown-${workerId}`,
        provider: "local_process",
        state: "TERMINATED",
        isHealthy: false,
        uptimeSeconds: 0,
      };
    }

    let isAlive = false;
    try {
      // Sending signal 0 checks if the process is alive without killing it
      process.kill(entry.pid, 0);
      isAlive = true;
    } catch {
      isAlive = false;
    }

    return {
      workerId,
      instanceId: entry.instanceId,
      provider: "local_process",
      state: entry.isStopping ? "STOPPING" : isAlive ? "PROCESSING" : "FAILED",
      isHealthy: isAlive && !entry.isStopping,
      uptimeSeconds: Math.floor(
        (Date.now() - entry.launchedAt.getTime()) / 1000,
      ),
      metadata: {
        pid: entry.pid,
      },
    };
  }

  listWorkers(): readonly WorkerStatusResult[] {
    const results: WorkerStatusResult[] = [];
    for (const workerId of this.processes.keys()) {
      results.push(this.getWorkerStatus(workerId));
    }
    return results;
  }

  async clearAll(gracePeriodMs = 2000): Promise<void> {
    const terminatePromises = Array.from(this.processes.keys()).map((id) =>
      this.terminateWorker(id, gracePeriodMs),
    );
    await Promise.all(terminatePromises);
    this.processes.clear();
  }
}
