import type {
  ChunkEncodingJobPayload,
  CloudDriver,
  WorkerLaunchSpec,
  WorkerLaunchResult,
  WorkerStatusResult,
} from "@veolms/fleet-types";

import { SimulatedWorkerInstance } from "./instance.ts";
import type { SimulatorDriverOptions } from "./options.ts";

/**
 * SimulatorCloudDriver: In-memory virtual worker driver implementing the CloudDriver port.
 *
 * Allows full fleet orchestration, sizing (Formulas A & B), auto-scaling, reuse,
 * heartbeats, and termination to be verified in milliseconds without any real cloud/container overhead.
 */
export class SimulatorCloudDriver implements CloudDriver {
  readonly name = "simulator";
  readonly providerType = "simulator";

  private readonly workers = new Map<string, SimulatedWorkerInstance>();
  private readonly defaultOptions: SimulatorDriverOptions;

  constructor(options: SimulatorDriverOptions = {}) {
    this.defaultOptions = options;
  }

  /**
   * Launches a new virtual worker instance and begins its asynchronous boot sequence.
   */
  async launchWorker(spec: WorkerLaunchSpec): Promise<WorkerLaunchResult> {
    const instanceId = `sim-inst-${Math.random().toString(36).substring(2, 9)}`;

    const worker = new SimulatedWorkerInstance(
      spec.workerId,
      instanceId,
      this.defaultOptions,
    );

    this.workers.set(spec.workerId, worker);

    // Boot asynchronously in the background
    void worker.boot();

    return {
      workerId: spec.workerId,
      instanceId,
      provider: this.providerType,
      state: "PROVISIONING",
      launchedAt: worker.launchedAt,
      metadata: {
        instanceType: worker.instanceType,
        managerApiUrl: spec.managerApiUrl,
      },
    };
  }

  /**
   * Decommissions and terminates a virtual worker instance.
   */
  async terminateWorker(workerId: string): Promise<void> {
    const worker = this.workers.get(workerId);
    if (!worker) {
      return;
    }

    await worker.terminate();
    this.workers.delete(workerId);
  }

  /**
   * Queries the live status of a virtual worker instance.
   */
  async getWorkerStatus(workerId: string): Promise<WorkerStatusResult> {
    const worker = this.workers.get(workerId);
    if (!worker) {
      return {
        workerId,
        instanceId: `unknown-${workerId}`,
        provider: this.providerType,
        state: "TERMINATED",
        isHealthy: false,
        uptimeSeconds: 0,
      };
    }

    return worker.getStatus();
  }

  /**
   * Lists all active virtual workers currently managed by this simulator.
   */
  async listWorkers(): Promise<readonly WorkerStatusResult[]> {
    const results: WorkerStatusResult[] = [];
    for (const worker of this.workers.values()) {
      results.push(worker.getStatus());
    }
    return results;
  }

  /**
   * Retrieves the raw SimulatedWorkerInstance for direct testing control.
   */
  getWorkerInstance(workerId: string): SimulatedWorkerInstance | undefined {
    return this.workers.get(workerId);
  }

  /**
   * Simulates assigning and processing a chunk on a specific worker instance.
   */
  async processChunkOnWorker(
    workerId: string,
    chunkJob: ChunkEncodingJobPayload,
  ): Promise<{
    readonly status: "SUCCESS" | "FAILED";
    readonly durationMs: number;
    readonly error?: string;
  }> {
    const worker = this.workers.get(workerId);
    if (!worker) {
      throw new Error(`Worker with id "${workerId}" not found in simulator`);
    }

    return worker.processChunk(chunkJob);
  }

  /**
   * Terminates and clears all active simulated workers.
   */
  async clearAll(): Promise<void> {
    const terminatePromises = Array.from(this.workers.values()).map((w) =>
      w.terminate(),
    );
    await Promise.all(terminatePromises);
    this.workers.clear();
  }
}
