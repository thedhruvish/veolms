import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  ExecutionResult,
  FleetProvider,
  HealthStatus,
  WorkerHandle,
  WorkerSpec,
  WorkerStatus,
} from "@veolms/fleet-types";
import { LocalProcessRegistry } from "./process.ts";

const execFileAsync = promisify(execFile);

export interface LocalProviderConfig {
  readonly workerExecutable?: string;
  readonly workerScriptPath?: string;
  readonly defaultEnv?: Readonly<Record<string, string>>;
  readonly cwd?: string;
  readonly gracePeriodMs?: number;
}

export function parsePidFromWorkerId(providerWorkerId: string): number | null {
  if (providerWorkerId.startsWith("local-proc-")) {
    const rawPid = providerWorkerId.replace("local-proc-", "");
    const parsed = parseInt(rawPid, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const parsed = parseInt(providerWorkerId, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function createLocalProvider(
  config: LocalProviderConfig = {},
): FleetProvider {
  const registry = new LocalProcessRegistry();
  const workerExecutable = config.workerExecutable ?? process.execPath;
  const workerScriptPath = config.workerScriptPath;
  const gracePeriodMs = config.gracePeriodMs ?? 5000;

  return {
    name: "local",

    async createWorker(id: string, spec: WorkerSpec): Promise<WorkerHandle> {
      const args: string[] = [];
      if (workerScriptPath) {
        args.push(workerScriptPath);
      }

      const env: Record<string, string> = {
        ...config.defaultEnv,
        ...spec.environmentVariables,
        WORKER_ID: id,
        PROVIDER: "local",
      };

      const managed = registry.spawnProcess({
        workerId: id,
        command: workerExecutable,
        args,
        env,
        cwd: config.cwd,
      });

      return {
        id,
        providerWorkerId: `local-proc-${managed.pid}`,
        provider: "local",
        status: "STARTING",
        privateIp: "127.0.0.1",
        publicIp: null,
        createdAt: managed.startedAt,
      };
    },

    async getWorker(providerWorkerId: string): Promise<WorkerHandle | null> {
      const pid = parsePidFromWorkerId(providerWorkerId);
      if (!pid) {
        return null;
      }

      const managed = registry.getByPid(pid);
      if (!managed) {
        return null;
      }

      const alive = registry.isAlive(pid);
      const status: WorkerStatus = alive
        ? "PROCESSING"
        : managed.exitCode === 0
          ? "COMPLETED"
          : "FAILED";

      return {
        id: managed.workerId,
        providerWorkerId,
        provider: "local",
        status,
        privateIp: "127.0.0.1",
        publicIp: null,
        createdAt: managed.startedAt,
      };
    },

    async getWorkerStatus(providerWorkerId: string): Promise<WorkerStatus> {
      const pid = parsePidFromWorkerId(providerWorkerId);
      if (!pid) {
        return "TERMINATED";
      }

      const managed = registry.getByPid(pid);
      if (!managed) {
        return registry.isAlive(pid) ? "PROCESSING" : "TERMINATED";
      }

      if (managed.terminated) {
        return managed.exitCode === 0 ? "COMPLETED" : "FAILED";
      }

      if (!registry.isAlive(pid)) {
        managed.terminated = true;
        return managed.exitCode === 0 ? "COMPLETED" : "FAILED";
      }

      return "PROCESSING";
    },

    async execute(
      _providerWorkerId: string,
      command: readonly string[],
    ): Promise<ExecutionResult> {
      const cmd = command[0];
      if (!cmd) {
        return { exitCode: 0, stdout: "", stderr: "" };
      }

      const args = command.slice(1);
      try {
        const { stdout, stderr } = await execFileAsync(cmd, [...args]);
        return {
          exitCode: 0,
          stdout: stdout.toString(),
          stderr: stderr.toString(),
        };
      } catch (err: unknown) {
        const error = err as {
          code?: number | string;
          stdout?: string | Buffer;
          stderr?: string | Buffer;
        };
        return {
          exitCode: typeof error.code === "number" ? error.code : 1,
          stdout: error.stdout?.toString() ?? "",
          stderr: error.stderr?.toString() ?? String(err),
        };
      }
    },

    async terminateWorker(providerWorkerId: string): Promise<void> {
      const pid = parsePidFromWorkerId(providerWorkerId);
      if (!pid) {
        return;
      }

      await registry.terminate(pid, gracePeriodMs);
      const managed = registry.getByPid(pid);
      if (managed) {
        registry.remove(managed.workerId);
      }
    },

    async healthCheck(providerWorkerId: string): Promise<HealthStatus> {
      const pid = parsePidFromWorkerId(providerWorkerId);
      if (!pid) {
        return {
          healthy: false,
          state: "TERMINATED",
          message: `Invalid PID for worker handle: ${providerWorkerId}`,
        };
      }

      const isAlive = registry.isAlive(pid);
      if (!isAlive) {
        const managed = registry.getByPid(pid);
        return {
          healthy: false,
          state: managed?.exitCode === 0 ? "COMPLETED" : "FAILED",
          message: `Process ${pid} is not running. Exit code: ${managed?.exitCode ?? "unknown"}`,
        };
      }

      return {
        healthy: true,
        state: "PROCESSING",
        message: `Process ${pid} is healthy and running`,
      };
    },
  };
}
