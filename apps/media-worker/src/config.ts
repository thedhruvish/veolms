import { z } from "zod";
import { resolveDefaultUploadConcurrency } from "./resource-monitor.ts";

export const mediaWorkerConfigSchema = z.object({
  WORKER_ID: z.string().uuid(),
  JOB_ID: z.string().uuid().optional(),
  DATABASE_URL: z
    .string()
    .default("postgresql://veolms:veolms@localhost:5433/veolms"),
  STORAGE_PROVIDER: z.enum(["local", "s3"]).default("local"),
  S3_BUCKET: z.string().default("veolms-media"),
  S3_BUCKET_NAME: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("us-east-1"),
  AWS_REGION: z.string().optional(),
  S3_FORCE_PATH_STYLE: z
    .enum(["true", "false"])
    .optional()
    .transform((val) => val === "true"),
  SCRATCH_DIR: z.string().default("/tmp/veolms-worker"),
  HEARTBEAT_INTERVAL_MS: z.coerce.number().int().min(1000).default(15000),
  PROGRESS_UPDATE_INTERVAL_MS: z.coerce.number().int().min(1000).default(5000),
  WORKER_IDLE_POLL_SECONDS: z.coerce.number().int().min(1).default(15),
  VIDEO_COMPRESSION_CRF: z.coerce.number().int().min(0).max(51).default(22),
  UPLOAD_MAX_CONCURRENCY: z.coerce.number().int().min(1).optional(),
  UPLOAD_MIN_CONCURRENCY: z.coerce.number().int().min(1).optional(),
  UPLOAD_THROTTLE_CPU_PERCENT: z.coerce.number().min(1).max(100).default(80),
  UPLOAD_THROTTLE_MEMORY_PERCENT: z.coerce
    .number()
    .min(1)
    .max(100)
    .default(80),
  INCREMENTAL_UPLOAD_POLL_MS: z.coerce.number().int().min(500).default(3000),
  INCREMENTAL_UPLOAD_SETTLE_MS: z.coerce.number().int().min(0).default(2000),
  HTTP_DOWNLOAD_TIMEOUT_MS: z.coerce.number().int().min(1000).default(300000),
  HTTP_DOWNLOAD_MAX_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(50 * 1024 * 1024 * 1024),
  FFMPEG_PATH: z.string().default("ffmpeg"),
  FFPROBE_PATH: z.string().default("ffprobe"),
});

type ParsedMediaWorkerConfig = z.infer<typeof mediaWorkerConfigSchema>;

export type MediaWorkerConfig = Omit<
  ParsedMediaWorkerConfig,
  "UPLOAD_MAX_CONCURRENCY" | "UPLOAD_MIN_CONCURRENCY"
> & {
  UPLOAD_MAX_CONCURRENCY: number;
  UPLOAD_MIN_CONCURRENCY: number;
};

export function loadMediaWorkerConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): MediaWorkerConfig {
  const resolvedEnv = {
    ...env,
    S3_BUCKET: env["S3_BUCKET"] || env["S3_BUCKET_NAME"] || "veolms-media",
    S3_REGION: env["S3_REGION"] || env["AWS_REGION"] || "us-east-1",
  };
  const parsed = mediaWorkerConfigSchema.parse(resolvedEnv);
  const defaults = resolveDefaultUploadConcurrency();
  const maxConcurrency =
    parsed.UPLOAD_MAX_CONCURRENCY ?? defaults.maxConcurrency;
  const minConcurrency =
    parsed.UPLOAD_MIN_CONCURRENCY ?? defaults.minConcurrency;

  if (minConcurrency > maxConcurrency) {
    throw new Error(
      "UPLOAD_MIN_CONCURRENCY must not exceed UPLOAD_MAX_CONCURRENCY",
    );
  }

  return {
    ...parsed,
    UPLOAD_MAX_CONCURRENCY: maxConcurrency,
    UPLOAD_MIN_CONCURRENCY: minConcurrency,
  };
}
