import type { VideoQuality } from "./video.ts";

/**
 * Queue 1: High-level video processing (analysis, dynamic sizing, stream-copy splitting).
 */
export const VIDEO_PROCESSING_QUEUE = "video-processing" as const;

/**
 * Queue 2: Individual chunk transcoding jobs.
 */
export const VIDEO_CHUNK_ENCODING_QUEUE = "video-chunk-encoding" as const;

export type QueueName =
  typeof VIDEO_PROCESSING_QUEUE | typeof VIDEO_CHUNK_ENCODING_QUEUE;

/**
 * Payload for Queue 1: Video Preparation & Split Job.
 */
export interface VideoProcessingJobPayload {
  readonly jobId: string;
  readonly videoId: string;
  readonly sourceKey: string;
  readonly requestedQualities: readonly VideoQuality[];
  readonly crf?: number;
  readonly s3BucketSource?: string;
  readonly s3BucketOutput?: string;
  readonly createdAt: string;
}

/**
 * Payload for Queue 2: Chunk Transcoding Job.
 */
export interface ChunkEncodingJobPayload {
  readonly jobId: string;
  readonly videoId: string;
  readonly chunkId: string;
  readonly chunkIndex: number;
  readonly chunkKey: string;
  readonly startSeconds: number;
  readonly durationSeconds: number;
  readonly requestedQualities: readonly VideoQuality[];
  readonly crf?: number;
  readonly isLastChunk?: boolean;
  readonly totalChunks?: number;
  readonly s3BucketSource?: string;
  readonly s3BucketOutput?: string;
}

/**
 * Standard outcome reported by worker after completing a queue job.
 */
export interface QueueJobCompletionPayload {
  readonly jobId: string;
  readonly videoId: string;
  readonly chunkId?: string;
  readonly workerId: string;
  readonly status: "SUCCESS" | "FAILED";
  readonly outputManifestKey?: string;
  readonly errorMessage?: string;
  readonly durationMs: number;
}
