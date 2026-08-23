import type { Generated, JSONColumnType } from "kysely";

export type JobStatus =
  "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED";

export type VideoQualityLevel =
  "2160p" | "1440p" | "1080p" | "720p" | "480p" | "360p" | "240p" | "144p";

export type ProviderType = "local" | "aws";

export type WorkerStatus =
  | "PENDING"
  | "PROVISIONING"
  | "STARTING"
  | "READY"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "TERMINATING"
  | "TERMINATED";

export type Architecture = "arm64" | "x86_64";

export type FleetEventType =
  | "WORKER_CREATED"
  | "WORKER_PROVISIONING"
  | "WORKER_READY"
  | "JOB_ASSIGNED"
  | "JOB_STARTED"
  | "PROGRESS_UPDATED"
  | "HEARTBEAT_RECORDED"
  | "HEARTBEAT_TIMEOUT"
  | "JOB_COMPLETED"
  | "JOB_FAILED"
  | "WORKER_TERMINATION_REQUESTED"
  | "WORKER_TERMINATED"
  | "WORKER_ERROR";

export interface JobTable {
  id: string;
  status: JobStatus;
  video_key: string;
  output_prefix: string;
  video_size: number;
  qualities: VideoQualityLevel[];
  worker_id: string | null;
  attempts: Generated<number>;
  max_attempts: Generated<number>;
  error_message: string | null;
  created_at: Generated<Date>;
  started_at: Date | null;
  completed_at: Date | null;
  failed_at: Date | null;
  updated_at: Generated<Date>;
}

export interface WorkerTable {
  id: string;
  provider: ProviderType;
  provider_worker_id: string;
  status: WorkerStatus;
  architecture: Architecture;
  cpu: number;
  memory_mb: number;
  storage_gb: Generated<number>;
  region: Generated<string>;
  job_id: string | null;
  metadata: JSONColumnType<
    Record<string, unknown>,
    Record<string, unknown> | string,
    Record<string, unknown> | string
  >;
  last_heartbeat_at: Date | null;
  created_at: Generated<Date>;
  started_at: Date | null;
  terminated_at: Date | null;
  updated_at: Generated<Date>;
}

export interface WorkerMonitoringTable {
  worker_id: string;
  next_check_at: Date;
  last_check_at: Date | null;
  estimated_duration_sec: number;
  progress_percent: Generated<number>;
  last_progress_at: Date | null;
  monitoring_attempts: Generated<number>;
  check_interval_sec: Generated<number>;
  updated_at: Generated<Date>;
}

export interface WorkerEventTable {
  id: string;
  worker_id: string | null;
  job_id: string | null;
  event: FleetEventType;
  metadata: JSONColumnType<
    Record<string, unknown>,
    Record<string, unknown> | string,
    Record<string, unknown> | string
  >;
  created_at: Generated<Date>;
}

export interface FleetTables {
  jobs: JobTable;
  workers: WorkerTable;
  worker_monitoring: WorkerMonitoringTable;
  worker_events: WorkerEventTable;
}
