import type { WorkerState } from "@veolms/fleet-types";

export interface WorkerDaemonStatus {
  readonly workerId: string;
  readonly instanceId: string;
  readonly state: WorkerState;
  readonly isRunning: boolean;
  readonly activeJobsCount: number;
  readonly totalJobsCompleted: number;
  readonly totalJobsFailed: number;
  readonly currentChunkId?: string;
  readonly uptimeSeconds: number;
}
