import type {
  CapacityAllocationResult,
  DynamicChunkSizingResult,
  FleetCapacityState,
  FleetManagerConfig,
  QualityComplexityResult,
  SourceComplexityResult,
  SourceMetadata,
  VideoQuality,
  WorkloadCalculationResult,
} from "@veolms/fleet-types";

import { calculateCapacityAllocation } from "./capacity.ts";
import { calculateDynamicChunkDuration } from "./chunk.ts";
import { calculateQualityComplexity } from "./quality.ts";
import { calculateSourceComplexity } from "./source.ts";

export * from "./quality.ts";
export * from "./source.ts";
export * from "./chunk.ts";
export * from "./capacity.ts";

export interface FullWorkloadPlan {
  readonly qualityComplexity: QualityComplexityResult;
  readonly sourceComplexity: SourceComplexityResult;
  readonly workload: WorkloadCalculationResult;
  readonly chunkSizing: DynamicChunkSizingResult;
  readonly capacityAllocation: CapacityAllocationResult;
}

export interface CalculateFullWorkloadPlanParams {
  readonly videoId: string;
  readonly sourceMetadata: SourceMetadata;
  readonly requestedQualities: readonly VideoQuality[];
  readonly fleetState: FleetCapacityState;
  readonly config?: Partial<FleetManagerConfig>;
}

/**
 * End-to-end workload sizing orchestrator combining Quality Complexity, Source Complexity,
 * Dynamic Chunk Sizing (Formula A), and Capacity Allocation (Formula B).
 */
export function calculateFullWorkloadPlan(
  params: CalculateFullWorkloadPlanParams,
): FullWorkloadPlan {
  const { videoId, sourceMetadata, requestedQualities, fleetState, config } =
    params;

  // 1. Calculate Quality Complexity
  const qualityComplexity = calculateQualityComplexity(
    requestedQualities,
    config?.qualityWeights,
  );

  // 2. Calculate Source Complexity
  const sourceComplexity = calculateSourceComplexity(sourceMetadata, config);

  // 3. Calculate Workload Rate
  const workPerMinute =
    qualityComplexity.totalWeight * sourceComplexity.totalSourceComplexity;
  const workload: WorkloadCalculationResult = {
    qualityComplexity: qualityComplexity.totalWeight,
    sourceComplexity: sourceComplexity.totalSourceComplexity,
    workPerMinute: Number(workPerMinute.toFixed(4)),
  };

  // 4. Calculate Dynamic Chunk Sizing (Formula A)
  const chunkSizing = calculateDynamicChunkDuration(
    sourceMetadata.durationSeconds,
    qualityComplexity.totalWeight,
    sourceComplexity.totalSourceComplexity,
    config,
  );

  // 5. Calculate Worker Capacity Allocation (Formula B)
  const capacityAllocation = calculateCapacityAllocation({
    videoId,
    chunkCount: chunkSizing.totalChunks,
    fleetState,
    config,
  });

  return {
    qualityComplexity,
    sourceComplexity,
    workload,
    chunkSizing,
    capacityAllocation,
  };
}
