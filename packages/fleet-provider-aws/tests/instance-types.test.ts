import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { selectOptimalInstanceType } from "../src/instance-types.ts";

describe("AWS Instance Type Selector", () => {
  it("should select optimal ARM64 instance based on CPU and memory requirements", () => {
    // 2 vCPU, 4GB -> c7g.large
    const instance1 = selectOptimalInstanceType({
      cpu: 2,
      memoryMb: 4096,
      architecture: "arm64",
      storageGb: 30,
      region: "us-east-1",
      environmentVariables: {},
    });
    assert.equal(instance1, "c7g.large");

    // 4 vCPU, 8GB -> c7g.xlarge
    const instance2 = selectOptimalInstanceType({
      cpu: 4,
      memoryMb: 8192,
      architecture: "arm64",
      storageGb: 50,
      region: "us-east-1",
      environmentVariables: {},
    });
    assert.equal(instance2, "c7g.xlarge");

    // 8 vCPU, 16GB -> c7g.2xlarge
    const instance3 = selectOptimalInstanceType({
      cpu: 8,
      memoryMb: 16384,
      architecture: "arm64",
      storageGb: 80,
      region: "us-east-1",
      environmentVariables: {},
    });
    assert.equal(instance3, "c7g.2xlarge");
  });

  it("should select optimal x86_64 instance when x86 architecture is requested", () => {
    const instance = selectOptimalInstanceType({
      cpu: 4,
      memoryMb: 8192,
      architecture: "x86_64",
      storageGb: 50,
      region: "us-east-1",
      environmentVariables: {},
    });
    assert.equal(instance, "c6i.xlarge");
  });
});
