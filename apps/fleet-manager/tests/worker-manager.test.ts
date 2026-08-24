import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Kysely, Selectable } from "kysely";
import type { Database, VideoJobTable } from "@veolms/database";
import type {
  FleetProvider,
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
    const job4k: Selectable<VideoJobTable> = {
      id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      video_id: "media-4k-1",
      status: "QUEUED",
      video_key: "raw/4k-intro.mp4",
      output_prefix: "transcoded/4k-intro",
      video_size: 0,
      qualities: ["2160p", "1080p", "720p"],
      worker_id: null,
      progress_percent: 0,
      attempts: 0,
      max_attempts: 3,
      error_message: null,
      created_at: new Date(),
      started_at: null,
      completed_at: null,
      failed_at: null,
      updated_at: new Date(),
    };

    const spec = workerManager.calculateWorkerSpec(job4k);
    assert.equal(spec.cpu, 8);
    assert.equal(spec.memoryMb, 16384);
    assert.equal(spec.storageGb, 80);
    assert.equal(spec.architecture, "ARM64");
  });

  it("should use standard hardware spec for standard 1080p / 720p requests", () => {
    const jobStandard: Selectable<VideoJobTable> = {
      id: "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22",
      video_id: "media-std-1",
      status: "QUEUED",
      video_key: "raw/lesson1.mp4",
      output_prefix: "transcoded/lesson1",
      video_size: 0,
      qualities: ["1080p", "720p", "480p"],
      worker_id: null,
      progress_percent: 0,
      attempts: 0,
      max_attempts: 3,
      error_message: null,
      created_at: new Date(),
      started_at: null,
      completed_at: null,
      failed_at: null,
      updated_at: new Date(),
    };

    const spec = workerManager.calculateWorkerSpec(jobStandard);
    assert.equal(spec.cpu, 2);
    assert.equal(spec.memoryMb, 4096);
    assert.equal(spec.storageGb, 30);
  });
});
