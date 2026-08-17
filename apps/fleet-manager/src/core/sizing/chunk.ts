import {
  DEFAULT_FLEET_CONFIG,
  type DynamicChunkSizingResult,
  type FleetManagerConfig,
} from "@veolms/fleet-types";

/**
 * Clamps a number between a minimum and maximum bound.
 */
function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max);
}

/**
 * Implements Formula A: Dynamic No-Reencode Chunk Duration Sizing.
 *
 * Sizing principles:
 * - More requested qualities & higher source complexity => smaller chunk duration => more chunks => more parallelism.
 * - Fewer qualities & lower source complexity => larger chunk duration => fewer chunks => lower fleet overhead.
 * - Result is clamped between minChunkDurationSeconds (default: 300s / 5m) and maxChunkDurationSeconds (default: 1800s / 30m).
 */
export function calculateDynamicChunkDuration(
  videoDurationSeconds: number,
  qualityComplexity: number,
  sourceComplexity: number,
  config: Partial<FleetManagerConfig> = {},
): DynamicChunkSizingResult {
  const targetWorkBudget =
    config.targetChunkWorkBudget ?? DEFAULT_FLEET_CONFIG.targetChunkWorkBudget;
  const minDuration =
    config.minChunkDurationSeconds ??
    DEFAULT_FLEET_CONFIG.minChunkDurationSeconds;
  const maxDuration =
    config.maxChunkDurationSeconds ??
    DEFAULT_FLEET_CONFIG.maxChunkDurationSeconds;

  // Safe lower bounds to prevent division by zero or negative durations
  const safeDuration = Math.max(1, videoDurationSeconds);
  const safeQualityComplexity = Math.max(0.1, qualityComplexity);
  const safeSourceComplexity = Math.max(0.1, sourceComplexity);

  const workPerMinute = safeQualityComplexity * safeSourceComplexity;

  // Raw duration in minutes, converted to seconds
  const rawDurationMinutes = targetWorkBudget / workPerMinute;
  const rawDurationSeconds = Math.round(rawDurationMinutes * 60);

  // Clamp within safety boundaries
  const clampedDurationSeconds = clamp(
    rawDurationSeconds,
    minDuration,
    maxDuration,
  );

  // Total chunks needed to cover the full video duration
  const totalChunks = Math.ceil(safeDuration / clampedDurationSeconds);

  return {
    rawDurationSeconds,
    clampedDurationSeconds,
    totalChunks,
    videoDurationSeconds: safeDuration,
  };
}
