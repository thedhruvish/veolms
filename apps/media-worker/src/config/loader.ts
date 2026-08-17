import type { WorkerProviderType } from "@veolms/fleet-types";

import {
  DEFAULT_MEDIA_WORKER_CONFIG,
  type MediaWorkerConfig,
  type StorageEndpointConfig,
} from "./options.ts";

export function loadWorkerConfig(
  env: NodeJS.ProcessEnv = process.env,
): MediaWorkerConfig {
  const workerId =
    env.WORKER_ID || `worker-${Math.random().toString(36).substring(2, 9)}`;
  const instanceId =
    env.INSTANCE_ID || `inst-${Math.random().toString(36).substring(2, 9)}`;
  const provider = (env.PROVIDER ||
    DEFAULT_MEDIA_WORKER_CONFIG.provider) as WorkerProviderType;
  const instanceType =
    env.INSTANCE_TYPE || DEFAULT_MEDIA_WORKER_CONFIG.instanceType;
  const managerApiUrl =
    env.MANAGER_API_URL || env.FLEET_MANAGER_API_URL || "http://localhost:4000";
  const queueConnectionString =
    env.QUEUE_CONNECTION_STRING ||
    env.DATABASE_URL ||
    "postgres://postgres:postgres@localhost:5432/veolms";

  const storageDriver =
    (env.STORAGE_DRIVER as "local" | "s3") ||
    (env.S3_PROD_BUCKET || env.S3_BUCKET ? "s3" : "local");
  const storageBasePath = env.STORAGE_BASE_PATH || env.STORAGE_DIR;

  const tempDriver = (env.TEMP_STORAGE_DRIVER ||
    env.STORAGE_DRIVER ||
    (env.S3_TEMP_BUCKET ? "s3" : storageDriver)) as "local" | "s3";
  const prodDriver = (env.PROD_STORAGE_DRIVER ||
    env.STORAGE_DRIVER ||
    (env.S3_PROD_BUCKET ? "s3" : storageDriver)) as "local" | "s3";

  const tempStorage: StorageEndpointConfig = {
    driver: tempDriver,
    basePath:
      env.TEMP_STORAGE_PATH ||
      (storageBasePath ? `${storageBasePath}/temp` : "./s3-bucket/temp"),
    bucket: env.S3_TEMP_BUCKET || env.S3_BUCKET,
    region: env.S3_TEMP_REGION || env.AWS_REGION,
    endpoint: env.S3_TEMP_ENDPOINT || env.S3_ENDPOINT,
    accessKeyId: env.S3_TEMP_ACCESS_KEY || env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.S3_TEMP_SECRET_KEY || env.AWS_SECRET_ACCESS_KEY,
    forcePathStyle: env.S3_FORCE_PATH_STYLE === "true",
  };

  const prodStorage: StorageEndpointConfig = {
    driver: prodDriver,
    basePath: env.PROD_STORAGE_PATH || storageBasePath || "./s3-bucket",
    bucket: env.S3_PROD_BUCKET || env.S3_BUCKET,
    region: env.S3_PROD_REGION || env.AWS_REGION,
    endpoint: env.S3_PROD_ENDPOINT || env.S3_ENDPOINT,
    accessKeyId: env.S3_PROD_ACCESS_KEY || env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.S3_PROD_SECRET_KEY || env.AWS_SECRET_ACCESS_KEY,
    forcePathStyle: env.S3_FORCE_PATH_STYLE === "true",
  };

  const scratchDir = env.SCRATCH_DIR || DEFAULT_MEDIA_WORKER_CONFIG.scratchDir;
  const heartbeatIntervalMs = parseInt(
    env.HEARTBEAT_INTERVAL_MS ||
      String(DEFAULT_MEDIA_WORKER_CONFIG.heartbeatIntervalMs),
    10,
  );
  const concurrency = parseInt(
    env.CONCURRENCY || String(DEFAULT_MEDIA_WORKER_CONFIG.concurrency),
    10,
  );
  const defaultCrf = parseInt(
    env.DEFAULT_CRF || String(DEFAULT_MEDIA_WORKER_CONFIG.defaultCrf),
    10,
  );
  const ffmpegPreset =
    env.FFMPEG_PRESET || DEFAULT_MEDIA_WORKER_CONFIG.ffmpegPreset;
  const hlsSegmentDurationSeconds = parseInt(
    env.HLS_SEGMENT_DURATION_SECONDS ||
      String(DEFAULT_MEDIA_WORKER_CONFIG.hlsSegmentDurationSeconds),
    10,
  );

  return {
    workerId,
    instanceId,
    provider,
    instanceType,
    managerApiUrl,
    queueConnectionString,
    tempStorage,
    prodStorage,
    storageDriver,
    storageBasePath,
    scratchDir,
    heartbeatIntervalMs,
    concurrency,
    defaultCrf,
    ffmpegPreset,
    hlsSegmentDurationSeconds,
  };
}
