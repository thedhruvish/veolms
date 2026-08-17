import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { join } from "node:path";
import { writeFile } from "node:fs/promises";

import { HeartbeatEmitter } from "../src/client/heartbeat-emitter.ts";
import { loadWorkerConfig } from "../src/config/loader.ts";
import {
  LocalStorageAdapter,
  ScratchWorkspaceManager,
} from "../src/storage/index.ts";
import { ChunkTranscodingRunner } from "../src/runner/chunk-runner.ts";
import type { FluentFfmpegTranscoder } from "../src/ffmpeg/pipeline.ts";
import type {
  TranscodingOptions,
  TranscodingResult,
} from "../src/ffmpeg/types.ts";

class MockTranscoder implements Partial<FluentFfmpegTranscoder> {
  async transcodeChunk(
    options: TranscodingOptions,
  ): Promise<TranscodingResult> {
    // Simulate progress callback
    options.onProgress?.({
      percent: 50,
      fps: 30,
      currentKbps: 2800,
      speed: "1.2x",
      framesProcessed: 900,
      etaSeconds: 10,
    });

    // Create a mock playlist file in outputDir
    const playlistFile = join(options.outputDir, "720p.m3u8");
    await writeFile(playlistFile, "#EXTM3U\n", "utf-8");

    return {
      success: true,
      renditions: ["720p"],
      masterPlaylistPath: join(options.outputDir, "master.m3u8"),
      outputDir: options.outputDir,
      durationMs: 25,
    };
  }
}

describe("Chunk Transcoding Runner", () => {
  const rootTestDir = `/tmp/veolms-runner-test-${Math.random().toString(36).substring(2, 8)}`;
  const config = loadWorkerConfig({
    WORKER_ID: "mw-runner-1",
    INSTANCE_ID: "inst-runner-1",
    SCRATCH_DIR: rootTestDir,
  });

  const storage = new LocalStorageAdapter(join(rootTestDir, "storage"));
  const workspace = new ScratchWorkspaceManager(rootTestDir, "mw-runner-1");
  const heartbeat = new HeartbeatEmitter(config);
  const mockTranscoder = new MockTranscoder() as FluentFfmpegTranscoder;

  it("should orchestrate download, mock transcoding, upload, and cleanup", async () => {
    // 1. Seed a mock source chunk in storage
    const sourceStorageKey = "videos/vid-100/chunks/chunk-001.mp4";
    const seedPaths = await workspace.createChunkWorkspace("seed");
    await writeFile(seedPaths.sourceFilePath, "mock-mp4-data", "utf-8");
    await storage.uploadFile(seedPaths.sourceFilePath, sourceStorageKey);
    await workspace.cleanupChunkWorkspace("seed");

    const runner = new ChunkTranscodingRunner({
      config,
      storage,
      workspace,
      heartbeat,
      transcoder: mockTranscoder,
    });

    // 2. Execute chunk transcode
    const result = await runner.executeChunk({
      jobId: "job-vid-100",
      videoId: "vid-100",
      chunkId: "chunk-001",
      chunkIndex: 0,
      chunkKey: sourceStorageKey,
      startSeconds: 0,
      durationSeconds: 60,
      requestedQualities: ["720p", "1080p"],
    });

    assert.equal(result.status, "SUCCESS");
    assert.equal(result.chunkId, "chunk-001");
    assert.equal(result.videoId, "vid-100");
    assert.deepEqual(result.renditionsProduced, ["720p"]);
    assert.ok(result.uploadedKeys.length > 0);

    // 3. Verify chunk scratch directory was cleaned up
    const chunkPaths = workspace.getChunkPaths("chunk-001");
    let exists = false;
    try {
      const { stat } = await import("node:fs/promises");
      await stat(chunkPaths.rootDir);
      exists = true;
    } catch {
      exists = false;
    }
    assert.equal(exists, false);

    await workspace.purgeWorkerWorkspace();
  });
});
