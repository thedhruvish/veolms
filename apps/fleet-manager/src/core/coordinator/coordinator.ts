import {
  getReusableCapacity,
  listActiveVideoJobs,
  listActiveWorkers,
} from "@veolms/database";

import { QueueInspectorService } from "../queues/inspector.ts";
import { ManifestFinalizerCoordinator } from "./finalizer.ts";
import { WorkerLifecycleManager } from "./lifecycle.ts";
import { FleetScaler } from "./scaler.ts";
import type {
  CoordinationContext,
  CoordinationCycleResult,
  FleetStatusSummary,
} from "./types.ts";

/**
 * FleetCoordinator: Central control plane orchestrator managing auto-scaling,
 * worker lifecycles, failovers, and completion finalization.
 */
export class FleetCoordinator {
  readonly context: CoordinationContext;
  readonly lifecycle: WorkerLifecycleManager;
  readonly scaler: FleetScaler;
  readonly finalizer: ManifestFinalizerCoordinator;
  readonly inspector: QueueInspectorService;

  constructor(context: CoordinationContext) {
    this.context = context;
    this.lifecycle = new WorkerLifecycleManager(context);
    this.scaler = new FleetScaler(context);
    this.finalizer = new ManifestFinalizerCoordinator(context);
    this.inspector = new QueueInspectorService(context.queueAdapter);
  }

  /**
   * Executes a complete fleet coordination cycle:
   * 1. Detect and fail dead workers with expired heartbeats.
   * 2. Finalize completed videos whose chunks are all done.
   * 3. Evaluate demand and scale worker fleet capacity (Formula B).
   * 4. Decommission excess idle workers past the idle timeout.
   */
  async runCoordinationCycle(): Promise<CoordinationCycleResult> {
    const cycleTimestamp = new Date();

    // 1. Audit heartbeats and fail dead workers
    const deadWorkersFailed = await this.lifecycle.detectAndFailDeadWorkers();

    // 2. Check and finalize any completed videos
    const finalizedVideoIds = await this.finalizer.finalizeCompletedVideos();

    // 3. Scale up capacity for pending video demand
    const { allocations, launchedWorkers } =
      await this.scaler.scaleFleetCapacity();

    // 4. Reap stale idle workers
    const decommissionedIds = await this.lifecycle.reapStaleIdleWorkers();

    // 5. Query latest fleet status
    const fleetStatus = await this.getFleetStatus();

    return {
      cycleTimestamp,
      activeJobsProcessed: allocations.length,
      workersLaunched: launchedWorkers.length,
      workersDecommissioned: decommissionedIds.length,
      deadWorkersFailed: deadWorkersFailed.length,
      videosFinalized: finalizedVideoIds.length,
      fleetStatus,
    };
  }

  /**
   * Retrieves an overview snapshot of current fleet capacity and queue state.
   */
  async getFleetStatus(): Promise<FleetStatusSummary> {
    const [reusableState, activeJobs, activeWorkers, pendingChunks, isDrained] =
      await Promise.all([
        getReusableCapacity(
          this.context.database,
          this.context.config.reuseProgressThreshold,
        ),
        listActiveVideoJobs(this.context.database),
        listActiveWorkers(this.context.database),
        this.inspector.getPendingCount(),
        this.inspector.isDrained(),
      ]);

    return {
      provider: this.context.driver.providerType,
      region: process.env.AWS_REGION || undefined,
      workerInstanceProfile: process.env.AWS_IAM_ROLE_ARN || undefined,
      securityGroupId: process.env.AWS_SECURITY_GROUP_ID || undefined,
      tempBucket: process.env.S3_TEMP_BUCKET || undefined,
      prodBucket: process.env.S3_PROD_BUCKET || undefined,
      totalWorkers: activeWorkers.length,
      runningWorkers: reusableState.runningWorkers,
      idleWorkers: reusableState.idleWorkers,
      nearCompleteWorkers: reusableState.nearCompleteWorkers,
      activeJobsCount: activeJobs.length,
      pendingChunksCount: pendingChunks,
      isDrained,
    };
  }
}
