import type { WorkerState } from "./worker.ts";

/**
 * Supported or known infrastructure provider names.
 */
export type WorkerProviderType =
  | "simulator"
  | "local_docker"
  | "local_podman"
  | "local_process"
  | "aws_ec2"
  | "gcp_compute"
  | "digitalocean"
  | "hetzner"
  | string;

/**
 * Specification passed to a CloudDriver to provision a new worker machine.
 */
export interface WorkerLaunchSpec {
  readonly workerId: string;
  readonly provider: WorkerProviderType;
  readonly instanceType?: string;
  readonly managerApiUrl: string;
  readonly queueConnectionString: string;
  readonly environment?: Readonly<Record<string, string>>;
  readonly tags?: Readonly<Record<string, string>>;
}

/**
 * Result returned immediately after a worker provisioning request is accepted.
 */
export interface WorkerLaunchResult {
  readonly workerId: string;
  readonly instanceId: string;
  readonly provider: WorkerProviderType;
  readonly state: WorkerState;
  readonly launchedAt: Date;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Live status query response for an active or stopping worker machine.
 */
export interface WorkerStatusResult {
  readonly workerId: string;
  readonly instanceId: string;
  readonly provider: WorkerProviderType;
  readonly state: WorkerState;
  readonly isHealthy: boolean;
  readonly uptimeSeconds?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Port interface (Hexagonal Architecture) that all cloud/local infrastructure drivers implement.
 * The Fleet Manager control plane communicates only via this abstraction.
 */
export interface CloudDriver {
  readonly name: string;
  readonly providerType: WorkerProviderType;

  /**
   * Provisions and boots a worker machine with injected bootstrap configuration.
   */
  launchWorker(spec: WorkerLaunchSpec): Promise<WorkerLaunchResult>;

  /**
   * Decommissions and shuts down a worker machine.
   */
  terminateWorker(workerId: string): Promise<void>;

  /**
   * Retrieves the current infrastructure status of a provisioned worker.
   */
  getWorkerStatus(workerId: string): Promise<WorkerStatusResult>;

  /**
   * Optional helper to list all active instances currently managed by this driver.
   */
  listWorkers?(): Promise<readonly WorkerStatusResult[]>;
}
