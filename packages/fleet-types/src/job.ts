import { z } from "zod";
import {
  DEFAULT_QUALITIES,
  videoQualityLevelSchema,
  type VideoQualityLevel,
} from "./quality.ts";

export const JOB_STATUSES = [
  "QUEUED",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];
export const jobStatusSchema = z.enum(JOB_STATUSES);

// The codec/segment settings a job used to be able to override per-row were
// never actually set by the real inserter (the backend API only ever writes
// video_key/output_prefix/qualities/video_size) — so they're fixed defaults
// here instead of DB-backed fields nothing ever populated.
export const DEFAULT_VIDEO_CODEC = "h264";
export const DEFAULT_AUDIO_CODEC = "aac";
export const DEFAULT_SEGMENT_DURATION_SECONDS = 6;

export interface JobHardwareRequirements {
  minCpu: number;
  minMemoryMb: number;
  architecture: "arm64" | "x86_64";
  storageGb: number;
  estimatedDurationSeconds: number;
}

const BASE_HARDWARE: JobHardwareRequirements = {
  minCpu: 2,
  minMemoryMb: 4096,
  architecture: "arm64",
  storageGb: 30,
  estimatedDurationSeconds: 600,
};

const BYTES_PER_GB = 1024 ** 3;

/**
 * Derives how much hardware a job needs from what the backend actually
 * provides (video_size, qualities) instead of trusting a per-job hardware
 * object nothing ever wrote. Shared by fleet-manager (sizing a new EC2
 * worker) and media-worker (re-checking a claimed job against its own
 * capacity) so there is exactly one formula, not two that can drift apart.
 *
 * jobs.ts's SQL pre-filter (claimNextQueuedJob) mirrors only the
 * qualities-tier thresholds below in raw SQL, as a coarse pre-check — it
 * does not replicate the video-size scaling, which is re-checked here.
 * Keep the two in sync if the tier thresholds change.
 */
export function estimateJobHardware(
  videoSizeBytes: number,
  qualities: readonly VideoQualityLevel[],
): JobHardwareRequirements {
  let { minCpu, minMemoryMb, storageGb, estimatedDurationSeconds } =
    BASE_HARDWARE;
  const { architecture } = BASE_HARDWARE;

  const has2160p = qualities.includes("2160p");
  const has1440p = qualities.includes("1440p");
  const numQualities = qualities.length;

  if (has2160p) {
    minCpu = Math.max(minCpu, 8);
    minMemoryMb = Math.max(minMemoryMb, 16384);
    storageGb = Math.max(storageGb, 80);
  } else if (has1440p || numQualities >= 5) {
    minCpu = Math.max(minCpu, 4);
    minMemoryMb = Math.max(minMemoryMb, 8192);
    storageGb = Math.max(storageGb, 50);
  }

  const videoSizeGb = Math.max(videoSizeBytes, 0) / BYTES_PER_GB;

  // Scratch storage needs the source plus one full-size encode per
  // requested quality, with headroom. Starting-point heuristic — tune
  // against real job data once it's available.
  const estimatedStorageGb =
    Math.ceil(videoSizeGb * (numQualities + 1) * 1.5) + 5;
  storageGb = Math.max(storageGb, estimatedStorageGb);

  // ~15 CPU-minutes per source GB, scaled by however many renditions are
  // being produced in parallel. Same caveat as above — a first pass.
  const estimatedSecondsForSize = Math.ceil(videoSizeGb * 900) + 120;
  estimatedDurationSeconds = Math.max(
    estimatedDurationSeconds,
    estimatedSecondsForSize,
  );

  return {
    minCpu,
    minMemoryMb,
    architecture,
    storageGb,
    estimatedDurationSeconds,
  };
}

export interface Job {
  id: string;
  status: JobStatus;
  videoKey: string;
  outputPrefix: string;
  videoSize: number;
  qualities: readonly VideoQualityLevel[];
  workerId: string | null;
  attempts: number;
  maxAttempts: number;
  errorMessage: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
  updatedAt: Date;
}

export const qualitiesArraySchema = z
  .array(videoQualityLevelSchema)
  .min(1)
  .default([...DEFAULT_QUALITIES]);
