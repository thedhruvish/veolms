import type { ChunkEncodingJobPayload } from "@veolms/fleet-types";

import type { HeartbeatEmitter } from "../client/heartbeat-emitter.ts";
import type { MediaWorkerConfig } from "../config/options.ts";
import { FluentFfmpegTranscoder } from "../ffmpeg/pipeline.ts";
import type { ScratchWorkspaceManager } from "../storage/workspace.ts";
import type { StorageAdapter } from "../storage/types.ts";
import type { ChunkExecutionResult } from "./types.ts";

export interface ChunkRunnerContext {
  readonly config: MediaWorkerConfig;
  readonly storage?: StorageAdapter;
  readonly tempStorage?: StorageAdapter;
  readonly prodStorage?: StorageAdapter;
  readonly workspace: ScratchWorkspaceManager;
  readonly heartbeat: HeartbeatEmitter;
  readonly transcoder?: FluentFfmpegTranscoder;
}

/**
 * ChunkTranscodingRunner: Orchestrates end-to-end chunk lifecycle:
 * workspace provisioning, download from Temp Storage, transcoding with live heartbeats,
 * HLS upload to Production Storage, and cleanup.
 */
export class ChunkTranscodingRunner {
  private readonly config: MediaWorkerConfig;
  private readonly tempStorage: StorageAdapter;
  private readonly prodStorage: StorageAdapter;
  private readonly workspace: ScratchWorkspaceManager;
  private readonly heartbeat: HeartbeatEmitter;
  private readonly transcoder: FluentFfmpegTranscoder;

  constructor(context: ChunkRunnerContext) {
    this.config = context.config;
    this.tempStorage =
      context.tempStorage ??
      context.storage ??
      (context as unknown as { tempStorage: StorageAdapter }).tempStorage;
    this.prodStorage =
      context.prodStorage ??
      context.storage ??
      (context as unknown as { prodStorage: StorageAdapter }).prodStorage;
    this.workspace = context.workspace;
    this.heartbeat = context.heartbeat;
    this.transcoder = context.transcoder ?? new FluentFfmpegTranscoder();
  }

  /**
   * Immediately aborts any ongoing FFmpeg transcoding job.
   */
  abort(): void {
    if (this.transcoder && typeof this.transcoder.abort === "function") {
      this.transcoder.abort();
    }
  }

  /**
   * Executes transcoding pipeline for a single chunk job payload.
   */
  async executeChunk(
    job: ChunkEncodingJobPayload,
  ): Promise<ChunkExecutionResult> {
    const startTime = Date.now();
    this.heartbeat.setState("PROCESSING", job.chunkId);

    const paths = await this.workspace.createChunkWorkspace(job.chunkId);

    try {
      // 1. Download source chunk from Temporary Storage to local input scratch folder
      await this.tempStorage.downloadFile(job.chunkKey, paths.sourceFilePath);

      // 2. Transcode with fluent-ffmpeg, streaming progress directly into HeartbeatEmitter
      const transcodeResult = await this.transcoder.transcodeChunk({
        sourcePath: paths.sourceFilePath,
        outputDir: paths.outputDir,
        requestedQualities: job.requestedQualities,
        sourceDurationSeconds: job.durationSeconds,
        crf: this.config.defaultCrf,
        preset: this.config.ffmpegPreset,
        hlsSegmentDuration: this.config.hlsSegmentDurationSeconds,
        onProgress: (p) => {
          this.heartbeat.updateProgress(p.percent, {
            currentFps: p.fps,
            currentKbps: p.currentKbps,
            speed: p.speed,
            etaSeconds: p.etaSeconds,
          });
        },
      });

      // 3. Upload generated HLS playlists and segments to Production Storage
      this.heartbeat.setState("UPLOADING", job.chunkId);
      const destinationPrefix = `videos/${job.videoId}/chunks/${job.chunkId}`;
      const uploadedKeys = await this.prodStorage.uploadDirectory(
        paths.outputDir,
        destinationPrefix,
      );

      // 4. Return to IDLE state
      this.heartbeat.setState("IDLE");

      return {
        chunkId: job.chunkId,
        videoId: job.videoId,
        status: "SUCCESS",
        durationMs: Date.now() - startTime,
        renditionsProduced: transcodeResult.renditions,
        uploadedKeys,
      };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.heartbeat.setState("FAILED", job.chunkId);

      return {
        chunkId: job.chunkId,
        videoId: job.videoId,
        status: "FAILED",
        durationMs: Date.now() - startTime,
        renditionsProduced: [],
        uploadedKeys: [],
        error: errorMessage,
      };
    } finally {
      // Guaranteed scratch cleanup
      await this.workspace.cleanupChunkWorkspace(job.chunkId);
    }
  }
}
