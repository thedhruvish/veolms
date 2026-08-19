import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildFfmpegHlsArgs,
  filterApplicableQualities,
  generateMasterPlaylist,
} from "../src/ffmpeg-builder.ts";

describe("FFmpeg Dynamic HLS Command Builder", () => {
  it("should filter out qualities that exceed source video dimensions", () => {
    // 720p source
    const requested = ["1080p", "720p", "480p", "360p"] as const;
    const applicable = filterApplicableQualities(requested, 1280, 720);

    assert.deepEqual(applicable, ["720p", "480p", "360p"]);
  });

  it("should fallback to smallest quality if source is lower than all requested", () => {
    const requested = ["1080p", "720p"] as const;
    // 360p source
    const applicable = filterApplicableQualities(requested, 640, 360);

    assert.deepEqual(applicable, ["720p"]);
  });

  it("should build valid FFmpeg arguments for requested quality profiles", () => {
    const result = buildFfmpegHlsArgs({
      inputPath: "/tmp/source.mp4",
      outputDir: "/tmp/hls_out",
      qualities: ["1080p", "720p", "480p"],
      metadata: {
        durationSeconds: 120,
        width: 1920,
        height: 1080,
      },
      segmentDurationSeconds: 6,
    });

    assert.ok(result.args.includes("-i"));
    assert.ok(result.args.includes("/tmp/source.mp4"));
    assert.ok(result.args.includes("-progress"));
    assert.ok(result.args.includes("pipe:1"));
    assert.deepEqual(result.applicableQualities, ["1080p", "720p", "480p"]);

    assert.equal(result.variants.length, 3);
    assert.equal(result.variants[0].quality, "1080p");
    assert.equal(result.variants[0].width, 1920);
    assert.equal(result.variants[1].quality, "720p");
    assert.equal(result.variants[2].quality, "480p");
  });

  it("should generate a valid master HLS playlist with stream inf tags", () => {
    const master = generateMasterPlaylist([
      {
        quality: "1080p",
        relativePlaylistPath: "1080p/1080p.m3u8",
        bandwidth: 4628000,
        width: 1920,
        height: 1080,
      },
      {
        quality: "720p",
        relativePlaylistPath: "720p/720p.m3u8",
        bandwidth: 2528000,
        width: 1280,
        height: 720,
      },
    ]);

    assert.ok(master.startsWith("#EXTM3U\n#EXT-X-VERSION:3"));
    assert.ok(
      master.includes(
        "#EXT-X-STREAM-INF:BANDWIDTH=4628000,RESOLUTION=1920x1080",
      ),
    );
    assert.ok(master.includes("1080p/1080p.m3u8"));
    assert.ok(
      master.includes(
        "#EXT-X-STREAM-INF:BANDWIDTH=2528000,RESOLUTION=1280x720",
      ),
    );
    assert.ok(master.includes("720p/720p.m3u8"));
  });

  it("should handle portrait / vertical videos without falling back to low resolution", () => {
    // 1080x1920 portrait video
    const requested = ["1080p", "720p", "480p", "360p"] as const;
    const applicable = filterApplicableQualities(requested, 1080, 1920);

    assert.deepEqual(applicable, ["1080p", "720p", "480p", "360p"]);
  });

  it("should include GOP alignment, sc_threshold 0 and independent segments flags", () => {
    const result = buildFfmpegHlsArgs({
      inputPath: "/tmp/source.mp4",
      outputDir: "/tmp/hls_out",
      qualities: ["1080p"],
      metadata: {
        durationSeconds: 60,
        width: 1920,
        height: 1080,
      },
      segmentDurationSeconds: 6,
    });

    assert.ok(result.args.includes("-g"));
    assert.ok(result.args.includes("-keyint_min"));
    assert.ok(result.args.includes("-sc_threshold"));
    assert.ok(result.args.includes("0"));
    assert.ok(result.args.includes("-hls_flags"));
    assert.ok(result.args.includes("independent_segments"));
  });
});
