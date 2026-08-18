import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { DEFAULT_FLEET_CONFIG } from "@veolms/fleet-types";
import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from "kysely";
import type { Database } from "@veolms/database";

import { FleetCoordinator } from "../src/core/coordinator/index.ts";
import { InMemoryQueueAdapter } from "../src/core/queues/index.ts";
import { createWorkerApiServer } from "../src/serverful/server.ts";
import { loadDaemonConfig } from "../src/serverful/config.ts";
import { SimulatorCloudDriver } from "@veolms/fleet-plugin-simulator";
import type { Server } from "node:http";

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

describe("Serverful Control Plane Daemon & Worker API", () => {
  let server: Server;
  let baseUrl: string;
  let driver: SimulatorCloudDriver;
  let queueAdapter: InMemoryQueueAdapter;
  let coordinator: FleetCoordinator;

  before(async () => {
    const mockDb = createMockDatabase();
    driver = new SimulatorCloudDriver({ bootDelayMs: 10 });
    queueAdapter = new InMemoryQueueAdapter();
    await queueAdapter.start();

    coordinator = new FleetCoordinator({
      database: mockDb,
      driver,
      queueAdapter,
      config: DEFAULT_FLEET_CONFIG,
      managerApiUrl: "http://localhost:0",
      queueConnectionString: "postgres://localhost/test",
    });

    server = createWorkerApiServer(coordinator);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it("should load valid daemon configuration with sensible defaults", () => {
    const config = loadDaemonConfig({
      PORT: "4500",
      FLEET_DRIVER: "simulator",
      COORDINATION_INTERVAL_MS: "3000",
    });

    assert.equal(config.port, 4500);
    assert.equal(config.driverType, "simulator");
    assert.equal(config.coordinationIntervalMs, 3000);
  });

  it("should respond to GET /health", async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);

    const body = (await res.json()) as { status: string };
    assert.equal(body.status, "ok");
  });

  it("should respond to GET /api/v1/fleet/status", async () => {
    const res = await fetch(`${baseUrl}/api/v1/fleet/status`);
    assert.equal(res.status, 200);

    const body = (await res.json()) as {
      isDrained: boolean;
      activeJobsCount: number;
    };
    assert.equal(body.isDrained, true);
    assert.equal(body.activeJobsCount, 0);
  });

  it("should handle worker heartbeat via POST /api/v1/workers/:id/heartbeat", async () => {
    const res = await fetch(
      `${baseUrl}/api/v1/workers/worker-api-1/heartbeat`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instanceId: "inst-1",
          state: "IDLE",
          progressPercent: 0,
          timestamp: new Date().toISOString(),
        }),
      },
    );

    assert.equal(res.status, 200);
    const body = (await res.json()) as { success: boolean };
    assert.equal(body.success, true);
  });

  it("should handle worker NO_WORK signal via POST /api/v1/workers/:id/no-work", async () => {
    // Launch a simulated worker first
    await driver.launchWorker({
      workerId: "worker-api-2",
      provider: "simulator",
      managerApiUrl: baseUrl,
      queueConnectionString: "postgres://localhost/test",
    });

    const res = await fetch(`${baseUrl}/api/v1/workers/worker-api-2/no-work`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instanceId: "inst-2",
        timestamp: new Date().toISOString(),
      }),
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as { action: string };
    assert.equal(body.action, "TERMINATE");
  });

  it("should trigger manual coordination cycle via POST /api/v1/fleet/cycle", async () => {
    const res = await fetch(`${baseUrl}/api/v1/fleet/cycle`, {
      method: "POST",
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      workersLaunched: number;
      fleetStatus: object;
    };
    assert.equal(body.workersLaunched, 0);
    assert.ok(body.fleetStatus !== undefined);
  });

  it("should handle Spot interruption warning via POST /api/v1/workers/:id/interruption", async () => {
    const res = await fetch(
      `${baseUrl}/api/v1/workers/worker-spot-1/interruption`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chunkId: "chunk-spot-test",
          timestamp: new Date().toISOString(),
        }),
      },
    );

    assert.equal(res.status, 200);
    const body = (await res.json()) as { success: boolean; action: string };
    assert.equal(body.success, true);
    assert.equal(body.action, "DRAINING");
  });

  it("should handle chunk completion via POST /api/v1/workers/:id/complete-chunk", async () => {
    const res = await fetch(
      `${baseUrl}/api/v1/workers/worker-api-1/complete-chunk`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chunkId: "chunk-test-1",
          outputKey: "videos/vid-1/chunks/chunk-test-1/master.m3u8",
        }),
      },
    );

    assert.equal(res.status, 200);
    const body = (await res.json()) as { success: boolean };
    assert.equal(body.success, true);
  });

  it("should handle chunk failure and retry recording via POST /api/v1/workers/:id/fail-chunk", async () => {
    const res = await fetch(
      `${baseUrl}/api/v1/workers/worker-api-1/fail-chunk`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chunkId: "chunk-test-fail-1",
          error: "Encoder segfault",
        }),
      },
    );

    assert.equal(res.status, 200);
    const body = (await res.json()) as { success: boolean };
    assert.equal(body.success, true);
  });

  it("should handle video finalization via POST /api/v1/workers/:id/finalize-video", async () => {
    const res = await fetch(
      `${baseUrl}/api/v1/workers/worker-api-1/finalize-video`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoId: "vid-test-1",
          masterManifestKey: "videos/vid-test-1/master.m3u8",
        }),
      },
    );

    assert.equal(res.status, 200);
    const body = (await res.json()) as { success: boolean };
    assert.equal(body.success, true);
  });
});
