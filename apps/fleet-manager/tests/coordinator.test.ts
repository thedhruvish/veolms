import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  DEFAULT_FLEET_CONFIG,
  type WorkerHeartbeatPayload,
  type WorkerRegistrationPayload,
} from "@veolms/fleet-types";
import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from "kysely";
import type { Database } from "@veolms/database";
import { SimulatorCloudDriver } from "@veolms/fleet-plugin-simulator";

import {
  FleetCoordinator,
  type CoordinationContext,
} from "../src/core/coordinator/index.ts";
import { InMemoryQueueAdapter } from "../src/core/queues/index.ts";

function createMockDatabase(): Kysely<Database> {
  return new Kysely<Database>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => new DummyDriver(),
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
  });
}

describe("Fleet Coordinator & Worker Lifecycle Manager", () => {
  let mockDb: Kysely<Database>;
  let driver: SimulatorCloudDriver;
  let queueAdapter: InMemoryQueueAdapter;
  let context: CoordinationContext;
  let coordinator: FleetCoordinator;

  beforeEach(async () => {
    mockDb = createMockDatabase();
    driver = new SimulatorCloudDriver({ bootDelayMs: 10 });
    queueAdapter = new InMemoryQueueAdapter();
    await queueAdapter.start();

    context = {
      database: mockDb,
      driver,
      queueAdapter,
      config: DEFAULT_FLEET_CONFIG,
      managerApiUrl: "http://localhost:4000",
      queueConnectionString: "postgres://localhost/test",
    };

    coordinator = new FleetCoordinator(context);
  });

  it("should initialize with correct coordinator submodules", () => {
    assert.ok(coordinator.lifecycle !== undefined);
    assert.ok(coordinator.scaler !== undefined);
    assert.ok(coordinator.finalizer !== undefined);
    assert.ok(coordinator.inspector !== undefined);
  });

  it("should handle race-safe NO_WORK signal by terminating worker when queue is empty", async () => {
    // 1. Launch a simulated worker
    await driver.launchWorker({
      workerId: "worker-nw-1",
      provider: "simulator",
      managerApiUrl: context.managerApiUrl,
      queueConnectionString: context.queueConnectionString,
    });

    // 2. Since queue is empty, handleNoWorkSignal should return TERMINATE
    const decision = await coordinator.lifecycle.handleNoWorkSignal({
      workerId: "worker-nw-1",
      instanceId: "sim-inst-1",
      timestamp: new Date().toISOString(),
    });

    assert.equal(decision.action, "TERMINATE");

    // Worker status should now be TERMINATED
    const status = await driver.getWorkerStatus("worker-nw-1");
    assert.equal(status.state, "TERMINATED");
  });

  it("should handle race-safe NO_WORK signal by keeping worker when pending tasks exist", async () => {
    // 1. Launch simulated worker
    await driver.launchWorker({
      workerId: "worker-nw-2",
      provider: "simulator",
      managerApiUrl: context.managerApiUrl,
      queueConnectionString: context.queueConnectionString,
    });

    // 2. Publish a job so queue is NOT empty
    await queueAdapter.publish("video-chunk-encoding", {
      jobId: "job-pending",
      videoId: "vid-1",
    });

    // 3. Worker sends NO_WORK, but queue has work
    const decision = await coordinator.lifecycle.handleNoWorkSignal({
      workerId: "worker-nw-2",
      instanceId: "sim-inst-2",
      timestamp: new Date().toISOString(),
    });

    assert.equal(decision.action, "KEEP");
    assert.ok(decision.reason.includes("Pending tasks exist"));

    // Worker should still be alive
    const status = await driver.getWorkerStatus("worker-nw-2");
    assert.notEqual(status.state, "TERMINATED");
  });

  it("should execute coordination cycle without errors on empty fleet", async () => {
    const result = await coordinator.runCoordinationCycle();

    assert.ok(result.cycleTimestamp instanceof Date);
    assert.equal(result.workersLaunched, 0);
    assert.equal(result.workersDecommissioned, 0);
    assert.equal(result.deadWorkersFailed, 0);
    assert.equal(result.videosFinalized, 0);
    assert.equal(result.fleetStatus.isDrained, true);
  });
});
