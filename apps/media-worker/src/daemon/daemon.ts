import { FleetApiClient } from "../client/fleet-client.ts";
import { HeartbeatEmitter } from "../client/heartbeat-emitter.ts";
import { loadWorkerConfig, type MediaWorkerConfig } from "../config/index.ts";
import { ChunkTranscodingRunner } from "../runner/chunk-runner.ts";
import { createDualStorageAdapters } from "../storage/factory.ts";
import type { StorageAdapter } from "../storage/types.ts";
import { ScratchWorkspaceManager } from "../storage/workspace.ts";
import { QueueJobConsumer, type WorkerQueueAdapterLike } from "./consumer.ts";
import type { WorkerDaemonStatus } from "./types.ts";

export interface MediaWorkerDaemonOptions {
  readonly config?: MediaWorkerConfig;
  readonly storage?: StorageAdapter;
  readonly tempStorage?: StorageAdapter;
  readonly prodStorage?: StorageAdapter;
  readonly queue?: WorkerQueueAdapterLike;
  readonly pollIntervalMs?: number;
}

/**
 * MediaWorkerDaemon: Main daemon hosting the transcoding worker,
 * managing boot registration, queue polling, dual-storage resolution, heartbeats, and graceful shutdown.
 */
export class MediaWorkerDaemon {
  readonly config: MediaWorkerConfig;
  readonly tempStorage: StorageAdapter;
  readonly prodStorage: StorageAdapter;
  readonly storage: StorageAdapter;
  readonly workspace: ScratchWorkspaceManager;
  readonly client: FleetApiClient;
  readonly heartbeat: HeartbeatEmitter;
  readonly runner: ChunkTranscodingRunner;
  readonly consumer?: QueueJobConsumer;

  private isRunning = false;
  private readonly startedAt = new Date();

  constructor(options: MediaWorkerDaemonOptions = {}) {
    this.config = options.config ?? loadWorkerConfig();
    const dual = createDualStorageAdapters(this.config);
    this.tempStorage =
      options.tempStorage ?? options.storage ?? dual.tempStorage;
    this.prodStorage =
      options.prodStorage ?? options.storage ?? dual.prodStorage;
    this.storage = this.prodStorage;

    this.workspace = new ScratchWorkspaceManager(
      this.config.scratchDir,
      this.config.workerId,
    );
    this.client = new FleetApiClient(this.config.managerApiUrl);
    this.heartbeat = new HeartbeatEmitter(this.config, this.client);
    this.runner = new ChunkTranscodingRunner({
      config: this.config,
      tempStorage: this.tempStorage,
      prodStorage: this.prodStorage,
      workspace: this.workspace,
      heartbeat: this.heartbeat,
    });

    const queueAdapter: WorkerQueueAdapterLike = options.queue ?? {
      fetchNextJob: async () => {
        return this.client.fetchNextJob(this.config.workerId);
      },
      completeJob: async (_queue, jobId) => {
        return this.client.completeChunk(this.config.workerId, jobId);
      },
      failJob: async (_queue, jobId, error) => {
        return this.client.failChunk(this.config.workerId, jobId, error);
      },
    };

    this.consumer = new QueueJobConsumer({
      config: this.config,
      queue: queueAdapter,
      runner: this.runner,
      client: this.client,
      pollIntervalMs: options.pollIntervalMs ?? 1000,
      onShutdownRequested: async () => {
        await this.stop();
      },
    });
  }

  /**
   * Initializes and starts the worker daemon.
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    // 1. Register with Fleet Manager API
    await this.client.register({
      workerId: this.config.workerId,
      instanceId: this.config.instanceId,
      provider: this.config.provider,
      instanceType: this.config.instanceType ?? "standard",
      startedAt: this.startedAt.toISOString(),
    });

    // 2. Start heartbeat emitter
    this.heartbeat.start();

    // 3. Start queue consumer
    if (this.consumer) {
      await this.consumer.start();
    }

    this.isRunning = true;
  }

  /**
   * Gracefully shuts down the worker daemon.
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    // 1. Stop queue consumer
    this.consumer?.stop();

    // 2. Stop heartbeat emitter
    this.heartbeat.stop();

    // 3. Purge scratch workspace
    await this.workspace.purgeWorkerWorkspace();

    this.isRunning = false;
  }

  /**
   * Returns current daemon execution status.
   */
  getStatus(): WorkerDaemonStatus {
    return {
      workerId: this.config.workerId,
      instanceId: this.config.instanceId,
      state: this.consumer?.activeChunkId ? "PROCESSING" : "IDLE",
      isRunning: this.isRunning,
      activeJobsCount: this.consumer?.activeChunkId ? 1 : 0,
      totalJobsCompleted: this.consumer?.totalCompleted ?? 0,
      totalJobsFailed: this.consumer?.totalFailed ?? 0,
      currentChunkId: this.consumer?.activeChunkId,
      uptimeSeconds: Math.floor((Date.now() - this.startedAt.getTime()) / 1000),
    };
  }

  /**
   * Binds graceful OS process termination signal handlers.
   */
  setupSignalHandlers(): void {
    const shutdown = async (): Promise<void> => {
      await this.stop();
      process.exit(0);
    };

    process.on("SIGINT", () => {
      void shutdown();
    });
    process.on("SIGTERM", () => {
      void shutdown();
    });
  }
}
