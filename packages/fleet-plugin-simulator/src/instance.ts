import type {
  ChunkEncodingJobPayload,
  WorkerHeartbeatPayload,
  WorkerMetrics,
  WorkerRegistrationPayload,
  WorkerState,
  WorkerStatusResult,
} from "@veolms/fleet-types";

import {
  DEFAULT_SIMULATOR_OPTIONS,
  type SimulatorDriverOptions,
} from "./options.ts";

/**
 * In-memory simulated worker machine mimicking real FFmpeg transcoding lifecycle,
 * resource metrics, progress curves, and heartbeats.
 */
export class SimulatedWorkerInstance {
  readonly workerId: string;
  readonly instanceId: string;
  readonly provider = "simulator";
  readonly instanceType = "virtual.c5.2xlarge";
  readonly launchedAt: Date;

  private state: WorkerState = "PROVISIONING";
  private currentJobId: string | null = null;
  private currentVideoId: string | null = null;
  private currentChunkId: string | null = null;
  private progressPercent = 0;
  private fps = 0;
  private framesProcessed = 0;
  private estimatedRemainingSeconds = 0;
  private isTerminated = false;

  private activeTimer: ReturnType<typeof setTimeout> | null = null;
  private activeInterval: ReturnType<typeof setInterval> | null = null;
  private readonly options: Required<
    Omit<
      SimulatorDriverOptions,
      | "onWorkerRegister"
      | "onWorkerHeartbeat"
      | "onWorkerNoWork"
      | "onStateChange"
    >
  > &
    SimulatorDriverOptions;

  constructor(
    workerId: string,
    instanceId: string,
    options: SimulatorDriverOptions = {},
  ) {
    this.workerId = workerId;
    this.instanceId = instanceId;
    this.launchedAt = new Date();
    this.options = {
      ...DEFAULT_SIMULATOR_OPTIONS,
      ...options,
    };
  }

  getState(): WorkerState {
    return this.state;
  }

  getProgressPercent(): number {
    return this.progressPercent;
  }

  getCurrentJobId(): string | null {
    return this.currentJobId;
  }

  getCurrentVideoId(): string | null {
    return this.currentVideoId;
  }

  getCurrentChunkId(): string | null {
    return this.currentChunkId;
  }

  getStatus(): WorkerStatusResult {
    return {
      workerId: this.workerId,
      instanceId: this.instanceId,
      provider: this.provider,
      state: this.state,
      isHealthy: this.state !== "FAILED" && this.state !== "TERMINATED",
      uptimeSeconds: Math.floor(
        (Date.now() - this.launchedAt.getTime()) / 1000,
      ),
      metadata: {
        currentJobId: this.currentJobId,
        currentVideoId: this.currentVideoId,
        currentChunkId: this.currentChunkId,
        progressPercent: this.progressPercent,
        fps: this.fps,
        framesProcessed: this.framesProcessed,
        estimatedRemainingSeconds: this.estimatedRemainingSeconds,
      },
    };
  }

  private transitionState(newState: WorkerState): void {
    if (this.state === newState || this.isTerminated) {
      return;
    }
    const oldState = this.state;
    this.state = newState;
    this.options.onStateChange?.(this.workerId, oldState, newState);
  }

  private emitHeartbeat(): void {
    if (this.isTerminated) {
      return;
    }

    const metrics: WorkerMetrics = {
      cpuUsagePercent: this.state === "PROCESSING" ? 85.0 : 5.0,
      memoryUsageMb: this.state === "PROCESSING" ? 1420 : 250,
      diskFreeBytes: 50 * 1024 * 1024 * 1024,
    };

    const payload: WorkerHeartbeatPayload = {
      workerId: this.workerId,
      instanceId: this.instanceId,
      state: this.state,
      jobId: this.currentJobId ?? undefined,
      videoId: this.currentVideoId ?? undefined,
      chunkId: this.currentChunkId ?? undefined,
      progressPercent: this.progressPercent,
      fps: this.fps,
      framesProcessed: this.framesProcessed,
      estimatedRemainingSeconds: this.estimatedRemainingSeconds,
      metrics,
      timestamp: new Date().toISOString(),
    };

    this.options.onWorkerHeartbeat?.(payload);
  }

