import { z } from "zod";

const booleanEnvironmentValueSchema = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

const serverConfigSchema = z.object({
  DATABASE_URL: z
    .url()
    .default("postgresql://veolms:veolms@localhost:5433/veolms"),
  API_HOST: z.string().min(1).default("127.0.0.1"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  API_DEV_PRETTY_LOGS: booleanEnvironmentValueSchema.default(true),
});

const webConfigSchema = z.object({
  WEB_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  VITE_API_BASE_URL: z.string().startsWith("/").default("/api/v1"),
  STATIC_BUILD_API_URL: z.url().default("http://localhost:4000/api/v1"),
});

export function loadServerConfig(
  environment: Record<string, string | undefined>,
) {
  return serverConfigSchema.parse(environment);
}

export function loadWebConfig(environment: Record<string, string | undefined>) {
  return webConfigSchema.parse(environment);
}
