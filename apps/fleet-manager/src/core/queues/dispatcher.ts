import {
  VIDEO_CHUNK_ENCODING_QUEUE,
  VIDEO_PROCESSING_QUEUE,
  type ChunkEncodingJobPayload,
  type VideoProcessingJobPayload,
} from "@veolms/fleet-types";

import type { QueueAdapter } from "./types.ts";

/**
 * High-level job dispatch service for Queue 1 (video preparation) and Queue 2 (transcoding chunks).
 */
export class JobDispatchService {
  private readonly adapter: QueueAdapter;

  constructor(adapter: QueueAdapter) {
    this.adapter = adapter;
  }

  /**
   * Enqueues a top-level video processing job into Queue 1 ("video-processing").
   */
  async dispatchVideoProcessingJob(
    payload: VideoProcessingJobPayload,
  ): Promise<string> {
    return this.adapter.publish(VIDEO_PROCESSING_QUEUE, payload, {
      singletonKey: `video-proc-${payload.videoId}`,
      retryLimit: 3,
      expireInSeconds: 3600 * 4, // 4 hour safety expiration
    });
  }

  /**
   * Enqueues a batch of discrete chunk encoding jobs into Queue 2 ("video-chunk-encoding").
   */
  async dispatchChunkEncodingJobs(
    jobs: readonly ChunkEncodingJobPayload[],
  ): Promise<readonly string[]> {
    if (jobs.length === 0) {
      return [];
    }

    return this.adapter.publishBatch(VIDEO_CHUNK_ENCODING_QUEUE, jobs, {
      retryLimit: 3,
      expireInSeconds: 1800, // 30 minute timeout per chunk job
    });
  }

  /**
   * Enqueues a single chunk encoding job into Queue 2 ("video-chunk-encoding").
   */
  async dispatchSingleChunkEncodingJob(
    job: ChunkEncodingJobPayload,
  ): Promise<string> {
    return this.adapter.publish(VIDEO_CHUNK_ENCODING_QUEUE, job, {
      singletonKey: `chunk-enc-${job.videoId}-${job.chunkIndex}`,
      retryLimit: 3,
      expireInSeconds: 1800,
    });
  }
}