  /**
   * Simulates the boot sequence of an EC2/Docker worker machine.
   */
  async boot(): Promise<void> {
    if (this.isTerminated) {
      return;
    }

    this.transitionState("BOOTING");

    await new Promise<void>((resolve) => {
      this.activeTimer = setTimeout(
        () => {
          if (!this.isTerminated) {
            this.transitionState("REGISTERING");

            const regPayload: WorkerRegistrationPayload = {
              workerId: this.workerId,
              instanceId: this.instanceId,
              provider: this.provider,
              instanceType: this.instanceType,
              hostname: `simulated-worker-${this.instanceId}`,
              startedAt: this.launchedAt.toISOString(),
            };

            this.options.onWorkerRegister?.(regPayload);
            this.transitionState("IDLE");
            this.emitHeartbeat();
          }
          resolve();
        },
        this.options.bootDelayMs / Math.max(0.1, this.options.speedMultiplier),
      );
    });
  }

  /**
   * Simulates executing a video chunk encoding job with realistic progression,
   * reaching near-complete (>=85%) and 100%.
   */
  async processChunk(job: ChunkEncodingJobPayload): Promise<{
    readonly status: "SUCCESS" | "FAILED";
    readonly durationMs: number;
    readonly error?: string;
  }> {
    if (this.isTerminated) {
      return { status: "FAILED", durationMs: 0, error: "Worker is terminated" };
    }

    const startTime = Date.now();
    this.currentJobId = job.jobId;
    this.currentVideoId = job.videoId;
    this.currentChunkId = job.chunkId;
    this.progressPercent = 0;
    this.fps = 60.0;
    this.framesProcessed = 0;
    this.estimatedRemainingSeconds = Math.round(job.durationSeconds);

    this.transitionState("PROCESSING");
    this.emitHeartbeat();

    const totalDurationMs =
      this.options.simulatedChunkDurationMs /
      Math.max(0.1, this.options.speedMultiplier);
    const tickIntervalMs = this.options.tickIntervalMs;
    const totalTicks = Math.max(
      1,
      Math.floor(totalDurationMs / tickIntervalMs),
    );
    let currentTick = 0;

    return new Promise((resolve) => {
      this.activeInterval = setInterval(() => {
        if (this.isTerminated) {
          if (this.activeInterval) clearInterval(this.activeInterval);
          resolve({
            status: "FAILED",
            durationMs: Date.now() - startTime,
            error: "Worker terminated during processing",
          });
          return;
        }

        currentTick += 1;
        const progressFraction = Math.min(1.0, currentTick / totalTicks);
        this.progressPercent = Number((progressFraction * 100).toFixed(1));
        this.framesProcessed = Math.floor(
          progressFraction * (job.durationSeconds * 30),
        );
        this.estimatedRemainingSeconds = Math.max(
          0,
          Math.round((1.0 - progressFraction) * job.durationSeconds),
        );

        this.emitHeartbeat();

        // Check if finished
        if (currentTick >= totalTicks) {
          if (this.activeInterval) clearInterval(this.activeInterval);
          this.activeInterval = null;

          // Check simulated failure injection
          if (
            this.options.failureRate > 0 &&
            Math.random() < this.options.failureRate
          ) {
            this.transitionState("FAILED");
            this.emitHeartbeat();
            resolve({
              status: "FAILED",
              durationMs: Date.now() - startTime,
              error: "Simulated encoding failure",
            });
            return;
          }

          // Transition to UPLOADING then IDLE
          this.transitionState("UPLOADING");
          this.emitHeartbeat();

          this.activeTimer = setTimeout(() => {
            if (!this.isTerminated) {
              this.currentJobId = null;
              this.currentVideoId = null;
              this.currentChunkId = null;
              this.progressPercent = 0;
              this.estimatedRemainingSeconds = 0;
              this.transitionState("IDLE");
              this.emitHeartbeat();
            }

            resolve({
              status: "SUCCESS",
              durationMs: Date.now() - startTime,
            });
          }, 20);
        }
      }, tickIntervalMs);
    });
  }

  /**
   * Triggers a NO_WORK signal to indicate the queue has no further pending tasks.
   */
  signalNoWork(lastCompletedChunkId?: string): void {
    if (this.isTerminated) {
      return;
    }

    this.options.onWorkerNoWork?.({
      workerId: this.workerId,
      instanceId: this.instanceId,
      lastCompletedChunkId,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Gracefully shuts down this simulated worker instance.
   */
  async terminate(): Promise<void> {
    if (this.isTerminated) {
      return;
    }

    this.transitionState("STOPPING");

    if (this.activeTimer) {
      clearTimeout(this.activeTimer);
      this.activeTimer = null;
    }
    if (this.activeInterval) {
      clearInterval(this.activeInterval);
      this.activeInterval = null;
    }

    this.isTerminated = true;
    this.transitionState("TERMINATED");
    this.emitHeartbeat();
  }
}
