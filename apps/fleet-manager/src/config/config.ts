import { z } from "zod";

export const fleetManagerConfigSchema = z.object({
  DATABASE_URL: z
    .string()
    .default("postgresql://veolms:veolms@localhost:5433/veolms"),
  PROVIDER: z.enum(["local", "aws"]).default("local"),
  POLL_INTERVAL_MS: z.coerce.number().int().min(500).default(2000),
  HEARTBEAT_TIMEOUT_SECONDS: z.coerce.number().int().min(10).default(90),
  MIN_CHECK_INTERVAL_SECONDS: z.coerce.number().int().min(5).default(15),
  MAX_CHECK_INTERVAL_SECONDS: z.coerce.number().int().min(30).default(300),
  DEFAULT_CHECK_INTERVAL_SECONDS: z.coerce.number().int().min(10).default(30),
  MAX_RETRIES: z.coerce.number().int().min(0).default(3),
  MAX_WORKERS: z.coerce.number().int().min(1).default(8),
  MEDIA_WORKER_SCRIPT_PATH: z.string().optional(),
});

export type FleetManagerConfig = z.infer<typeof fleetManagerConfigSchema>;

export function loadFleetManagerConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): FleetManagerConfig {
  return fleetManagerConfigSchema.parse(env);
}
