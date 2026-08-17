import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolve } from "node:path";
import { writeFileSync, unlinkSync } from "node:fs";

import { LocalCloudDriver, ContainerWorkerRunner } from "../src/index.ts";

describe("Local Container & Process Driver (Local & Podman)", () => {
  it("should configure correct providerType for process and podman modes", () => {
    const processDriver = new LocalCloudDriver({ runnerMode: "process" });
    assert.equal(processDriver.providerType, "local_process");
    assert.equal(processDriver.runnerMode, "process");

    const podmanDriver = new LocalCloudDriver({ runnerMode: "podman" });
    assert.equal(podmanDriver.providerType, "local_podman");
    assert.equal(podmanDriver.runnerMode, "podman");

    const dockerDriver = new LocalCloudDriver({ runnerMode: "docker" });
    assert.equal(dockerDriver.providerType, "local_docker");
    assert.equal(dockerDriver.runnerMode, "docker");
  });

  it("should launch, track, and terminate a local process worker", async () => {
    // Create a temporary mock worker script that stays alive briefly
    const tempScriptPath = resolve(process.cwd(), "temp-worker-mock.mjs");
    writeFileSync(
      tempScriptPath,
      `
      // Stay alive for a few seconds waiting for signals
      const timer = setInterval(() => {}, 1000);
      process.on("SIGTERM", () => {
        clearInterval(timer);
        process.exit(0);
      });
      `,
    );

    try {
      const driver = new LocalCloudDriver({
        runnerMode: "process",
        workerScriptPath: tempScriptPath,
        terminationGracePeriodMs: 1000,
      });

      const launchResult = await driver.launchWorker({
        workerId: "local-worker-1",
        provider: "local_process",
        managerApiUrl: "http://localhost:4000",
        queueConnectionString: "postgres://localhost/test",
      });

      assert.equal(launchResult.workerId, "local-worker-1");
      assert.equal(launchResult.provider, "local_process");
      assert.ok(launchResult.instanceId.startsWith("proc-"));

      const status = await driver.getWorkerStatus("local-worker-1");
      assert.equal(status.isHealthy, true);
      assert.ok(status.metadata?.pid !== undefined);

      const list = await driver.listWorkers();
      assert.equal(list.length, 1);

      await driver.terminateWorker("local-worker-1");

      const statusAfter = await driver.getWorkerStatus("local-worker-1");
      assert.equal(statusAfter.state, "TERMINATED");
    } finally {
      try {
        unlinkSync(tempScriptPath);
      } catch {
        // Cleanup temp file
      }
    }
  });

  it("should support Podman engine availability check", async () => {
    const containerRunner = new ContainerWorkerRunner();
    const isPodmanAvailable = await containerRunner.isEngineAvailable({
      runnerMode: "podman",
    });

    // Check that isEngineAvailable returns a boolean without throwing
    assert.equal(typeof isPodmanAvailable, "boolean");
  });
});
