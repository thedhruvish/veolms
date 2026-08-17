import {
  DEFAULT_FLEET_CONFIG,
  type CapacityAllocationResult,
  type FleetCapacityState,
  type FleetManagerConfig,
} from "@veolms/fleet-types";

export interface CalculateCapacityAllocationParams {
  readonly videoId: string;
  readonly chunkCount: number;
  readonly fleetState: FleetCapacityState;
  readonly config?: Partial<FleetManagerConfig>;
}

/**
 * Implements Formula B: Worker Capacity Allocation & Missing Capacity Calculation.
 *
 * Sizing principles:
 * 1. A video cannot use more workers than its chunk count (e.g. 3 chunks = max 3 workers).
 * 2. MAX_WORKERS_PER_VIDEO (default: 4) provides a per-video ceiling.
 * 3. Existing idle workers + near-complete workers (progress >= 85%) are counted as reusable capacity.
 * 4. Only launch the delta missing workers: max(0, required - reusable).
 * 5. Constrain total launches by global MAX_TOTAL_WORKERS (default: 20).
 */
export function calculateCapacityAllocation(
  params: CalculateCapacityAllocationParams,
): CapacityAllocationResult {
  const { videoId, chunkCount, fleetState, config = {} } = params;

  const maxWorkersForVideo =
    config.maxWorkersPerVideo ?? DEFAULT_FLEET_CONFIG.maxWorkersPerVideo;
  const maxTotalWorkers =
    config.maxTotalWorkers ?? DEFAULT_FLEET_CONFIG.maxTotalWorkers;

  const safeChunkCount = Math.max(1, chunkCount);

  // Workers required for this video cannot exceed chunk count or per-video ceiling
  const requiredWorkers = Math.min(safeChunkCount, maxWorkersForVideo);

  // Available reusable workers in the fleet
  const idleWorkers = Math.max(0, fleetState.idleWorkers);
  const nearCompleteWorkers = Math.max(0, fleetState.nearCompleteWorkers);
  const reusableWorkers = idleWorkers + nearCompleteWorkers;

  // Raw workers needed after accounting for reusable fleet instances
  const videoWorkersToLaunch = Math.max(0, requiredWorkers - reusableWorkers);

  // Global remaining capacity before hitting the hard pool ceiling
  const globalAvailableCapacity = Math.max(
    0,
    maxTotalWorkers - Math.max(0, fleetState.totalRunningWorkers),
  );

  // Final count of new worker machines to provision
  const workersToLaunch = Math.min(
    videoWorkersToLaunch,
    globalAvailableCapacity,
  );

  return {
    videoId,
    chunkCount: safeChunkCount,
    maxWorkersForVideo,
    requiredWorkers,
    reusableWorkers,
    idleWorkersAvailable: idleWorkers,
    nearCompleteWorkersAvailable: nearCompleteWorkers,
    workersToLaunch,
  };
}
