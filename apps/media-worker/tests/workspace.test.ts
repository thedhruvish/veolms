import assert from "node:assert/strict";
import { describe, it, after } from "node:test";
import { stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  LocalStorageAdapter,
  ScratchWorkspaceManager,
} from "../src/storage/index.ts";

describe("Storage & Scratch Workspace Manager", () => {
  const testRoot = `/tmp/veolms-test-${Math.random().toString(36).substring(2, 8)}`;
  const workspaceManager = new ScratchWorkspaceManager(
    testRoot,
    "worker-test-1",
  );
  const storageAdapter = new LocalStorageAdapter(join(testRoot, "storage"));

  after(async () => {
    await workspaceManager.purgeWorkerWorkspace();
  });

  it("should create and cleanup isolated chunk workspace directories", async () => {
    const paths = await workspaceManager.createChunkWorkspace("chunk-001");

    assert.ok(paths.inputDir.includes("chunk-001"));
    assert.ok(paths.outputDir.includes("chunk-001"));

    // Verify directories exist
    const inputStat = await stat(paths.inputDir);
    assert.equal(inputStat.isDirectory(), true);

    const outputStat = await stat(paths.outputDir);
    assert.equal(outputStat.isDirectory(), true);

    // Clean up
    await workspaceManager.cleanupChunkWorkspace("chunk-001");

    let exists = false;
    try {
      await stat(paths.rootDir);
      exists = true;
    } catch {
      exists = false;
    }
    assert.equal(exists, false);
  });

  it("should upload, check existence, and download files using LocalStorageAdapter", async () => {
    const paths = await workspaceManager.createChunkWorkspace("chunk-002");
    const testFile = join(paths.outputDir, "rendition_720p.m3u8");
    await writeFile(testFile, "#EXTM3U\n#EXT-X-VERSION:3\n", "utf-8");

    // Upload file
    const remoteKey = "videos/vid-1/chunks/chunk-002/rendition_720p.m3u8";
    await storageAdapter.uploadFile(testFile, remoteKey);

    assert.equal(await storageAdapter.exists(remoteKey), true);

    // Download to new location
    const downloadedPath = join(paths.inputDir, "downloaded.m3u8");
    await storageAdapter.downloadFile(remoteKey, downloadedPath);

    assert.equal(await storageAdapter.exists(remoteKey), true);

    // Clean up chunk
    await workspaceManager.cleanupChunkWorkspace("chunk-002");
  });
});
