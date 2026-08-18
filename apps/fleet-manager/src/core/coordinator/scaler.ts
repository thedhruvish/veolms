import { randomUUID } from "node:crypto";
import {
  getReusableCapacity,
  listActiveVideoJobs,
  registerWorker,
  updateVideoJobActiveWorkers,
} from "@veolms/database";
import type {
  CapacityAllocationResult,
  FleetCapacityState,
  WorkerLaunchResult,
} from "@veolms/fleet-types";

import { calculateCapacityAllocation } from "../sizing/capacity.ts";
import type { CoordinationContext } from "./types.ts";

/**
 * Evaluates pending video processing demand and scales the fleet worker pool
 * up by provisioning only the missing required instances (Formula B).
 */
export class FleetScaler {
  private readonly context: CoordinationContext;

  constructor(context: CoordinationContext) {
    this.context = context;
  }

  /**
   * Evaluates active jobs against fleet capacity and provisions missing workers.
   */
  async scaleFleetCapacity(): Promise<{
    readonly allocations: readonly CapacityAllocationResult[];
    readonly launchedWorkers: readonly WorkerLaunchResult[];
  }> {
    const activeJobs = await listActiveVideoJobs(this.context.database);
    if (activeJobs.length === 0) {
      return { allocations: [], launchedWorkers: [] };
    }

    // 1. Get current reusable capacity snapshot
    const reusableState = await getReusableCapacity(
      this.context.database,
      this.context.config.reuseProgressThreshold,
    );

    const fleetState: FleetCapacityState = {
      totalRunningWorkers: reusableState.runningWorkers,
      idleWorkers: reusableState.idleWorkers,
      nearCompleteWorkers: reusableState.nearCompleteWorkers,
      maxTotalWorkers: this.context.config.maxTotalWorkers,
    };

    const allocations: CapacityAllocationResult[] = [];
    const launchedWorkers: WorkerLaunchResult[] = [];

    // Track simulated running total during the provisioning loop
    let currentRunningWorkers = fleetState.totalRunningWorkers;
    let availableIdle = fleetState.idleWorkers;
    let availableNearComplete = fleetState.nearCompleteWorkers;

    for (const job of activeJobs) {
      // Calculate missing capacity for this video job
      const currentFleetState: FleetCapacityState = {
        totalRunningWorkers: currentRunningWorkers,
        idleWorkers: availableIdle,
        nearCompleteWorkers: availableNearComplete,
        maxTotalWorkers: this.context.config.maxTotalWorkers,
      };

      const allocation = calculateCapacityAllocation({
        videoId: job.id,
        chunkCount: job.chunkCount,
        fleetState: currentFleetState,
        config: this.context.config,
      });

      allocations.push(allocation);

      // Deduct reused capacity for subsequent iterations
      const reusedForThisJob = Math.min(
        allocation.requiredWorkers,
        availableIdle + availableNearComplete,
      );
      if (availableIdle >= reusedForThisJob) {
        availableIdle -= reusedForThisJob;
      } else {
        const remaining = reusedForThisJob - availableIdle;
        availableIdle = 0;
        availableNearComplete = Math.max(0, availableNearComplete - remaining);
      }

      // Provision missing workers
      const is4K = job.sourceHeight >= 2160 || job.sourceWidth >= 3840;
      const complexityScore = Number(
        (job.qualityComplexity * job.sourceComplexity).toFixed(2),
      );
      const isGpuPreferred = is4K || complexityScore > 25;

      for (let i = 0; i < allocation.workersToLaunch; i++) {
        const workerId = randomUUID();

        const launchResult = await this.context.driver.launchWorker({
          workerId,
          provider: this.context.driver.providerType,
          managerApiUrl: this.context.managerApiUrl,
          queueConnectionString: this.context.queueConnectionString,
          environment: {
            COMPLEXITY_SCORE: String(complexityScore),
            IS_4K: is4K ? "true" : "false",
            GPU_PREFERRED: isGpuPreferred ? "true" : "false",
          },
        });

        const effectiveInstanceType =
          (launchResult.metadata?.instanceType as string) ||
          (launchResult.metadata?.instance_type as string) ||
          "standard";

        // Register initial worker record in persistence layer
        await registerWorker(this.context.database, {
          id: workerId,
          instanceId: launchResult.instanceId,
          provider: launchResult.provider,
          instanceType: effectiveInstanceType,
        });

        launchedWorkers.push(launchResult);
        currentRunningWorkers += 1;
      }

      // Update active workers on video_jobs table
      const totalAssignedWorkers = allocation.requiredWorkers;
      await updateVideoJobActiveWorkers(
        this.context.database,
        job.id,
        totalAssignedWorkers,
      );
    }

    return { allocations, launchedWorkers };
  }
}
