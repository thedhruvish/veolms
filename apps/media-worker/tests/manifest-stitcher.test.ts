import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { mkdtemp, rm, writeFile, readFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ManifestStitcher } from "../src/runner/manifest-stitcher.ts";
import { LocalStorageAdapter } from "../src/storage/local-storage.ts";
import { ScratchWorkspaceManager } from "../src/storage/workspace.ts";

describe("ManifestStitcher (Worker-side Finalizer)", () => {
  let tempBase: string;
  let prodStorage: LocalStorageAdapter;
  let tempStorage: LocalStorageAdapter;
  let workspace: ScratchWorkspaceManager;
  let stitcher: ManifestStitcher;

  beforeEach(async () => {
    tempBase = await mkdtemp(join(tmpdir(), "stitcher-test-"));
    const prodDir = join(tempBase, "prod");
    const tempDir = join(tempBase, "temp");
    const scratchDir = join(tempBase, "scratch");

    prodStorage = new LocalStorageAdapter(prodDir);
    tempStorage = new LocalStorageAdapter(tempDir);
    workspace = new ScratchWorkspaceManager(scratchDir, "worker-test");

    stitcher = new ManifestStitcher({
      prodStorage,
      tempStorage,
      workspace,
    });
  });

  afterEach(async () => {
    await rm(tempBase, { recursive: true, force: true });
  });

  it("should stitch chunk playlists into master and rendition manifests", async () => {
    const videoId = "vid-stitch-1";
    const chunk1Dir = join(tempBase, "prod", "videos", videoId, "chunks", "c1");
    const chunk2Dir = join(tempBase, "prod", "videos", videoId, "chunks", "c2");
    await mkdir(chunk1Dir, { recursive: true });
    await mkdir(chunk2Dir, { recursive: true });

    // Mock chunk 1 HLS
    await writeFile(
      join(chunk1Dir, "1080p.m3u8"),
      `#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6.000000,\nseg0.ts\n#EXT-X-ENDLIST\n`,
      "utf-8",
    );

    // Mock chunk 2 HLS
    await writeFile(
      join(chunk2Dir, "1080p.m3u8"),
      `#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:4.500000,\nseg0.ts\n#EXT-X-ENDLIST\n`,
      "utf-8",
    );

    const masterKey = await stitcher.stitchAndUpload({
      videoId,
      requestedQualities: ["1080p"],
      chunks: [
        { id: "c1", chunk_index: 0 },
        { id: "c2", chunk_index: 1 },
      ],
    });

    assert.equal(masterKey, `videos/${videoId}/master.m3u8`);

    // Verify master.m3u8 exists
    const masterExists = await prodStorage.exists(masterKey);
    assert.equal(masterExists, true);

    // Verify 1080p.m3u8 exists and has discontinuity
    const qualityPath = join(tempBase, "prod", "videos", videoId, "1080p.m3u8");
    const qualityContent = await readFile(qualityPath, "utf-8");
    assert.ok(qualityContent.includes("#EXT-X-DISCONTINUITY"));
    assert.ok(qualityContent.includes("chunks/c1/seg0.ts"));
    assert.ok(qualityContent.includes("chunks/c2/seg0.ts"));
  });
});
