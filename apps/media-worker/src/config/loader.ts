import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { WorkerProviderType } from "@veolms/fleet-types";

import {
  DEFAULT_MEDIA_WORKER_CONFIG,
  type MediaWorkerConfig,
  type StorageEndpointConfig,
} from "./options.ts";

interface JsonWorkerConfig {
  controlPlane?: {
    mode?: "serverful" | "serverless";
    fleetManagerUrl?: string;
    apiKey?: string;
  };
  storage?: {
    type?: "local" | "s3";
    tempBucket?: string;
    productionBucket?: string;
  };
  transcoding?: {
    engine?: string;
    preset?: string;
    crf?: number;
    hlsSegmentDuration?: number;
    hardwareAcceleration?: string;
  };
}

function loadJsonWorkerConfigFile(): JsonWorkerConfig | null {
  const possiblePaths = [
    resolve(process.cwd(), "worker.config.json"),
    resolve(process.cwd(), "apps/media-worker/worker.config.json"),
  ];
  for (const p of possiblePaths) {
    if (existsSync(p)) {
      try {
        const raw = readFileSync(p, "utf-8");
        return JSON.parse(raw) as JsonWorkerConfig;
      } catch {
        // Ignore parse error
      }
    }
  }
  return null;
}

export function loadWorkerConfig(
  env: NodeJS.ProcessEnv = process.env,
): MediaWorkerConfig {
  const jsonCfg = loadJsonWorkerConfigFile();

  const workerId =
    env.WORKER_ID || `worker-${Math.random().toString(36).substring(2, 9)}`;
  const instanceId =
    env.INSTANCE_ID || `inst-${Math.random().toString(36).substring(2, 9)}`;
  const provider = (env.PROVIDER ||
    DEFAULT_MEDIA_WORKER_CONFIG.provider) as WorkerProviderType;
  const instanceType =
    env.INSTANCE_TYPE || DEFAULT_MEDIA_WORKER_CONFIG.instanceType;
  const managerApiUrl =
    env.MANAGER_API_URL ||
    env.FLEET_MANAGER_API_URL ||
    jsonCfg?.controlPlane?.fleetManagerUrl ||
    "http://localhost:4000";
  const queueConnectionString =
    env.QUEUE_CONNECTION_STRING ||
    env.DATABASE_URL ||
    "postgres://postgres:postgres@localhost:5432/veolms";

  const storageDriver =
    (env.STORAGE_DRIVER as "local" | "s3") ||
    (env.S3_PROD_BUCKET || env.S3_BUCKET
      ? "s3"
      : env.TEMP_STORAGE_PATH || env.PROD_STORAGE_PATH
        ? "local"
        : jsonCfg?.storage?.type || "local");
  const storageBasePath = env.STORAGE_BASE_PATH || env.STORAGE_DIR;

  const tempBucket =
    env.S3_TEMP_BUCKET ||
    env.S3_BUCKET ||
    (env.TEMP_STORAGE_PATH ? undefined : jsonCfg?.storage?.tempBucket);
  const prodBucket =
    env.S3_PROD_BUCKET ||
    env.S3_BUCKET ||
    (env.PROD_STORAGE_PATH ? undefined : jsonCfg?.storage?.productionBucket);

  const tempDriver = (env.TEMP_STORAGE_DRIVER ||
    env.STORAGE_DRIVER ||
    (tempBucket ? "s3" : storageDriver)) as "local" | "s3";
  const prodDriver = (env.PROD_STORAGE_DRIVER ||
    env.STORAGE_DRIVER ||
    (prodBucket ? "s3" : storageDriver)) as "local" | "s3";

  const tempStorage: StorageEndpointConfig = {
    driver: tempDriver,
    basePath:
      env.TEMP_STORAGE_PATH ||
      (storageBasePath ? `${storageBasePath}/temp` : "./s3-bucket/temp"),
    bucket: tempBucket,
    region: env.S3_TEMP_REGION || env.AWS_REGION,
    endpoint: env.S3_TEMP_ENDPOINT || env.S3_ENDPOINT,
    accessKeyId: env.S3_TEMP_ACCESS_KEY || env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.S3_TEMP_SECRET_KEY || env.AWS_SECRET_ACCESS_KEY,
    forcePathStyle: env.S3_FORCE_PATH_STYLE === "true",
  };

  const prodStorage: StorageEndpointConfig = {
    driver: prodDriver,
    basePath: env.PROD_STORAGE_PATH || storageBasePath || "./s3-bucket",
    bucket: prodBucket,
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
    env.DEFAULT_CRF ||
      String(
        jsonCfg?.transcoding?.crf || DEFAULT_MEDIA_WORKER_CONFIG.defaultCrf,
      ),
    10,
  );
  const ffmpegPreset =
    env.FFMPEG_PRESET ||
    jsonCfg?.transcoding?.preset ||
    DEFAULT_MEDIA_WORKER_CONFIG.ffmpegPreset;
  const hlsSegmentDurationSeconds = parseInt(
    env.HLS_SEGMENT_DURATION_SECONDS ||
      String(
        jsonCfg?.transcoding?.hlsSegmentDuration ||
          DEFAULT_MEDIA_WORKER_CONFIG.hlsSegmentDurationSeconds,
      ),
    10,
  );

  const apiKey =
    env.FLEET_API_KEY ||
    env.API_KEY ||
    jsonCfg?.controlPlane?.apiKey ||
    process.env.FLEET_API_KEY ||
    undefined;

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
    apiKey,
    defaultCrf,
    ffmpegPreset,
    hlsSegmentDurationSeconds,
  };
}
