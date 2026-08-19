import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapEc2StateToWorkerStatus } from "../src/provider.ts";

describe("AWS Fleet Provider", () => {
  it("should map EC2 instance states to fleet WorkerStatus correctly", () => {
    assert.equal(mapEc2StateToWorkerStatus("pending"), "STARTING");
    assert.equal(mapEc2StateToWorkerStatus("running"), "PROCESSING");
    assert.equal(mapEc2StateToWorkerStatus("shutting-down"), "TERMINATING");
    assert.equal(mapEc2StateToWorkerStatus("terminated"), "TERMINATED");
    assert.equal(mapEc2StateToWorkerStatus("stopped"), "FAILED");
    assert.equal(mapEc2StateToWorkerStatus("stopping"), "FAILED");
    assert.equal(mapEc2StateToWorkerStatus("unknown"), "PENDING");
  });
});
