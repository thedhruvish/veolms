import { z } from "zod";

export const WORKER_STATUSES = [
  "PENDING",
  "PROVISIONING",
  "STARTING",
  "READY",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "TERMINATING",
  "TERMINATED",
] as const;

export type WorkerStatus = (typeof WORKER_STATUSES)[number];
export const workerStatusSchema = z.enum(WORKER_STATUSES);

export const ARCHITECTURES = ["arm64", "x86_64"] as const;
export type Architecture = (typeof ARCHITECTURES)[number];
export const architectureSchema = z.enum(ARCHITECTURES);

export const PROVIDER_TYPES = ["local", "aws"] as const;
export type ProviderType = (typeof PROVIDER_TYPES)[number];
export const providerTypeSchema = z.enum(PROVIDER_TYPES);

export interface WorkerSpec {
  cpu: number;
  memoryMb: number;
  architecture: Architecture;
  storageGb: number;
  region: string;
  amiId?: string;
  environmentVariables: Readonly<Record<string, string>>;
  tags?: Readonly<Record<string, string>>;
}

export const workerSpecSchema = z.object({
  cpu: z.number().int().min(1),
  memoryMb: z.number().int().min(512),
  architecture: architectureSchema,
  storageGb: z.number().int().min(5).default(30),
  region: z.string().default("local"),
  amiId: z.string().optional(),
  environmentVariables: z.record(z.string(), z.string()).default({}),
  tags: z.record(z.string(), z.string()).optional(),
});

export interface WorkerHandle {
  id: string;
  providerWorkerId: string;
  provider: ProviderType;
  status: WorkerStatus;
  privateIp: string | null;
  publicIp: string | null;
  createdAt: Date;
}

export interface WorkerMetrics {
  cpuUsagePercent: number;
  memoryUsageMb: number;
  diskFreeGb: number;
  timestamp: Date;
}
