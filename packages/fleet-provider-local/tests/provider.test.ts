import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createLocalProvider, parsePidFromWorkerId } from "../src/provider.ts";

describe("Local Fleet Provider", () => {
  it("should parse PID from worker provider ID", () => {
    assert.equal(parsePidFromWorkerId("local-proc-12345"), 12345);
    assert.equal(parsePidFromWorkerId("9999"), 9999);
    assert.equal(parsePidFromWorkerId("invalid"), null);
  });

  it("should execute commands locally", async () => {
    const provider = createLocalProvider();
    const result = await provider.execute?.("local-proc-1", [
      process.execPath,
      "-e",
      "console.log('hello local fleet')",
    ]);

    assert.ok(result);
    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout.trim(), "hello local fleet");
  });

  it("should spawn, inspect, and gracefully terminate a worker process", async () => {
    const provider = createLocalProvider({
      workerExecutable: process.execPath,
      gracePeriodMs: 1000,
    });

    const workerId = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
    // Spawn a persistent node timer
    const handle = await provider.createWorker(workerId, {
      cpu: 1,
      memoryMb: 512,
      architecture: "arm64",
      storageGb: 10,
      region: "local",
      environmentVariables: {
        NODE_OPTIONS: "--eval=setInterval(()=>{},1000)",
      },
    });

    assert.equal(handle.id, workerId);
    assert.equal(handle.provider, "local");
    assert.ok(handle.providerWorkerId.startsWith("local-proc-"));

    // Check health while running
    const health = await provider.healthCheck(handle.providerWorkerId);
    assert.equal(health.healthy, true);
    assert.equal(health.state, "PROCESSING");

    // Terminate worker
    await provider.terminateWorker(handle.providerWorkerId);

    // Verify worker is terminated
    const statusAfter = await provider.getWorkerStatus(handle.providerWorkerId);
    assert.ok(
      statusAfter === "COMPLETED" ||
        statusAfter === "FAILED" ||
        statusAfter === "TERMINATED",
    );

    const healthAfter = await provider.healthCheck(handle.providerWorkerId);
    assert.equal(healthAfter.healthy, false);
  });
});
