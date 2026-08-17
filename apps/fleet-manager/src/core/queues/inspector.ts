import {
  VIDEO_CHUNK_ENCODING_QUEUE,
  VIDEO_PROCESSING_QUEUE,
  type QueueName,
} from "@veolms/fleet-types";

import type { QueueAdapter } from "./types.ts";

/**
 * Service to inspect queue metrics, backlog counts, and perform race-safe drain checks
 * before workers are decommissioned.
 */
export class QueueInspectorService {
  private readonly adapter: QueueAdapter;

  constructor(adapter: QueueAdapter) {
    this.adapter = adapter;
  }

  /**
   * Retrieves pending backlog count for a specific queue or across both Queue 1 & 2.
   */
  async getPendingCount(queueName?: QueueName): Promise<number> {
    if (queueName) {
      const metrics = await this.adapter.getQueueMetrics(queueName);
      return metrics.pending;
    }

    const [q1, q2] = await Promise.all([
      this.adapter.getQueueMetrics(VIDEO_PROCESSING_QUEUE),
      this.adapter.getQueueMetrics(VIDEO_CHUNK_ENCODING_QUEUE),
    ]);

    return q1.pending + q2.pending;
  }

  /**
   * Retrieves active in-flight count for a specific queue or across both Queue 1 & 2.
   */
  async getActiveCount(queueName?: QueueName): Promise<number> {
    if (queueName) {
      const metrics = await this.adapter.getQueueMetrics(queueName);
      return metrics.active;
    }

    const [q1, q2] = await Promise.all([
      this.adapter.getQueueMetrics(VIDEO_PROCESSING_QUEUE),
      this.adapter.getQueueMetrics(VIDEO_CHUNK_ENCODING_QUEUE),
    ]);

    return q1.active + q2.active;
  }

  /**
   * Race-safe check to verify if ANY pending or active transcoding tasks exist across the system.
   *
   * Crucial for §32.2: The Fleet Manager always re-checks queues after receiving a NO_WORK signal
   * before issuing a termination call to prevent terminating a worker right as new work arrives.
   */
  async hasPendingOrActiveTasks(): Promise<boolean> {
    const [q1, q2] = await Promise.all([
      this.adapter.getQueueMetrics(VIDEO_PROCESSING_QUEUE),
      this.adapter.getQueueMetrics(VIDEO_CHUNK_ENCODING_QUEUE),
    ]);

    const total = q1.pending + q1.active + q2.pending + q2.active;
    return total > 0;
  }

  /**
   * Checks if all queues are completely empty of pending and active work.
   */
  async isDrained(): Promise<boolean> {
    const hasWork = await this.hasPendingOrActiveTasks();
    return !hasWork;
  }
}
