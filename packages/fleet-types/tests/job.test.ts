import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  jobRequirementsSchema,
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

  it("should validate job requirements with target quality array", () => {
    const valid = {
      qualities: ["1080p", "720p", "480p"],
      videoCodec: "h264",
      audioCodec: "aac",
      segmentDurationSeconds: 6,
      hardware: {
        minCpu: 4,
        minMemoryMb: 8192,
        architecture: "arm64",
        storageGb: 50,
        estimatedDurationSeconds: 1200,
      },
    };

    const parsed = jobRequirementsSchema.parse(valid);
    assert.deepEqual(parsed.qualities, ["1080p", "720p", "480p"]);
    assert.equal(parsed.videoCodec, "h264");
    assert.equal(parsed.hardware.minCpu, 4);
    assert.equal(parsed.hardware.architecture, "arm64");
  });

  it("should reject empty qualities array in job requirements", () => {
    const invalid = {
      qualities: [],
    };
    assert.throws(() => jobRequirementsSchema.parse(invalid));
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
