import type {
  CloudDriver,
  FleetManagerConfig,
  NoWorkSignalPayload,
  WorkerHeartbeatPayload,
  WorkerRegistrationPayload,
} from "@veolms/fleet-types";
import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";

import type { QueueAdapter } from "../queues/types.ts";

export interface CoordinationContext {
  readonly database: Kysely<Database>;
  readonly driver: CloudDriver;
  readonly queueAdapter: QueueAdapter;
  readonly config: FleetManagerConfig;
  readonly managerApiUrl: string;
  readonly queueConnectionString: string;
}

export interface FleetStatusSummary {
  readonly provider?: string;
  readonly region?: string;
  readonly workerInstanceProfile?: string;
  readonly securityGroupId?: string;
  readonly tempBucket?: string;
  readonly prodBucket?: string;
  readonly totalWorkers: number;
  readonly runningWorkers: number;
  readonly idleWorkers: number;
  readonly nearCompleteWorkers: number;
  readonly activeJobsCount: number;
  readonly pendingChunksCount: number;
  readonly isDrained: boolean;
}

export interface CoordinationCycleResult {
  readonly cycleTimestamp: Date;
  readonly activeJobsProcessed: number;
  readonly workersLaunched: number;
  readonly workersDecommissioned: number;
  readonly deadWorkersFailed: number;
  readonly videosFinalized: number;
  readonly fleetStatus: FleetStatusSummary;
}

export type NoWorkDecision =
  | { readonly action: "KEEP"; readonly reason: string }
  | { readonly action: "TERMINATE"; readonly reason: string };
