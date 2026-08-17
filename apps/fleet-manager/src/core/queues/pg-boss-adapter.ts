import {
  VIDEO_CHUNK_ENCODING_QUEUE,
  VIDEO_PROCESSING_QUEUE,
  type QueueName,
} from "@veolms/fleet-types";

import type {
  QueueAdapter,
  QueueJob,
  QueueMetrics,
  QueuePublishOptions,
} from "./types.ts";

export interface PgBossClientLike {
  start(): Promise<unknown>;
  stop(options?: { graceful?: boolean; timeout?: number }): Promise<unknown>;
  send(name: string, data: object, options?: object): Promise<string | null>;
  send(
    jobs: Array<{ name: string; data: object; options?: object }>,
  ): Promise<string[] | null>;
  fetch<T>(name: string): Promise<{
    id: string;
    name: string;
    data: T;
    retrycount?: number;
    createdon?: Date;
    startedon?: Date;
  } | null>;
  complete(id: string): Promise<void>;
  fail(id: string, error: object | string): Promise<void>;
  getQueueSize?(name: string): Promise<number>;
}

/**
 * PostgreSQL pg-boss queue adapter for production distributed video transcoding queues.
 */
export class PgBossQueueAdapter implements QueueAdapter {
  private readonly boss: PgBossClientLike;
  private connected = false;

  constructor(bossClient: PgBossClientLike) {
    this.boss = bossClient;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  async start(): Promise<void> {
    await this.boss.start();
    this.connected = true;
  }

  async stop(): Promise<void> {
    await this.boss.stop({ graceful: true, timeout: 5000 });
    this.connected = false;
  }

  async publish<T extends object>(
    queue: QueueName,
    payload: T,
    options?: QueuePublishOptions,
  ): Promise<string> {
    const jobId = await this.boss.send(queue, payload, {
      priority: options?.priority,
      retryLimit: options?.retryLimit ?? 3,
      retryDelay: options?.retryDelay,
      retryBackoff: options?.retryBackoff,
      expireInSeconds: options?.expireInSeconds,
      singletonKey: options?.singletonKey,
    });

    if (!jobId) {
      throw new Error(`Failed to publish job to pg-boss queue: ${queue}`);
    }

    return jobId;
  }

  async publishBatch<T extends object>(
    queue: QueueName,
    items: readonly T[],
    options?: QueuePublishOptions,
  ): Promise<readonly string[]> {
    if (items.length === 0) {
      return [];
    }

    const batch = items.map((data) => ({
      name: queue,
      data,
      options: {
        priority: options?.priority,
        retryLimit: options?.retryLimit ?? 3,
        retryDelay: options?.retryDelay,
        retryBackoff: options?.retryBackoff,
        expireInSeconds: options?.expireInSeconds,
      },
    }));

    const result = await this.boss.send(batch);
    return result ?? [];
  }

  async fetchNextJob<T extends object>(
    queue: QueueName,
  ): Promise<QueueJob<T> | null> {
    const job = await this.boss.fetch<T>(queue);
    if (!job) {
      return null;
    }

    return {
      id: job.id,
      name: queue,
      data: job.data,
      state: "active",
      retryCount: job.retrycount ?? 0,
      createdOn: job.createdon ?? new Date(),
      startedOn: job.startedon ?? new Date(),
    };
  }

  async completeJob(_queue: QueueName, jobId: string): Promise<void> {
    await this.boss.complete(jobId);
  }

  async failJob(
    _queue: QueueName,
    jobId: string,
    errorMessage: string,
  ): Promise<void> {
    await this.boss.fail(jobId, new Error(errorMessage));
  }

  async getQueueMetrics(queue: QueueName): Promise<QueueMetrics> {
    const size = this.boss.getQueueSize
      ? await this.boss.getQueueSize(queue)
      : 0;

    return {
      pending: size,
      active: 0,
      completed: 0,
      failed: 0,
    };
  }
}
