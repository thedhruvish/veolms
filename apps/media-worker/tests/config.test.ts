import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loadWorkerConfig } from "../src/config/index.ts";

describe("Media Worker Configuration", () => {
  it("should load default configuration when no env variables are set", () => {
    const config = loadWorkerConfig({});

    assert.ok(config.workerId.startsWith("worker-"));
    assert.ok(config.instanceId.startsWith("inst-"));
    assert.equal(config.provider, "local_process");
    assert.equal(config.managerApiUrl, "http://localhost:4000");
    assert.equal(config.defaultCrf, 22);
    assert.equal(config.ffmpegPreset, "veryfast");
    assert.equal(config.hlsSegmentDurationSeconds, 6);
  });

  it("should override defaults with environment variables", () => {
    const config = loadWorkerConfig({
      WORKER_ID: "custom-worker-99",
      INSTANCE_ID: "custom-inst-99",
      PROVIDER: "local_podman",
      MANAGER_API_URL: "http://10.0.0.1:5000",
      DEFAULT_CRF: "20",
      FFMPEG_PRESET: "medium",
      HEARTBEAT_INTERVAL_MS: "2000",
      HLS_SEGMENT_DURATION_SECONDS: "4",
    });

    assert.equal(config.workerId, "custom-worker-99");
    assert.equal(config.instanceId, "custom-inst-99");
    assert.equal(config.provider, "local_podman");
    assert.equal(config.managerApiUrl, "http://10.0.0.1:5000");
    assert.equal(config.defaultCrf, 20);
    assert.equal(config.ffmpegPreset, "medium");
    assert.equal(config.heartbeatIntervalMs, 2000);
    assert.equal(config.hlsSegmentDurationSeconds, 4);
  });
});
