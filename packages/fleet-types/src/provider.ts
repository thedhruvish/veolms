import type {
  ProviderType,
  WorkerHandle,
  WorkerSpec,
  WorkerStatus,
} from "./worker.ts";

export interface ExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface HealthStatus {
  healthy: boolean;
  state: WorkerStatus;
  message?: string;
}

export interface FleetProvider {
  readonly name: ProviderType;
  createWorker(id: string, spec: WorkerSpec): Promise<WorkerHandle>;
  getWorker(providerWorkerId: string): Promise<WorkerHandle | null>;
  getWorkerStatus(providerWorkerId: string): Promise<WorkerStatus>;
  execute?(
    providerWorkerId: string,
    command: readonly string[],
  ): Promise<ExecutionResult>;
  terminateWorker(providerWorkerId: string): Promise<void>;
  healthCheck(providerWorkerId: string): Promise<HealthStatus>;
}
