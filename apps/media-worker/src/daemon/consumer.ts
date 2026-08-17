import {
  VIDEO_CHUNK_ENCODING_QUEUE,
  type ChunkEncodingJobPayload,
  type QueueName,
} from "@veolms/fleet-types";

import type { FleetApiClient } from "../client/fleet-client.ts";
import type { MediaWorkerConfig } from "../config/options.ts";
import type { ChunkTranscodingRunner } from "../runner/chunk-runner.ts";

export interface WorkerQueueAdapterLike {
  fetchNextJob<T extends object>(
    queue: QueueName,
  ): Promise<{ readonly id: string; readonly data: T } | null>;
  completeJob(queue: QueueName, jobId: string): Promise<void>;
  failJob(queue: QueueName, jobId: string, errorMessage: string): Promise<void>;
}

export interface ConsumerContext {
  readonly config: MediaWorkerConfig;
  readonly queue: WorkerQueueAdapterLike;
  readonly runner: ChunkTranscodingRunner;
  readonly client: FleetApiClient;
  readonly onShutdownRequested?: () => Promise<void>;
  readonly pollIntervalMs?: number;
}

/**
 * QueueJobConsumer: Polls Queue 2 (video-chunk-encoding), executes chunk jobs,
 * and handles the §32.2 NO_WORK lifecycle protocol when queue is empty.
 */
export class QueueJobConsumer {
  private readonly config: MediaWorkerConfig;
  private readonly queue: WorkerQueueAdapterLike;
  private readonly runner: ChunkTranscodingRunner;
  private readonly client: FleetApiClient;
  private readonly onShutdownRequested?: () => Promise<void>;
  private readonly pollIntervalMs: number;

  private isRunning = false;
  private currentJobId?: string;
  private completedCount = 0;
  private failedCount = 0;
  private lastCompletedChunkId?: string;

  constructor(context: ConsumerContext) {
    this.config = context.config;
    this.queue = context.queue;
    this.runner = context.runner;
    this.client = context.client;
    this.onShutdownRequested = context.onShutdownRequested;
    this.pollIntervalMs = context.pollIntervalMs ?? 1000;
  }

  get totalCompleted(): number {
    return this.completedCount;
  }

  get totalFailed(): number {
    return this.failedCount;
  }

  get activeChunkId(): string | undefined {
    return this.currentJobId;
  }

  /**
   * Starts the continuous queue consumer loop.
   */
  async start(): Promise<void> {
    this.isRunning = true;
    void this.runLoop();
  }

  /**
   * Stops the consumer loop.
   */
  stop(): void {
    this.isRunning = false;
  }

  private async runLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        // 1. Fetch next available chunk job from Queue 2
        const job = await this.queue.fetchNextJob<ChunkEncodingJobPayload>(
          VIDEO_CHUNK_ENCODING_QUEUE,
        );

        if (job) {
          this.currentJobId = job.data.chunkId;

          // 2. Execute chunk transcoding pipeline
          const result = await this.runner.executeChunk(job.data);

          if (result.status === "SUCCESS") {
            await this.queue.completeJob(VIDEO_CHUNK_ENCODING_QUEUE, job.id);
            this.completedCount += 1;
            this.lastCompletedChunkId = job.data.chunkId;
          } else {
            await this.queue.failJob(
              VIDEO_CHUNK_ENCODING_QUEUE,
              job.id,
              result.error ?? "Chunk transcoding failed",
            );
            this.failedCount += 1;
          }

          this.currentJobId = undefined;
          continue;
        }

        // 3. Queue is empty -> Emit NO_WORK signal (§32.2)
        const noWorkDecision = await this.client.sendNoWorkSignal({
          workerId: this.config.workerId,
          instanceId: this.config.instanceId,
          lastCompletedChunkId: this.lastCompletedChunkId,
          timestamp: new Date().toISOString(),
        });

        if (noWorkDecision.action === "TERMINATE") {
          this.isRunning = false;
          if (this.onShutdownRequested) {
            await this.onShutdownRequested();
          }
          break;
        }

        // If KEEP -> wait for poll interval before retrying queue
        await new Promise((resolve) =>
          setTimeout(resolve, this.pollIntervalMs),
        );
      } catch (err) {
        console.error(`Error in worker queue loop: ${String(err)}`);
        await new Promise((resolve) =>
          setTimeout(resolve, this.pollIntervalMs),
        );
      }
    }
  }
}
