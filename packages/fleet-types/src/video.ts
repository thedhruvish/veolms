/**
 * Standard video resolution heights supported by the transcoding pipeline.
 */
export const VALID_VIDEO_QUALITIES = [
  "144p",
  "240p",
  "360p",
  "480p",
  "540p",
  "720p",
  "900p",
  "1080p",
  "1440p",
  "2160p",
  "4320p",
] as const;

export type VideoQuality = (typeof VALID_VIDEO_QUALITIES)[number];

/**
 * Quality weights used by the sizing engine to estimate transcoding complexity.
 */
export type QualityWeightMap = Readonly<Record<VideoQuality, number>>;

export const DEFAULT_QUALITY_WEIGHTS: QualityWeightMap = {
  "144p": 0.6,
  "240p": 0.8,
  "360p": 1.0,
  "480p": 1.2,
  "540p": 1.4,
  "720p": 2.0,
  "900p": 2.4,
  "1080p": 3.0,
  "1440p": 4.0,
  "2160p": 6.0,
  "4320p": 10.0,
};

/**
 * Video container and codec metadata extracted during media probe analysis.
 */
export interface SourceMetadata {
  readonly durationSeconds: number;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly codec: string;
  readonly bitrateBps?: number;
  readonly audioCodec?: string;
  readonly sizeBytes?: number;
}

/**
 * Lifecycle states for an entire video processing job.
 */
export type VideoJobStatus =
  "PENDING" | "SPLITTING" | "ENCODING" | "FINALIZING" | "COMPLETED" | "FAILED";

/**
 * Lifecycle states for an individual source chunk.
 */
export type VideoChunkStatus =
  "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
