/**
 * State machine stages for a worker instance in the fleet pool.
 */
export type WorkerState =
  | "PROVISIONING"
  | "BOOTING"
  | "REGISTERING"
  | "IDLE"
  | "PROCESSING"
  | "UPLOADING"
  | "STOPPING"
  | "TERMINATED"
  | "FAILED";

/**
 * Worker hardware and process resource metrics reported via heartbeat.
 */
export interface WorkerMetrics {
  readonly cpuUsagePercent?: number;
  readonly memoryUsageMb?: number;
  readonly diskFreeBytes?: number;
}

/**
 * Payload sent by workers periodically to report transcoding progress and health.
 */
export interface WorkerHeartbeatPayload {
  readonly workerId: string;
  readonly instanceId: string;
  readonly state: WorkerState;
  readonly jobId?: string;
  readonly videoId?: string;
  readonly chunkId?: string;
  readonly progressPercent: number;
  readonly fps?: number;
  readonly framesProcessed?: number;
  readonly estimatedRemainingSeconds?: number;
  readonly metrics?: WorkerMetrics;
  readonly timestamp: string;
}

/**
 * Payload sent by a newly initialized worker during boot registration.
 */
export interface WorkerRegistrationPayload {
  readonly workerId: string;
  readonly instanceId: string;
  readonly provider: string;
  readonly instanceType: string;
  readonly ipAddress?: string;
  readonly hostname?: string;
  readonly startedAt: string;
}

/**
 * Signal sent by a worker when its queue check returns no pending tasks.
 */
export interface NoWorkSignalPayload {
  readonly workerId: string;
  readonly instanceId: string;
  readonly lastCompletedChunkId?: string;
  readonly timestamp: string;
}

/**
 * Full in-memory or database snapshot of a worker's status.
 */
export interface WorkerRecord {
  readonly id: string;
  readonly instanceId: string;
  readonly provider: string;
  readonly instanceType: string;
  readonly state: WorkerState;
  readonly currentJobId?: string | null;
  readonly currentVideoId?: string | null;
  readonly currentChunkId?: string | null;
  readonly progressPercent: number;
  readonly estimatedRemainingSeconds?: number | null;
  readonly fps?: number | null;
  readonly lastHeartbeatAt?: Date | string | null;
  readonly startedAt: Date | string;
  readonly idleSince?: Date | string | null;
  readonly terminatedAt?: Date | string | null;
}
