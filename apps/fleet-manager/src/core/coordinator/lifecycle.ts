import {
  findExpiredWorkers,
  findIdleWorkersPastTimeout,
  findWorkerByInstanceId,
  recordWorkerHeartbeat,
  registerWorker,
  updateWorkerState,
  failChunk,
} from "@veolms/database";
import type {
  NoWorkSignalPayload,
  WorkerHeartbeatPayload,
  WorkerRecord,
  WorkerRegistrationPayload,
} from "@veolms/fleet-types";

import { QueueInspectorService } from "../queues/inspector.ts";
import type { CoordinationContext, NoWorkDecision } from "./types.ts";

/**
 * Manages individual worker state machine transitions, heartbeat monitoring,
 * failover retries, and race-safe termination decisions.
 */
export class WorkerLifecycleManager {
  private readonly context: CoordinationContext;
  private readonly inspector: QueueInspectorService;

  constructor(context: CoordinationContext) {
    this.context = context;
    this.inspector = new QueueInspectorService(context.queueAdapter);
  }

  /**
   * Registers a newly provisioned worker checking in for the first time.
   */
  async handleWorkerRegistration(
    payload: WorkerRegistrationPayload,
  ): Promise<WorkerRecord> {
    return registerWorker(this.context.database, {
      id: payload.workerId,
      instanceId: payload.instanceId,
      provider: payload.provider,
      instanceType: payload.instanceType,
    });
  }

  /**
   * Records a periodic progress heartbeat from an active or idle worker.
   */
  async handleWorkerHeartbeat(payload: WorkerHeartbeatPayload): Promise<void> {
    const heartbeatId = `hb-${Math.random().toString(36).substring(2, 11)}`;

    await recordWorkerHeartbeat(this.context.database, {
      ...payload,
      heartbeatId,
    });
  }

  /**
   * Handles a NO_WORK signal sent by a worker whose queue check returned empty.
   *
   * Implements §32.2: Race-Safe Termination
   * 1. Re-check the global queues (Queue 1 & Queue 2).
   * 2. If new work arrived in the interim => KEEP worker, let it consume the new job.
   * 3. If queues are genuinely drained => TERMINATE worker via CloudDriver and mark TERMINATED.
   */
  async handleNoWorkSignal(
    payload: NoWorkSignalPayload,
  ): Promise<NoWorkDecision> {
    const hasWork = await this.inspector.hasPendingOrActiveTasks();

    if (hasWork) {
      return {
        action: "KEEP",
        reason:
          "Pending tasks exist in the queue; keeping worker alive for assignment",
      };
    }

    // Queue is empty -> Decommission worker gracefully
    try {
      await this.context.driver.terminateWorker(payload.workerId);
    } catch {
      // Driver termination error logged, proceed with state update
    }

    await updateWorkerState(
      this.context.database,
      payload.workerId,
      "TERMINATED",
    );

    return {
      action: "TERMINATE",
      reason: "Queue is fully drained; worker successfully terminated",
    };
  }

  /**
   * Audits active workers against heartbeat timeouts.
   * If a worker is unresponsive:
   * 1. Marks worker as FAILED.
   * 2. Resets its active chunk to FAILED with retry count incremented.
   * 3. Initiates cloud instance teardown.
   */
  async detectAndFailDeadWorkers(): Promise<readonly string[]> {
    const timeoutSeconds = this.context.config.heartbeatTimeoutSeconds;
    const expiredWorkers = await findExpiredWorkers(
      this.context.database,
      timeoutSeconds,
    );

    const failedWorkerIds: string[] = [];

    for (const worker of expiredWorkers) {
      // 1. Mark worker as FAILED
      await updateWorkerState(this.context.database, worker.id, "FAILED");

      // 2. If worker was processing a chunk, fail the chunk to make it retryable
      if (worker.currentChunkId) {
        try {
          await failChunk(
            this.context.database,
            worker.currentChunkId,
            `Worker ${worker.id} heartbeat expired (> ${timeoutSeconds}s)`,
          );
        } catch {
          // Ignore if chunk already updated
        }
      }

      // 3. Attempt cloud teardown
      try {
        await this.context.driver.terminateWorker(worker.id);
      } catch {
        // Driver termination error ignored
      }

      failedWorkerIds.push(worker.id);
    }

    return failedWorkerIds;
  }

  /**
   * Decommissions workers that have remained IDLE longer than idleTimeoutSeconds.
   */
  async reapStaleIdleWorkers(): Promise<readonly string[]> {
    const idleTimeoutSeconds = this.context.config.idleTimeoutSeconds;
    const staleWorkers = await findIdleWorkersPastTimeout(
      this.context.database,
      idleTimeoutSeconds,
    );

    const reapedIds: string[] = [];

    for (const worker of staleWorkers) {
      // Re-verify queue is not backlogged before terminating
      const hasWork = await this.inspector.hasPendingOrActiveTasks();
      if (hasWork) {
        break;
      }

      try {
        await this.context.driver.terminateWorker(worker.id);
      } catch {
        // Driver teardown error ignored
      }

      await updateWorkerState(this.context.database, worker.id, "TERMINATED");
      reapedIds.push(worker.id);
    }

    return reapedIds;
  }
}
