import { z } from "zod";

export const FLEET_EVENT_TYPES = [
  "WORKER_CREATED",
  "WORKER_PROVISIONING",
  "WORKER_READY",
  "JOB_ASSIGNED",
  "JOB_STARTED",
  "PROGRESS_UPDATED",
  "HEARTBEAT_RECORDED",
  "HEARTBEAT_TIMEOUT",
  "JOB_COMPLETED",
  "JOB_FAILED",
  "WORKER_TERMINATION_REQUESTED",
  "WORKER_TERMINATED",
  "WORKER_ERROR",
] as const;

export type FleetEventType = (typeof FLEET_EVENT_TYPES)[number];
export const fleetEventTypeSchema = z.enum(FLEET_EVENT_TYPES);

export interface FleetEvent {
  id: string;
  workerId: string | null;
  jobId: string | null;
  event: FleetEventType;
  metadata: Readonly<Record<string, unknown>>;
  createdAt: Date;
}
