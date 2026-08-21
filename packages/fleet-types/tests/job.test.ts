import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  estimateJobHardware,
  jobStatusSchema,
  JOB_STATUSES,
} from "../src/job.ts";
import {
  workerStatusSchema,
  workerSpecSchema,
  WORKER_STATUSES,
} from "../src/worker.ts";
import { progressUpdateSchema } from "../src/monitoring.ts";

describe("Job & Worker Schemas and Contracts", () => {
  it("should validate all job statuses", () => {
    for (const status of JOB_STATUSES) {
      assert.equal(jobStatusSchema.parse(status), status);
    }
  });

  it("should validate all worker statuses", () => {
    for (const status of WORKER_STATUSES) {
      assert.equal(workerStatusSchema.parse(status), status);
    }
  });

  it("estimates baseline hardware for a small standard-quality job", () => {
    const hw = estimateJobHardware(0, ["720p"]);
    assert.equal(hw.minCpu, 2);
    assert.equal(hw.minMemoryMb, 4096);
    assert.equal(hw.storageGb, 30);
    assert.equal(hw.architecture, "arm64");
  });

  it("scales cpu/memory/storage up for 2160p regardless of size", () => {
    const hw = estimateJobHardware(0, ["2160p", "1080p"]);
    assert.equal(hw.minCpu, 8);
    assert.equal(hw.minMemoryMb, 16384);
    assert.equal(hw.storageGb, 80);
  });

  it("scales up when 5+ qualities are requested even without 1440p/2160p", () => {
    const hw = estimateJobHardware(0, [
      "1080p",
      "720p",
      "480p",
      "360p",
      "240p",
    ]);
    assert.equal(hw.minCpu, 4);
    assert.equal(hw.minMemoryMb, 8192);
  });

  it("scales storage and estimated duration up for a large source video", () => {
    const small = estimateJobHardware(1024, ["720p"]);
    const large = estimateJobHardware(50 * 1024 ** 3, ["720p"]);
    assert.ok(large.storageGb > small.storageGb);
    assert.ok(large.estimatedDurationSeconds > small.estimatedDurationSeconds);
  });

  it("should validate worker spec schema", () => {
    const spec = {
      cpu: 2,
      memoryMb: 4096,
      architecture: "arm64",
      storageGb: 30,
      region: "us-east-1",
      environmentVariables: {
        WORKER_ID: "11111111-1111-1111-1111-111111111111",
        DATABASE_URL: "postgresql://localhost:5432/veolms",
      },
    };

    const parsed = workerSpecSchema.parse(spec);
    assert.equal(parsed.cpu, 2);
    assert.equal(parsed.architecture, "arm64");
    assert.equal(
      parsed.environmentVariables["WORKER_ID"],
      "11111111-1111-1111-1111-111111111111",
    );
  });

  it("should validate progress update schema", () => {
    const update = {
      workerId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      jobId: "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22",
      progressPercent: 45.5,
      processedSeconds: 273,
      totalDurationSeconds: 600,
      fps: 58.2,
      speed: 1.94,
      currentQuality: "720p",
    };

    const parsed = progressUpdateSchema.parse(update);
    assert.equal(parsed.progressPercent, 45.5);
    assert.equal(parsed.currentQuality, "720p");
  });
});
