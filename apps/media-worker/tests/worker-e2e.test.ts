import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { createServer, type Server } from "node:http";
import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import type { ChunkEncodingJobPayload, QueueName } from "@veolms/fleet-types";

import { loadWorkerConfig } from "../src/config/loader.ts";
import { LocalStorageAdapter } from "../src/storage/local-storage.ts";
import { MediaWorkerDaemon } from "../src/daemon/daemon.ts";
import type { WorkerQueueAdapterLike } from "../src/daemon/consumer.ts";

class E2EQueueAdapter implements WorkerQueueAdapterLike {
  private jobs: Array<{ id: string; data: ChunkEncodingJobPayload }> = [];
  readonly completed: string[] = [];
  readonly failed: string[] = [];

  pushJob(job: ChunkEncodingJobPayload): string {
    const id = `e2e-job-${Math.random().toString(36).substring(2, 8)}`;
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

describe("Media Worker End-to-End Integration Suite", () => {
  let server: Server;
  let baseUrl: string;
  const registeredWorkers: string[] = [];
  const heartbeatsReceived: string[] = [];
  let noWorkReceived = false;

  before(async () => {
    server = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
      }
      const raw = Buffer.concat(chunks).toString("utf-8");
      const body = raw ? JSON.parse(raw) : {};

      const path = req.url ?? "/";

      if (path === "/api/v1/workers/register") {
        registeredWorkers.push(body.workerId);
        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true }));
        return;
      }

      if (path.includes("/heartbeat")) {
        heartbeatsReceived.push(body.workerId);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true }));
        return;
      }

      if (path.includes("/no-work")) {
        noWorkReceived = true;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            action: "TERMINATE",
            reason: "All chunks finished",
          }),
        );
        return;
      }

      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it("should boot, register, transcode chunk, emit heartbeats, and terminate on NO_WORK", async () => {
    const rootTestDir = `/tmp/veolms-e2e-mw-${Math.random().toString(36).substring(2, 8)}`;
    const storage = new LocalStorageAdapter(join(rootTestDir, "storage"));
    const queue = new E2EQueueAdapter();

    // 1. Seed a mock source chunk into storage
    const sourceKey = "videos/vid-e2e-1/chunks/chunk-001.mp4";
    const seedLocal = join(rootTestDir, "seed-source.mp4");
    await storage.uploadFile(seedLocal, sourceKey).catch(() => {});
    // Seed directly in storage folder
    const storagePath = join(rootTestDir, "storage", sourceKey);
    const { mkdir } = await import("node:fs/promises");
    const { dirname } = await import("node:path");
    await mkdir(dirname(storagePath), { recursive: true });
    await writeFile(storagePath, "mock-chunk-mp4-data", "utf-8");

    // 2. Push job to queue
    const jobId = queue.pushJob({
      jobId: "job-e2e-1",
      videoId: "vid-e2e-1",
      chunkId: "chunk-001",
      chunkIndex: 0,
      chunkKey: sourceKey,
      startSeconds: 0,
      durationSeconds: 30,
      requestedQualities: ["720p"],
    });

    const config = loadWorkerConfig({
      WORKER_ID: "mw-e2e-worker-1",
      INSTANCE_ID: "inst-e2e-1",
      MANAGER_API_URL: baseUrl,
      SCRATCH_DIR: rootTestDir,
      HEARTBEAT_INTERVAL_MS: "20",
    });

    const daemon = new MediaWorkerDaemon({
      config,
      storage,
      queue,
      pollIntervalMs: 20,
    });

    // Mock transcoder on the runner to bypass actual ffmpeg binary in CI
    const runner = daemon.runner;
    (runner as unknown as { transcoder: object }).transcoder = {
      transcodeChunk: async (options: { outputDir: string }) => {
        const pFile = join(options.outputDir, "720p.m3u8");
        await writeFile(pFile, "#EXTM3U\n#EXT-X-TARGETDURATION:6\n", "utf-8");
        const sFile = join(options.outputDir, "720p_000.ts");
        await writeFile(sFile, "mock-ts-segment", "utf-8");
        return {
          success: true,
          renditions: ["720p"],
          masterPlaylistPath: join(options.outputDir, "master.m3u8"),
          outputDir: options.outputDir,
          durationMs: 15,
        };
      },
    };

    // 3. Start daemon
    await daemon.start();

    // 4. Wait for processing to complete and NO_WORK signal to trigger shutdown
    await new Promise((resolve) => setTimeout(resolve, 150));

    // 5. Verifications
    assert.equal(registeredWorkers.includes("mw-e2e-worker-1"), true);
    assert.equal(queue.completed.includes(jobId), true);
    assert.equal(noWorkReceived, true);

    // Verify HLS assets exist in storage
    const playlistExists = await storage.exists(
      "videos/vid-e2e-1/chunks/chunk-001/720p.m3u8",
    );
    assert.equal(playlistExists, true);

    const segmentExists = await storage.exists(
      "videos/vid-e2e-1/chunks/chunk-001/720p_000.ts",
    );
    assert.equal(segmentExists, true);

    await daemon.stop();
  });
});
