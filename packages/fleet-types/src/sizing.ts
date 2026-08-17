import type { VideoQuality } from "./video.ts";

/**
 * Result of computing quality complexity from requested renditions.
 */
export interface QualityComplexityResult {
  readonly requestedQualities: readonly VideoQuality[];
  readonly totalWeight: number;
}

/**
 * Result of computing source video complexity factors.
 */
export interface SourceComplexityResult {
  readonly resolutionFactor: number;
  readonly fpsFactor: number;
  readonly codecMultiplier: number;
  readonly totalSourceComplexity: number;
}

/**
 * Total estimated encoding workload per minute of source video.
 */
export interface WorkloadCalculationResult {
  readonly qualityComplexity: number;
  readonly sourceComplexity: number;
  readonly workPerMinute: number;
}

/**
 * Result of dynamic no-reencode chunk duration calculation (Formula A).
 */
export interface DynamicChunkSizingResult {
  readonly rawDurationSeconds: number;
  readonly clampedDurationSeconds: number;
  readonly totalChunks: number;
  readonly videoDurationSeconds: number;
}

/**
 * Current state of the global fleet capacity used during allocation calculations.
 */
export interface FleetCapacityState {
  readonly totalRunningWorkers: number;
  readonly idleWorkers: number;
  readonly nearCompleteWorkers: number;
  readonly maxTotalWorkers: number;
}

/**
 * Result of worker capacity allocation for a specific video job (Formula B).
 */
export interface CapacityAllocationResult {
  readonly videoId: string;
  readonly chunkCount: number;
  readonly maxWorkersForVideo: number;
  readonly requiredWorkers: number;
  readonly reusableWorkers: number;
  readonly idleWorkersAvailable: number;
  readonly nearCompleteWorkersAvailable: number;
  readonly workersToLaunch: number;
}
