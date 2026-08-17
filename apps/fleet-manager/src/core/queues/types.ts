import type { QueueName } from "@veolms/fleet-types";

export interface QueueJob<T = unknown> {
  readonly id: string;
  readonly name: QueueName;
  readonly data: T;
  readonly state:
    | "created"
    | "retry"
    | "active"
    | "completed"
    | "expired"
    | "cancelled"
    | "failed";
  readonly retryCount: number;
  readonly createdOn: Date;
  readonly startedOn?: Date | null;
  readonly completedOn?: Date | null;
}

export interface QueuePublishOptions {
  readonly priority?: number;
  readonly retryLimit?: number;
  readonly retryDelay?: number;
  readonly retryBackoff?: boolean;
  readonly expireInSeconds?: number;
  readonly singletonKey?: string;
}

export interface QueueMetrics {
  readonly pending: number;
  readonly active: number;
  readonly completed: number;
  readonly failed: number;
}

/**
 * Port contract for Queue Providers (e.g. pg-boss or In-Memory test adapter).
 */
export interface QueueAdapter {
  readonly isConnected: boolean;

  /**
   * Initializes queue schemas, tables, and workers.
   */
  start(): Promise<void>;

  /**
   * Gracefully drains and disconnects from the queue.
   */
  stop(): Promise<void>;

  /**
   * Publishes a single job to the designated queue.
   */
  publish<T extends object>(
    queue: QueueName,
    payload: T,
    options?: QueuePublishOptions,
  ): Promise<string>;

  /**
   * Publishes a batch of jobs to the designated queue atomically/efficiently.
   */
  publishBatch<T extends object>(
    queue: QueueName,
    items: readonly T[],
    options?: QueuePublishOptions,
  ): Promise<readonly string[]>;

  /**
   * Fetches the next available pending job from the queue.
   */
  fetchNextJob<T extends object>(queue: QueueName): Promise<QueueJob<T> | null>;

  /**
   * Acknowledges and completes an active job.
   */
  completeJob(queue: QueueName, jobId: string): Promise<void>;

  /**
   * Marks an active job as failed, triggering retries if configured.
   */
  failJob(queue: QueueName, jobId: string, errorMessage: string): Promise<void>;

  /**
   * Returns live backlog and active job counts for a queue.
   */
  getQueueMetrics(queue: QueueName): Promise<QueueMetrics>;
}
