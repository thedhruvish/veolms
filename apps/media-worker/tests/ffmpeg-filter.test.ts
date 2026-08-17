import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  filterRenditionsForSource,
  QUALITY_RENDITION_MAP,
} from "../src/ffmpeg/index.ts";

describe("FFmpeg Filter & Resolution Clamping", () => {
  it("should have valid dimensions and bitrate configurations in QUALITY_RENDITION_MAP", () => {
    assert.equal(QUALITY_RENDITION_MAP["240p"].width, 426);
    assert.equal(QUALITY_RENDITION_MAP["240p"].height, 240);
    assert.equal(QUALITY_RENDITION_MAP["720p"].width, 1280);
    assert.equal(QUALITY_RENDITION_MAP["720p"].height, 720);
    assert.equal(QUALITY_RENDITION_MAP["1080p"].width, 1920);
    assert.equal(QUALITY_RENDITION_MAP["1080p"].height, 1080);
    assert.equal(QUALITY_RENDITION_MAP["2160p"].width, 3840);
    assert.equal(QUALITY_RENDITION_MAP["2160p"].height, 2160);
  });

  it("should enforce No-Upscaling by removing renditions higher than source height", () => {
    // Source video is 720p (height 720)
    const requested = ["240p", "480p", "720p", "1080p", "2160p"] as const;
    const renditions = filterRenditionsForSource(requested, 720);

    const qualities = renditions.map((r) => r.quality);
    assert.deepEqual(qualities, ["720p", "480p", "240p"]);

    // 1080p and 2160p must NOT be present
    assert.equal(qualities.includes("1080p"), false);
    assert.equal(qualities.includes("2160p"), false);
  });

  it("should allow all requested renditions when source is 4K (2160p)", () => {
    const requested = ["240p", "720p", "1080p", "2160p"] as const;
    const renditions = filterRenditionsForSource(requested, 2160);

    const qualities = renditions.map((r) => r.quality);
    assert.deepEqual(qualities, ["2160p", "1080p", "720p", "240p"]);
  });

  it("should deduplicate duplicate requested qualities", () => {
    const requested = ["720p", "720p", "240p", "240p"] as const;
    const renditions = filterRenditionsForSource(requested, 1080);

    const qualities = renditions.map((r) => r.quality);
    assert.deepEqual(qualities, ["720p", "240p"]);
  });

  it("should fallback to highest possible rendition if all requested exceed source", () => {
    // Source is 480p, but user requested 1080p
    const requested = ["1080p"] as const;
    const renditions = filterRenditionsForSource(requested, 480);

    assert.equal(renditions.length, 1);
    assert.equal(renditions[0]?.quality, "480p");
  });
});
