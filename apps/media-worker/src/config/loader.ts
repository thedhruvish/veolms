import type { WorkerProviderType } from "@veolms/fleet-types";

import {
  DEFAULT_MEDIA_WORKER_CONFIG,
  type MediaWorkerConfig,
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
    DEFAULT_MEDIA_WORKER_CONFIG.storageDriver;
  const storageBasePath = env.STORAGE_BASE_PATH || env.STORAGE_DIR;
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
