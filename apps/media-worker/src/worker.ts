import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import { claimNextQueuedJob, type Database } from "@veolms/database";
import type { FleetEventType } from "@veolms/fleet-types";
import type { MediaWorkerConfig } from "./config.ts";

export interface MediaWorkerContext {
  readonly workerId: string;
  readonly db: Kysely<Database>;
  readonly config: MediaWorkerConfig;
  stopHeartbeat: () => void;
  recordEvent: (
    event: FleetEventType,
    jobId?: string | null,
    metadata?: Readonly<Record<string, unknown>>,
  ) => Promise<void>;
}

export async function initMediaWorker(options: {
  config: MediaWorkerConfig;
  db: Kysely<Database>;
}): Promise<MediaWorkerContext> {
  const { config, db } = options;
  const workerId = config.WORKER_ID;

  // 1. Mark worker status as READY
  await db
    .updateTable("workers")
    .set({
      status: "READY",
      started_at: new Date(),
      last_heartbeat_at: new Date(),
      updated_at: new Date(),
    })
    .where("id", "=", workerId)
    .execute();

  const recordEvent = async (
    event: FleetEventType,
    jobId: string | null = config.JOB_ID ?? null,
    metadata: Readonly<Record<string, unknown>> = {},
  ): Promise<void> => {
    try {
      await db
        .insertInto("worker_events")
        .values({
          id: randomUUID(),
          worker_id: workerId,
          job_id: jobId,
          event,
          metadata: { ...metadata },
          created_at: new Date(),
        })
        .execute();
    } catch (err) {
      console.error(`Failed to record worker event ${event}:`, err);
    }
  };

  // Record WORKER_READY event
  await recordEvent("WORKER_READY", config.JOB_ID ?? null, {
    pid: process.pid,
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
  });

  // 2. Start recurring direct heartbeat loop
  let heartbeatInFlight = false;
  const heartbeatInterval = setInterval(async () => {
    if (heartbeatInFlight) {
      return;
    }
    heartbeatInFlight = true;
    try {
      await db
        .updateTable("workers")
        .set({
          last_heartbeat_at: new Date(),
          updated_at: new Date(),
        })
        .where("id", "=", workerId)
        .execute();
    } catch (err) {
      console.error(`Failed to write heartbeat for worker ${workerId}:`, err);
    } finally {
      heartbeatInFlight = false;
    }
  }, config.HEARTBEAT_INTERVAL_MS);

  // Do not hold Node event loop open solely for heartbeat
  heartbeatInterval.unref();

  const stopHeartbeat = () => {
    clearInterval(heartbeatInterval);
  };

  return {
    workerId,
    db,
    config,
    stopHeartbeat,
    recordEvent,
  };
}

/**
 * Looks for the next job to keep this already-booted worker busy instead
 * of it terminating after a single job. Checks once immediately; if the
 * queue is empty, waits WORKER_IDLE_POLL_SECONDS and checks exactly once
 * more before giving up — a single grace retry, not indefinite polling, so
 * an idle worker costs at most one extra wait cycle before it self-
 * terminates (via the existing UserData shutdown path once this process
 * exits).
 */
export async function pollForNextJob(
  ctx: MediaWorkerContext,
  signal?: AbortSignal,
): Promise<string | null> {
  if (signal?.aborted) {
    return null;
  }

  const claimed = await claimNextQueuedJob(ctx.db, ctx.workerId);
  if (claimed) {
    return claimed.id;
  }

  console.info(
    `[media-worker] Queue empty — waiting ${ctx.config.WORKER_IDLE_POLL_SECONDS}s for one more check before shutting down...`,
  );
  await new Promise<void>((resolve) => {
    const finish = () => {
      signal?.removeEventListener("abort", abortWait);
      resolve();
    };
    const timeout = setTimeout(finish, ctx.config.WORKER_IDLE_POLL_SECONDS * 1000);
    const abortWait = () => {
      clearTimeout(timeout);
      finish();
    };
    signal?.addEventListener("abort", abortWait, { once: true });
  });

  if (signal?.aborted) {
    return null;
  }

  const claimedAfterWait = await claimNextQueuedJob(ctx.db, ctx.workerId);
  return claimedAfterWait?.id ?? null;
}
