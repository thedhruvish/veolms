import type { WorkerHeartbeatPayload, WorkerState } from "@veolms/fleet-types";

import type { MediaWorkerConfig } from "../config/options.ts";
import { FleetApiClient } from "./fleet-client.ts";
import { sampleSystemMetrics } from "./metrics.ts";
import type { LiveProgressState } from "./types.ts";

/**
 * Periodically transmits progress, health telemetry, and transcoding metrics
 * to the Fleet Manager control plane.
 */
export class HeartbeatEmitter {
  private readonly config: MediaWorkerConfig;
  private readonly client: FleetApiClient;
  private timer: ReturnType<typeof setInterval> | null = null;

  private state: LiveProgressState = {
    state: "IDLE",
    progressPercent: 0,
  };

  constructor(config: MediaWorkerConfig, client?: FleetApiClient) {
    this.config = config;
    this.client =
      client ?? new FleetApiClient(config.managerApiUrl, config.apiKey);
  }

  /**
   * Starts the background heartbeat timer.
   */
  start(): void {
    if (this.timer) {
      return;
    }

    this.timer = setInterval(async () => {
      await this.emitPulse();
    }, this.config.heartbeatIntervalMs);
  }

  /**
   * Stops the background heartbeat timer.
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Updates current lifecycle state and active chunk ID.
   */
  setState(state: WorkerState, currentChunkId?: string): void {
    this.state.state = state;
    this.state.currentChunkId = currentChunkId;
    if (state === "IDLE") {
      this.state.progressPercent = 0;
      this.state.currentFps = undefined;
      this.state.currentKbps = undefined;
      this.state.speed = undefined;
      this.state.estimatedTimeRemainingSeconds = undefined;
    }
  }

  /**
   * Updates real-time transcoding progress and telemetry.
   */
  updateProgress(
    progressPercent: number,
    options: {
      currentFps?: number;
      currentKbps?: number;
      speed?: string;
      etaSeconds?: number;
    } = {},
  ): void {
    this.state.progressPercent = Math.min(100, Math.max(0, progressPercent));
    if (options.currentFps !== undefined) {
      this.state.currentFps = options.currentFps;
    }
    if (options.currentKbps !== undefined) {
      this.state.currentKbps = options.currentKbps;
    }
    if (options.speed !== undefined) {
      this.state.speed = options.speed;
    }
    if (options.etaSeconds !== undefined) {
      this.state.estimatedTimeRemainingSeconds = options.etaSeconds;
    }
  }

  /**
   * Sends an immediate telemetry heartbeat pulse.
   */
  async emitPulse(): Promise<void> {
    const sysMetrics = sampleSystemMetrics();

    const payload: WorkerHeartbeatPayload = {
      workerId: this.config.workerId,
      instanceId: this.config.instanceId,
      state: this.state.state,
      chunkId: this.state.currentChunkId,
      progressPercent: this.state.progressPercent,
      fps: this.state.currentFps,
      estimatedRemainingSeconds: this.state.estimatedTimeRemainingSeconds,
      metrics: {
        cpuUsagePercent: sysMetrics.cpuPercent,
        memoryUsageMb: sysMetrics.memoryRssMb,
      },
      timestamp: new Date().toISOString(),
    };

    await this.client.sendHeartbeat(payload);
  }
}
