import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  calculateCapacityAllocation,
  calculateDynamicChunkDuration,
  calculateFullWorkloadPlan,
  calculateQualityComplexity,
  calculateSourceComplexity,
} from "../src/core/sizing/index.ts";

describe("Dynamic Workload Sizer & Capacity Planner", () => {
  describe("Quality Complexity Calculator", () => {
    it("should calculate correct sum for single quality", () => {
      const result = calculateQualityComplexity(["240p"]);
      assert.equal(result.totalWeight, 0.8);
      assert.deepEqual(result.requestedQualities, ["240p"]);
    });

    it("should calculate correct sum for multiple qualities", () => {
      const result = calculateQualityComplexity([
        "240p",
        "360p",
        "480p",
        "720p",
      ]);
      // 0.8 + 1.0 + 1.2 + 2.0 = 5.0
      assert.equal(result.totalWeight, 5.0);
    });

    it("should deduplicate duplicate qualities", () => {
      const result = calculateQualityComplexity(["1080p", "1080p", "720p"]);
      // 3.0 + 2.0 = 5.0
      assert.equal(result.totalWeight, 5.0);
      assert.equal(result.requestedQualities.length, 2);
    });

    it("should return zero for empty qualities", () => {
      const result = calculateQualityComplexity([]);
      assert.equal(result.totalWeight, 0);
      assert.deepEqual(result.requestedQualities, []);
    });
  });

  describe("Source Complexity Analyzer", () => {
    it("should return 1.0 for baseline 1080p 30fps H264", () => {
      const result = calculateSourceComplexity({
        durationSeconds: 3600,
        width: 1920,
        height: 1080,
        fps: 30,
        codec: "h264",
      });

      assert.equal(result.resolutionFactor, 1.0);
      assert.equal(result.fpsFactor, 1.0);
      assert.equal(result.codecMultiplier, 1.0);
      assert.equal(result.totalSourceComplexity, 1.0);
    });

    it("should compute higher complexity for 4K 60fps HEVC", () => {
      const result = calculateSourceComplexity({
        durationSeconds: 3600,
        width: 3840,
        height: 2160,
        fps: 60,
        codec: "hevc",
      });

      // 4K pixels = 4x 1080p pixels
      assert.equal(result.resolutionFactor, 4.0);
      // 60fps = 2x 30fps
      assert.equal(result.fpsFactor, 2.0);
      // hevc multiplier = 1.5
      assert.equal(result.codecMultiplier, 1.5);
      // 4 * 2 * 1.5 = 12.0
      assert.equal(result.totalSourceComplexity, 12.0);
    });
  });

  describe("Dynamic Chunk Sizer (Formula A)", () => {
    it("should produce larger chunks for low complexity workloads", () => {
      // 60-minute video with low complexity (0.8 quality, 1.0 source)
      // Raw: 60 / 0.8 = 75 min -> clamped to MAX 30m (1800s)
      const result = calculateDynamicChunkDuration(3600, 0.8, 1.0);
      assert.equal(result.clampedDurationSeconds, 1800);
      assert.equal(result.totalChunks, 2);
    });

    it("should produce smaller chunks for high complexity workloads", () => {
      // High complexity (8.0 quality, 1.0 source)
      // Raw: 60 / 8 = 7.5 min = 450s
      const result = calculateDynamicChunkDuration(3600, 8.0, 1.0);
      assert.equal(result.clampedDurationSeconds, 450);
      assert.equal(result.totalChunks, 8);
    });

    it("should clamp to minimum chunk duration (300s) under extreme load", () => {
      // Very heavy load (20.0 quality, 12.0 source)
      // Raw: 60 / 240 = 0.25 min = 15s -> clamped to MIN 300s
      const result = calculateDynamicChunkDuration(3600, 20.0, 12.0);
      assert.equal(result.clampedDurationSeconds, 300);
      assert.equal(result.totalChunks, 12);
    });
  });

  describe("Capacity Allocation Planner (Formula B)", () => {
    it("should not launch more workers than total chunks", () => {
      // Video with 3 chunks: required workers = min(3, 4) = 3
      const result = calculateCapacityAllocation({
        videoId: "video-1",
        chunkCount: 3,
        fleetState: {
          totalRunningWorkers: 0,
          idleWorkers: 0,
          nearCompleteWorkers: 0,
          maxTotalWorkers: 20,
        },
      });

      assert.equal(result.requiredWorkers, 3);
      assert.equal(result.workersToLaunch, 3);
    });

    it("should reuse near-complete (>=85%) and idle workers before launching", () => {
      // Required = 3 workers, fleet has 1 idle and 2 near-complete
      const result = calculateCapacityAllocation({
        videoId: "video-2",
        chunkCount: 3,
        fleetState: {
          totalRunningWorkers: 5,
          idleWorkers: 1,
          nearCompleteWorkers: 2,
          maxTotalWorkers: 20,
        },
      });

      assert.equal(result.requiredWorkers, 3);
      assert.equal(result.reusableWorkers, 3);
      assert.equal(result.workersToLaunch, 0);
    });

    it("should launch only missing delta capacity", () => {
      // Required = 4 workers, fleet has 1 idle and 1 near-complete
      const result = calculateCapacityAllocation({
        videoId: "video-3",
        chunkCount: 5,
        fleetState: {
          totalRunningWorkers: 4,
          idleWorkers: 1,
          nearCompleteWorkers: 1,
          maxTotalWorkers: 20,
        },
      });

      assert.equal(result.requiredWorkers, 4);
      assert.equal(result.reusableWorkers, 2);
      assert.equal(result.workersToLaunch, 2);
    });

    it("should respect global max total workers ceiling", () => {
      // 18 running workers, max 20, video wants 4 workers but only 2 slots remaining
      const result = calculateCapacityAllocation({
        videoId: "video-4",
        chunkCount: 4,
        fleetState: {
          totalRunningWorkers: 18,
          idleWorkers: 0,
          nearCompleteWorkers: 0,
          maxTotalWorkers: 20,
        },
      });

      assert.equal(result.requiredWorkers, 4);
      assert.equal(result.workersToLaunch, 2);
    });
  });

  describe("End-to-End Workload Planner", () => {
    it("should generate a complete coherent plan for 60m 1080p video", () => {
      const plan = calculateFullWorkloadPlan({
        videoId: "video-full",
        sourceMetadata: {
          durationSeconds: 3600,
          width: 1920,
          height: 1080,
          fps: 30,
          codec: "h264",
        },
        requestedQualities: ["240p", "360p", "480p", "720p", "1080p"],
        fleetState: {
          totalRunningWorkers: 2,
          idleWorkers: 1,
          nearCompleteWorkers: 1,
          maxTotalWorkers: 20,
        },
      });

      // Quality: 0.8 + 1.0 + 1.2 + 2.0 + 3.0 = 8.0
      assert.equal(plan.qualityComplexity.totalWeight, 8.0);
      assert.equal(plan.sourceComplexity.totalSourceComplexity, 1.0);
      assert.equal(plan.workload.workPerMinute, 8.0);
      // Chunk: 450s, 8 chunks
      assert.equal(plan.chunkSizing.clampedDurationSeconds, 450);
      assert.equal(plan.chunkSizing.totalChunks, 8);
      // Capacity: max 4 workers, 2 reusable => 2 to launch
      assert.equal(plan.capacityAllocation.requiredWorkers, 4);
      assert.equal(plan.capacityAllocation.workersToLaunch, 2);
    });
  });
});
