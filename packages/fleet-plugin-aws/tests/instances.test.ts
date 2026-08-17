import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EC2_VIDEO_INSTANCES,
  getEC2InstanceDefinition,
  listAvailableEC2Instances,
  selectBestEC2Instance,
} from "../src/ec2-instances.ts";

describe("AWS EC2 Instance Catalog for Video Transcoding", () => {
  it("should provide curated instance definitions with valid vCPU, memory, and costs", () => {
    const instances = listAvailableEC2Instances();
    assert.ok(instances.length >= 5);

    for (const inst of instances) {
      assert.ok(inst.instanceType.length > 0);
      assert.ok(inst.vCpu >= 2);
      assert.ok(inst.memoryGiB >= 4);
      assert.ok(inst.spotAverageCostPerHourUsd > 0);
      assert.ok(inst.onDemandCostPerHourUsd > inst.spotAverageCostPerHourUsd);
      assert.ok(["x86_64", "arm64"].includes(inst.architecture));
    }
  });

  it("should find instance definition by type name", () => {
    const c6i = getEC2InstanceDefinition("c6i.xlarge");
    assert.equal(c6i.vCpu, 4);
    assert.equal(c6i.memoryGiB, 8);
    assert.equal(c6i.family, "compute_cpu");

    const g4dn = getEC2InstanceDefinition("g4dn.xlarge");
    assert.equal(g4dn.family, "gpu_nvidia");
    assert.equal(g4dn.gpuName, "NVIDIA T4 (16GB)");
  });

  it("should dynamically select GPU instance when 4K or GPU preferred", () => {
    const pool = ["c6i.large", "c6i.xlarge", "c6i.2xlarge", "g4dn.xlarge"];

    const selectedGpu = selectBestEC2Instance(pool, {
      isGpuPreferred: true,
      is4KOrAbove: true,
    });
    assert.equal(selectedGpu, "g4dn.xlarge");
  });

  it("should dynamically select high compute instance for complex multi-bitrate workload", () => {
    const pool = ["c6i.large", "c6i.xlarge", "c6i.2xlarge"];

    const selectedHigh = selectBestEC2Instance(pool, {
      complexityScore: 3.5,
      requestedQualitiesCount: 5,
    });
    assert.equal(selectedHigh, "c6i.2xlarge");
  });

  it("should dynamically select standard instance for standard workload", () => {
    const pool = ["c6i.large", "c6i.xlarge", "c6i.2xlarge"];

    const selectedStandard = selectBestEC2Instance(pool, {
      complexityScore: 1.0,
      requestedQualitiesCount: 2,
    });
    assert.equal(selectedStandard, "c6i.xlarge");
  });

  it("should return fallback definition for unknown custom instance", () => {
    const custom = getEC2InstanceDefinition("c8g.4xlarge");
    assert.equal(custom.instanceType, "c8g.4xlarge");
    assert.equal(custom.vCpu, 4);
  });
});
