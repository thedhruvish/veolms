import type { WorkerProviderType } from "@veolms/fleet-types";

export interface MediaWorkerConfig {
  readonly workerId: string;
  readonly instanceId: string;
  readonly provider: WorkerProviderType;
  readonly instanceType?: string;
  readonly managerApiUrl: string;
  readonly queueConnectionString: string;
  readonly storageDriver: "local" | "s3";
  readonly storageBasePath?: string;
  readonly scratchDir: string;
  readonly heartbeatIntervalMs: number;
  readonly concurrency: number;
  readonly defaultCrf: number;
  readonly ffmpegPreset: string;
  readonly hlsSegmentDurationSeconds: number;
}

export const DEFAULT_MEDIA_WORKER_CONFIG: Omit<
  MediaWorkerConfig,
  "workerId" | "instanceId" | "managerApiUrl" | "queueConnectionString"
> = {
  provider: "local_process",
  instanceType: "standard",
  storageDriver: "local",
  scratchDir: "/tmp/veolms-media-worker",
  heartbeatIntervalMs: 3000,
  concurrency: 1,
  defaultCrf: 22,
  ffmpegPreset: "veryfast",
  hlsSegmentDurationSeconds: 6,
};
