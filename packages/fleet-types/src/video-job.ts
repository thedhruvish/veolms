import { z } from "zod";
import {
  JOB_STATUSES,
  VIDEO_JOB_STATUSES,
  videoJobStatusSchema,
  type VideoJobStatus,
} from "@veolms/contracts";
import {
  DEFAULT_QUALITIES,
  getQualityProfile,
  videoQualityLevelSchema,
  type VideoQualityLevel,
} from "./quality.ts";

export { JOB_STATUSES, VIDEO_JOB_STATUSES, videoJobStatusSchema };
export type { VideoJobStatus };


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
  architecture: "ARM64" | "X86_64";
  storageGb: number;
  estimatedDurationSeconds: number;
}

const BASE_HARDWARE: JobHardwareRequirements = {
  minCpu: 2,
  minMemoryMb: 4096,
  architecture: "ARM64",
  storageGb: 30,
  estimatedDurationSeconds: 600,
};

const BYTES_PER_GB = 1024 ** 3;
const SAFETY_MARGIN_GB = 10;

/**
 * Derives how much hardware a job needs from video size, requested qualities,
 * and duration:
 * - CPU/Memory: Scaled based on target resolution and parallel rendition count.
 * - Storage: Estimated using:
 *     (video duration x total output bitrate) + source size + safety margin
 * - Duration: Explicit duration in seconds if provided, or estimated from source size.
 */
export function estimateJobHardware(
  videoSizeBytes: number,
  qualities: readonly VideoQualityLevel[],
  options?: { durationSeconds?: number } | number,
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

  const explicitDuration =
    typeof options === "number"
      ? options
      : typeof options?.durationSeconds === "number"
        ? options.durationSeconds
        : undefined;

  // 1. Calculate total output bitrate across all requested quality renditions (bits/sec)
  const totalBitrateBps = qualities.reduce((sum, q) => {
    const profile = getQualityProfile(q);
    if (!profile) return sum;
    return sum + (profile.videoBitrateKbps + profile.audioBitrateKbps) * 1000;
  }, 0);
  const totalOutputBytesPerSec = totalBitrateBps / 8;

  // 2. Video duration (use explicit duration if provided, otherwise estimate from size)
  // Default estimate assumes ~5 Mbps average source bitrate if duration is not known
  const estimatedDuration =
    typeof explicitDuration === "number" && explicitDuration > 0
      ? explicitDuration
      : Math.max(
          600,
          videoSizeBytes > 0
            ? Math.ceil(videoSizeBytes / (5 * 1000 * 1000 / 8))
            : 600,
        );
  estimatedDurationSeconds = Math.max(
    estimatedDurationSeconds,
    estimatedDuration,
  );

  // 3. Storage formula: (video duration x total output bitrate) + source size + safety margin
  const sourceSizeGb = Math.max(videoSizeBytes, 0) / BYTES_PER_GB;
  const estimatedOutputGb =
    (estimatedDurationSeconds * totalOutputBytesPerSec) / BYTES_PER_GB;
  const calculatedStorageGb =
    Math.ceil(sourceSizeGb + estimatedOutputGb + SAFETY_MARGIN_GB);

  storageGb = Math.max(storageGb, calculatedStorageGb);

  return {
    minCpu,
    minMemoryMb,
    architecture,
    storageGb,
    estimatedDurationSeconds,
  };
}

export const qualitiesArraySchema = z
  .array(videoQualityLevelSchema)
  .min(1)
  .default([...DEFAULT_QUALITIES]);
