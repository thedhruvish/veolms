import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Kysely } from "kysely";
import type { Database } from "@veolms/database";
import type {
  FleetProvider,
  Job,
  WorkerHandle,
  WorkerSpec,
  WorkerStatus,
} from "@veolms/fleet-types";
import { createScheduler } from "../src/core/scheduler.ts";
import { createWorkerManager } from "../src/core/worker-manager.ts";
import { loadFleetManagerConfig } from "@veolms/config";

describe("Worker Manager Spec Calculations", () => {
  const config = loadFleetManagerConfig();
  const scheduler = createScheduler(config);

  const mockProvider: FleetProvider = {
    name: "local",
    async createWorker(id: string, _spec: WorkerSpec): Promise<WorkerHandle> {
      return {
        id,
        providerWorkerId: `mock-${id}`,
        provider: "local",
        status: "STARTING",
        privateIp: "127.0.0.1",
        publicIp: null,
        createdAt: new Date(),
      };
    },
    async getWorker(): Promise<WorkerHandle | null> {
      return null;
    },
    async getWorkerStatus(): Promise<WorkerStatus> {
      return "PROCESSING";
    },
    async terminateWorker(): Promise<void> {},
    async healthCheck() {
      return { healthy: true, state: "PROCESSING" as WorkerStatus };
    },
  };

  // Mock DB for spec unit tests
  const mockDb = {} as unknown as Kysely<Database>;

  const workerManager = createWorkerManager({
    provider: mockProvider,
    db: mockDb,
    scheduler,
    config,
  });

  it("should scale hardware spec up for 4K video requests", () => {
    const job4k: Job = {
      id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      status: "QUEUED",
      videoKey: "raw/4k-intro.mp4",
      outputPrefix: "transcoded/4k-intro",
      videoSize: 0,
      qualities: ["2160p", "1080p", "720p"],
      workerId: null,
      attempts: 0,
      maxAttempts: 3,
      errorMessage: null,
      createdAt: new Date(),
      startedAt: null,
      completedAt: null,
      failedAt: null,
      updatedAt: new Date(),
    };

    const spec = workerManager.calculateWorkerSpec(job4k);
    assert.equal(spec.cpu, 8);
    assert.equal(spec.memoryMb, 16384);
    assert.equal(spec.storageGb, 80);
    assert.equal(spec.architecture, "arm64");
  });

  it("should use standard hardware spec for standard 1080p / 720p requests", () => {
    const jobStandard: Job = {
      id: "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22",
      status: "QUEUED",
      videoKey: "raw/lesson1.mp4",
      outputPrefix: "transcoded/lesson1",
      videoSize: 0,
      qualities: ["1080p", "720p", "480p"],
      workerId: null,
      attempts: 0,
      maxAttempts: 3,
      errorMessage: null,
      createdAt: new Date(),
      startedAt: null,
      completedAt: null,
      failedAt: null,
      updatedAt: new Date(),
    };

    const spec = workerManager.calculateWorkerSpec(jobStandard);
    assert.equal(spec.cpu, 2);
    assert.equal(spec.memoryMb, 4096);
    assert.equal(spec.storageGb, 30);
  });
});
