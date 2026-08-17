import assert from "node:assert/strict";
import { describe, it, after } from "node:test";
import { stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  LocalStorageAdapter,
  S3StorageAdapter,
  ScratchWorkspaceManager,
  createDualStorageAdapters,
} from "../src/storage/index.ts";
import { loadWorkerConfig } from "../src/config/index.ts";

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

  it("should instantiate dual storage adapters for temporary and production buckets", () => {
    const config = loadWorkerConfig({
      TEMP_STORAGE_PATH: join(testRoot, "temp-storage"),
      PROD_STORAGE_PATH: join(testRoot, "prod-storage"),
    });

    const { tempStorage, prodStorage } = createDualStorageAdapters(config);

    assert.equal(tempStorage.driverType, "local");
    assert.equal(prodStorage.driverType, "local");
  });

  it("should configure S3 storage adapter with credentials and bucket", () => {
    const s3Adapter = new S3StorageAdapter({
      bucket: "test-prod-bucket",
      region: "ap-southeast-1",
      accessKeyId: "test-key",
      secretAccessKey: "test-secret",
    });

    assert.equal(s3Adapter.driverType, "s3");
    assert.equal(s3Adapter.bucket, "test-prod-bucket");
  });
});
