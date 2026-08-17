/**
 * Execution mode for locally spawned workers.
 * - process: Spawns Node.js background child processes on the host.
 * - podman: Spawns rootless Podman containers via Podman CLI.
 * - docker: Spawns Docker containers via Docker CLI.
 */
export type LocalRunnerMode = "process" | "podman" | "docker";

export interface LocalDriverOptions {
  /**
   * Execution engine to use for provisioning workers.
   * Default: "process" (with native "podman" support for container workloads)
   */
  readonly runnerMode?: LocalRunnerMode;

  /**
   * Absolute path to the media worker entrypoint script (for "process" mode).
   * Default: resolved to apps/media-worker/src/index.ts
   */
  readonly workerScriptPath?: string;

  /**
   * Podman/Docker container image name (for "podman" or "docker" mode).
   * Default: "veolms-media-worker:latest"
   */
  readonly containerImage?: string;

  /**
   * Path to the container runtime binary (e.g. "podman" or "docker").
   * Default: "podman" when runnerMode is "podman", "docker" when "docker".
   */
  readonly containerBinaryPath?: string;

  /**
   * Prefix for container names or process titles.
   * Default: "veolms-worker"
   */
  readonly namePrefix?: string;

  /**
   * Node binary path for process mode. Default: process.execPath
   */
  readonly nodeBinaryPath?: string;

  /**
   * Working directory for spawned worker child processes.
   */
  readonly cwd?: string;

  /**
   * Root path for local s3-bucket storage.
   */
  readonly storageBasePath?: string;

  /**
   * Custom environment variables injected into spawned workers.
   */
  readonly environment?: Readonly<Record<string, string>>;

  /**
   * Container volume mounts in format "hostPath:containerPath[:options]".
   */
  readonly volumeMounts?: readonly string[];

  /**
   * Container network mode (e.g. "host", "bridge", "slirp4netns").
   * Default: "host" for local podman/docker to seamlessly access host ports.
   */
  readonly networkMode?: string;

  /**
   * Grace period in ms before SIGKILL / force-kill is sent to unresponsive instances.
   * Default: 5000ms
   */
  readonly terminationGracePeriodMs?: number;

  /**
   * Callback invoked with stdout/stderr logs from spawned worker instances.
   */
  readonly onLog?: (
    workerId: string,
    stream: "stdout" | "stderr",
    chunk: string,
  ) => void;

  /**
   * Callback invoked when a worker process or container exits unexpectedly.
   */
  readonly onExit?: (
    workerId: string,
    exitCode: number | null,
    signal: string | null,
  ) => void;
}

export const DEFAULT_LOCAL_DRIVER_OPTIONS: Required<
  Omit<
    LocalDriverOptions,
    | "workerScriptPath"
    | "containerImage"
    | "containerBinaryPath"
    | "cwd"
    | "environment"
    | "volumeMounts"
    | "networkMode"
    | "storageBasePath"
    | "onLog"
    | "onExit"
  >
> = {
  runnerMode: "process",
  namePrefix: "veolms-worker",
  nodeBinaryPath: process.execPath,
  terminationGracePeriodMs: 5000,
};
