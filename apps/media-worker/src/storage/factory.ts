import { LocalStorageAdapter } from "./local-storage.ts";
import { S3StorageAdapter } from "./s3-storage.ts";
import type { StorageAdapter } from "./types.ts";
import type { MediaWorkerConfig } from "../config/options.ts";

export interface DualStorageAdapters {
  readonly tempStorage: StorageAdapter;
  readonly prodStorage: StorageAdapter;
}

/**
 * Creates separate storage adapters for Temporary (Scratch) and Production (Finalized HLS) buckets.
 */
export function createDualStorageAdapters(
  config: MediaWorkerConfig,
): DualStorageAdapters {
  let tempStorage: StorageAdapter;
  let prodStorage: StorageAdapter;

  if (config.tempStorage.driver === "s3") {
    tempStorage = new S3StorageAdapter({
      bucket: config.tempStorage.bucket || "veolms-temp-bucket",
      region: config.tempStorage.region,
      endpoint: config.tempStorage.endpoint,
      accessKeyId: config.tempStorage.accessKeyId,
      secretAccessKey: config.tempStorage.secretAccessKey,
      forcePathStyle: config.tempStorage.forcePathStyle,
    });
  } else {
    tempStorage = new LocalStorageAdapter(config.tempStorage.basePath);
  }

  if (config.prodStorage.driver === "s3") {
    prodStorage = new S3StorageAdapter({
      bucket: config.prodStorage.bucket || "veolms-prod-bucket",
      region: config.prodStorage.region,
      endpoint: config.prodStorage.endpoint,
      accessKeyId: config.prodStorage.accessKeyId,
      secretAccessKey: config.prodStorage.secretAccessKey,
      forcePathStyle: config.prodStorage.forcePathStyle,
    });
  } else {
    prodStorage = new LocalStorageAdapter(config.prodStorage.basePath);
  }

  return {
    tempStorage,
    prodStorage,
  };
}
