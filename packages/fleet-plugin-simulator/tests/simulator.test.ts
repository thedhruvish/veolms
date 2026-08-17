import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  NoWorkSignalPayload,
  WorkerHeartbeatPayload,
  WorkerRegistrationPayload,
} from "@veolms/fleet-types";

import { SimulatorCloudDriver } from "../src/index.ts";

describe("Fleet Worker Simulator Plugin", () => {
  it("should launch worker, boot, and register successfully", async () => {
    let registeredPayload: WorkerRegistrationPayload | null = null;

    const driver = new SimulatorCloudDriver({
      bootDelayMs: 20,
      onWorkerRegister: (payload) => {
        registeredPayload = payload;
      },
    });

    const launchResult = await driver.launchWorker({
      workerId: "worker-sim-1",
      provider: "simulator",
      managerApiUrl: "http://localhost:4000",
      queueConnectionString: "postgres://localhost/test",
    });

    assert.equal(launchResult.workerId, "worker-sim-1");
    assert.equal(launchResult.provider, "simulator");
    assert.ok(launchResult.instanceId.startsWith("sim-inst-"));

    // Wait for boot to finish
    await new Promise((r) => setTimeout(r, 40));

    assert.ok(registeredPayload !== null);
    assert.equal(
      (registeredPayload as WorkerRegistrationPayload).workerId,
      "worker-sim-1",
    );

    const status = await driver.getWorkerStatus("worker-sim-1");
    assert.equal(status.state, "IDLE");
    assert.equal(status.isHealthy, true);

    await driver.terminateWorker("worker-sim-1");
  });

  it("should simulate chunk processing and emit heartbeats reaching 85%+ near-complete", async () => {
    const heartbeats: WorkerHeartbeatPayload[] = [];

    const driver = new SimulatorCloudDriver({
      bootDelayMs: 10,
      tickIntervalMs: 15,
      simulatedChunkDurationMs: 80,
      speedMultiplier: 1.0,
      onWorkerHeartbeat: (hb) => {
        heartbeats.push(hb);
      },
    });

    await driver.launchWorker({
      workerId: "worker-sim-2",
      provider: "simulator",
      managerApiUrl: "http://localhost:4000",
      queueConnectionString: "postgres://localhost/test",
    });

    // Wait for boot
    await new Promise((r) => setTimeout(r, 25));

    // Process chunk
    const result = await driver.processChunkOnWorker("worker-sim-2", {
      jobId: "job-100",
      videoId: "video-100",
      chunkId: "chunk-001",
      chunkIndex: 0,
      chunkKey: "videos/video-100/chunks/chunk-001.mp4",
      startSeconds: 0,
      durationSeconds: 300,
      requestedQualities: ["240p", "720p", "1080p"],
    });

    assert.equal(result.status, "SUCCESS");
    assert.ok(heartbeats.length >= 3);

    // Verify progress reached near-complete threshold (>= 85%) during processing
    const hasNearComplete = heartbeats.some(
      (hb) => hb.state === "PROCESSING" && hb.progressPercent >= 85,
    );
    assert.ok(
      hasNearComplete,
      "Expected heartbeat with progress >= 85% during processing",
    );

    // Final state should be IDLE
    const finalStatus = await driver.getWorkerStatus("worker-sim-2");
    assert.equal(finalStatus.state, "IDLE");

    await driver.terminateWorker("worker-sim-2");
  });

  it("should handle NO_WORK signal", async () => {
    let noWorkSignal: NoWorkSignalPayload | null = null;

    const driver = new SimulatorCloudDriver({
      bootDelayMs: 10,
      onWorkerNoWork: (signal) => {
        noWorkSignal = signal;
      },
    });

    await driver.launchWorker({
      workerId: "worker-sim-3",
      provider: "simulator",
      managerApiUrl: "http://localhost:4000",
      queueConnectionString: "postgres://localhost/test",
    });

    await new Promise((r) => setTimeout(r, 20));

    const worker = driver.getWorkerInstance("worker-sim-3");
    assert.ok(worker !== undefined);
    worker.signalNoWork("chunk-001");

    assert.ok(noWorkSignal !== null);
    assert.equal(
      (noWorkSignal as NoWorkSignalPayload).workerId,
      "worker-sim-3",
    );
    assert.equal(
      (noWorkSignal as NoWorkSignalPayload).lastCompletedChunkId,
      "chunk-001",
    );

    await driver.terminateWorker("worker-sim-3");
  });

  it("should terminate and clear all simulated workers", async () => {
    const driver = new SimulatorCloudDriver({ bootDelayMs: 10 });

    await driver.launchWorker({
      workerId: "worker-sim-4",
      provider: "simulator",
      managerApiUrl: "http://localhost:4000",
      queueConnectionString: "postgres://localhost/test",
    });
    await driver.launchWorker({
      workerId: "worker-sim-5",
      provider: "simulator",
      managerApiUrl: "http://localhost:4000",
      queueConnectionString: "postgres://localhost/test",
    });

    const listBefore = await driver.listWorkers();
    assert.equal(listBefore.length, 2);

    await driver.clearAll();

    const listAfter = await driver.listWorkers();
    assert.equal(listAfter.length, 0);
  });
});
