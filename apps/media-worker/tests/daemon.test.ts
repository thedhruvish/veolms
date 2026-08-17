import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import type { ChunkEncodingJobPayload, QueueName } from "@veolms/fleet-types";

import { loadWorkerConfig } from "../src/config/loader.ts";
import { LocalStorageAdapter } from "../src/storage/local-storage.ts";
import { ScratchWorkspaceManager } from "../src/storage/workspace.ts";
import { HeartbeatEmitter } from "../src/client/heartbeat-emitter.ts";
import { ChunkTranscodingRunner } from "../src/runner/chunk-runner.ts";
import {
  QueueJobConsumer,
  type WorkerQueueAdapterLike,
} from "../src/daemon/consumer.ts";
import { MediaWorkerDaemon } from "../src/daemon/daemon.ts";
import type { FluentFfmpegTranscoder } from "../src/ffmpeg/pipeline.ts";
import type {
  TranscodingOptions,
  TranscodingResult,
} from "../src/ffmpeg/types.ts";

class MockTranscoder implements Partial<FluentFfmpegTranscoder> {
  async transcodeChunk(
    options: TranscodingOptions,
  ): Promise<TranscodingResult> {
    const playlistFile = join(options.outputDir, "720p.m3u8");
    await writeFile(playlistFile, "#EXTM3U\n", "utf-8");

    return {
      success: true,
      renditions: ["720p"],
      masterPlaylistPath: join(options.outputDir, "master.m3u8"),
      outputDir: options.outputDir,
      durationMs: 10,
    };
  }
}

class TestQueueAdapter implements WorkerQueueAdapterLike {
  private jobs: Array<{ id: string; data: ChunkEncodingJobPayload }> = [];
  readonly completed: string[] = [];
  readonly failed: string[] = [];

  pushJob(job: ChunkEncodingJobPayload): string {
    const id = `job-${Math.random().toString(36).substring(2, 8)}`;
    this.jobs.push({ id, data: job });
    return id;
  }

  async fetchNextJob<T extends object>(
    _queue: QueueName,
  ): Promise<{ readonly id: string; readonly data: T } | null> {
    const job = this.jobs.shift();
    if (!job) return null;
    return { id: job.id, data: job.data as unknown as T };
  }

  async completeJob(_queue: QueueName, jobId: string): Promise<void> {
    this.completed.push(jobId);
  }

  async failJob(
    _queue: QueueName,
    jobId: string,
    _errorMessage: string,
  ): Promise<void> {
    this.failed.push(jobId);
  }
}

describe("Media Worker Daemon & Consumer", () => {
  const rootTestDir = `/tmp/veolms-daemon-test-${Math.random().toString(36).substring(2, 8)}`;
  const config = loadWorkerConfig({
    WORKER_ID: "mw-daemon-1",
    INSTANCE_ID: "inst-daemon-1",
    SCRATCH_DIR: rootTestDir,
  });

  const storage = new LocalStorageAdapter(join(rootTestDir, "storage"));
  const workspace = new ScratchWorkspaceManager(rootTestDir, "mw-daemon-1");
  const heartbeat = new HeartbeatEmitter(config);
  const mockTranscoder = new MockTranscoder() as FluentFfmpegTranscoder;

  it("should initialize daemon and return status", async () => {
    const daemon = new MediaWorkerDaemon({
      config,
      storage,
    });

    const status = daemon.getStatus();
    assert.equal(status.workerId, "mw-daemon-1");
    assert.equal(status.isRunning, false);
    assert.equal(status.totalJobsCompleted, 0);

    await daemon.stop();
  });

  it("should consume chunk jobs from queue and complete them", async () => {
    const testQueue = new TestQueueAdapter();

    // Seed mock source chunk
    const sourceKey = "videos/vid-200/chunks/chunk-001.mp4";
    const seedPaths = await workspace.createChunkWorkspace("seed-daemon");
    await writeFile(seedPaths.sourceFilePath, "mock-data", "utf-8");
    await storage.uploadFile(seedPaths.sourceFilePath, sourceKey);
    await workspace.cleanupChunkWorkspace("seed-daemon");

    // Push a job to queue
    const jobId = testQueue.pushJob({
      jobId: "job-vid-200",
      videoId: "vid-200",
      chunkId: "chunk-001",
      chunkIndex: 0,
      chunkKey: sourceKey,
      startSeconds: 0,
      durationSeconds: 60,
      requestedQualities: ["720p"],
    });

    const runner = new ChunkTranscodingRunner({
      config,
      storage,
      workspace,
      heartbeat,
      transcoder: mockTranscoder,
    });

    let shutdownCalled = false;
    const consumer = new QueueJobConsumer({
      config,
      queue: testQueue,
      runner,
      client: {
        sendNoWorkSignal: async () => ({ action: "TERMINATE", reason: "done" }),
      } as unknown as import("../src/client/fleet-client.ts").FleetApiClient,
      pollIntervalMs: 20,
      onShutdownRequested: async () => {
        shutdownCalled = true;
      },
    });

    await consumer.start();

    // Wait for consumer to process job and trigger NO_WORK termination
    await new Promise((resolve) => setTimeout(resolve, 80));

    assert.equal(testQueue.completed.includes(jobId), true);
    assert.equal(consumer.totalCompleted, 1);
    assert.equal(shutdownCalled, true);

    consumer.stop();
    await workspace.purgeWorkerWorkspace();
  });
});
