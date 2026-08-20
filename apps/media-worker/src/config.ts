import { z } from "zod";

export const mediaWorkerConfigSchema = z.object({
  WORKER_ID: z.string().uuid(),
  JOB_ID: z.string().uuid().optional(),
  DATABASE_URL: z
    .string()
    .default("postgresql://veolms:veolms@localhost:5433/veolms"),
  STORAGE_PROVIDER: z.string().default("local"),
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
  FFMPEG_PATH: z.string().default("ffmpeg"),
  FFPROBE_PATH: z.string().default("ffprobe"),
});

export type MediaWorkerConfig = z.infer<typeof mediaWorkerConfigSchema>;

export function loadMediaWorkerConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): MediaWorkerConfig {
  const resolvedEnv = {
    ...env,
    S3_BUCKET: env["S3_BUCKET"] || env["S3_BUCKET_NAME"] || "veolms-media",
    S3_REGION: env["S3_REGION"] || env["AWS_REGION"] || "us-east-1",
  };
  return mediaWorkerConfigSchema.parse(resolvedEnv);
}
