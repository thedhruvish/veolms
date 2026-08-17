import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  VIDEO_CHUNK_ENCODING_QUEUE,
  VIDEO_PROCESSING_QUEUE,
} from "@veolms/fleet-types";

import {
  InMemoryQueueAdapter,
  JobDispatchService,
  QueueInspectorService,
} from "../src/core/queues/index.ts";

describe("Queue Orchestration & Job Dispatcher", () => {
  let adapter: InMemoryQueueAdapter;
  let dispatcher: JobDispatchService;
  let inspector: QueueInspectorService;

  beforeEach(async () => {
    adapter = new InMemoryQueueAdapter();
    await adapter.start();
    dispatcher = new JobDispatchService(adapter);
    inspector = new QueueInspectorService(adapter);
  });

  it("should dispatch video processing job to Queue 1", async () => {
    const jobId = await dispatcher.dispatchVideoProcessingJob({
      jobId: "job-vid-1",
      videoId: "video-1",
      sourceKey: "videos/video-1/source/original.mp4",
      requestedQualities: ["240p", "720p", "1080p"],
      crf: 22,
      createdAt: new Date().toISOString(),
    });

    assert.ok(jobId.startsWith("job-"));

    const metrics = await adapter.getQueueMetrics(VIDEO_PROCESSING_QUEUE);
    assert.equal(metrics.pending, 1);
    assert.equal(metrics.active, 0);

    const fetched = await adapter.fetchNextJob(VIDEO_PROCESSING_QUEUE);
    assert.ok(fetched !== null);
    assert.equal(fetched.name, VIDEO_PROCESSING_QUEUE);

    const metricsAfterFetch = await adapter.getQueueMetrics(
      VIDEO_PROCESSING_QUEUE,
    );
    assert.equal(metricsAfterFetch.pending, 0);
    assert.equal(metricsAfterFetch.active, 1);
  });

  it("should dispatch chunk encoding batch to Queue 2", async () => {
    const chunkIds = await dispatcher.dispatchChunkEncodingJobs([
      {
        jobId: "job-vid-2",
        videoId: "video-2",
        chunkId: "chunk-001",
        chunkIndex: 0,
        chunkKey: "videos/video-2/chunks/chunk-001.mp4",
        startSeconds: 0,
        durationSeconds: 600,
        requestedQualities: ["240p", "720p"],
      },
      {
        jobId: "job-vid-2",
        videoId: "video-2",
        chunkId: "chunk-002",
        chunkIndex: 1,
        chunkKey: "videos/video-2/chunks/chunk-002.mp4",
        startSeconds: 600,
        durationSeconds: 600,
        requestedQualities: ["240p", "720p"],
      },
    ]);

    assert.equal(chunkIds.length, 2);

    const metrics = await adapter.getQueueMetrics(VIDEO_CHUNK_ENCODING_QUEUE);
    assert.equal(metrics.pending, 2);

    const pendingTotal = await inspector.getPendingCount();
    assert.equal(pendingTotal, 2);
  });

  it("should accurately perform race-safe drain check before worker termination", async () => {
    // 1. Initially empty
    assert.equal(await inspector.hasPendingOrActiveTasks(), false);
    assert.equal(await inspector.isDrained(), true);

    // 2. Dispatch a job
    const jobId = await dispatcher.dispatchSingleChunkEncodingJob({
      jobId: "job-vid-3",
      videoId: "video-3",
      chunkId: "chunk-001",
      chunkIndex: 0,
      chunkKey: "videos/video-3/chunks/chunk-001.mp4",
      startSeconds: 0,
      durationSeconds: 300,
      requestedQualities: ["1080p"],
    });

    // Should now report active/pending work exists
    assert.equal(await inspector.hasPendingOrActiveTasks(), true);
    assert.equal(await inspector.isDrained(), false);

    // 3. Worker fetches job
    const fetched = await adapter.fetchNextJob(VIDEO_CHUNK_ENCODING_QUEUE);
    assert.ok(fetched !== null);

    // Still has active in-flight task
    assert.equal(await inspector.hasPendingOrActiveTasks(), true);
    assert.equal(await inspector.isDrained(), false);

    // 4. Worker completes job
    await adapter.completeJob(VIDEO_CHUNK_ENCODING_QUEUE, jobId);

    // Now completely drained
    assert.equal(await inspector.hasPendingOrActiveTasks(), false);
    assert.equal(await inspector.isDrained(), true);
  });
});
