import type { QueueName } from "@veolms/fleet-types";

import type {
  QueueAdapter,
  QueueJob,
  QueueMetrics,
  QueuePublishOptions,
} from "./types.ts";

interface InternalJobState {
  id: string;
  name: QueueName;
  data: unknown;
  state:
    | "created"
    | "retry"
    | "active"
    | "completed"
    | "expired"
    | "cancelled"
    | "failed";
  retryCount: number;
  retryLimit: number;
  createdOn: Date;
  startedOn?: Date | null;
  completedOn?: Date | null;
  errorMessage?: string;
}

/**
 * High-performance In-Memory Queue Adapter implementing QueueAdapter.
 * Used for simulated fleet tests and local environments.
 */
export class InMemoryQueueAdapter implements QueueAdapter {
  private connected = false;
  private readonly queues = new Map<QueueName, InternalJobState[]>();

  get isConnected(): boolean {
    return this.connected;
  }

  async start(): Promise<void> {
    this.connected = true;
  }

  async stop(): Promise<void> {
    this.connected = false;
  }

  private getQueueList(queue: QueueName): InternalJobState[] {
    let list = this.queues.get(queue);
    if (!list) {
      list = [];
      this.queues.set(queue, list);
    }
    return list;
  }

  async publish<T extends object>(
    queue: QueueName,
    payload: T,
    options?: QueuePublishOptions,
  ): Promise<string> {
    const list = this.getQueueList(queue);
    const id = `job-${Math.random().toString(36).substring(2, 11)}`;

    const job: InternalJobState = {
      id,
      name: queue,
      data: payload,
      state: "created",
      retryCount: 0,
      retryLimit: options?.retryLimit ?? 3,
      createdOn: new Date(),
    };

    list.push(job);
    return id;
  }

  async publishBatch<T extends object>(
    queue: QueueName,
    items: readonly T[],
    options?: QueuePublishOptions,
  ): Promise<readonly string[]> {
    const ids: string[] = [];
    for (const item of items) {
      ids.push(await this.publish(queue, item, options));
    }
    return ids;
  }

  async fetchNextJob<T extends object>(
    queue: QueueName,
  ): Promise<QueueJob<T> | null> {
    const list = this.getQueueList(queue);
    const pendingJob = list.find(
      (j) => j.state === "created" || j.state === "retry",
    );

    if (!pendingJob) {
      return null;
    }

    pendingJob.state = "active";
    pendingJob.startedOn = new Date();

    return {
      id: pendingJob.id,
      name: pendingJob.name,
      data: pendingJob.data as T,
      state: "active",
      retryCount: pendingJob.retryCount,
      createdOn: pendingJob.createdOn,
      startedOn: pendingJob.startedOn,
      completedOn: pendingJob.completedOn,
    };
  }

  async completeJob(queue: QueueName, jobId: string): Promise<void> {
    const list = this.getQueueList(queue);
    const job = list.find(
      (j) =>
        j.id === jobId ||
        (j.data &&
          typeof j.data === "object" &&
          "chunkId" in j.data &&
          j.data.chunkId === jobId),
    );
    if (job) {
      job.state = "completed";
      job.completedOn = new Date();
    }
  }

  async failJob(
    queue: QueueName,
    jobId: string,
    errorMessage: string,
  ): Promise<void> {
    const list = this.getQueueList(queue);
    const job = list.find(
      (j) =>
        j.id === jobId ||
        (j.data &&
          typeof j.data === "object" &&
          "chunkId" in j.data &&
          j.data.chunkId === jobId),
    );
    if (job) {
      job.retryCount += 1;
      job.errorMessage = errorMessage;
      if (job.retryCount < job.retryLimit) {
        job.state = "retry";
      } else {
        job.state = "failed";
      }
    }
  }

  async getQueueMetrics(queue: QueueName): Promise<QueueMetrics> {
    const list = this.getQueueList(queue);
    let pending = 0;
    let active = 0;
    let completed = 0;
    let failed = 0;

    for (const job of list) {
      if (job.state === "created" || job.state === "retry") {
        pending += 1;
      } else if (job.state === "active") {
        active += 1;
      } else if (job.state === "completed") {
        completed += 1;
      } else if (job.state === "failed") {
        failed += 1;
      }
    }

    return { pending, active, completed, failed };
  }

  clear(): void {
    this.queues.clear();
  }
}
