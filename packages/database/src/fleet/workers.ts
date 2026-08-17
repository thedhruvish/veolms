import type {
  WorkerHeartbeatPayload,
  WorkerRecord,
  WorkerState,
} from "@veolms/fleet-types";
import { sql, type Kysely, type RawBuilder } from "kysely";

import type { Database } from "../schema.ts";

export interface RegisterWorkerInput {
  readonly id: string;
  readonly instanceId: string;
  readonly provider: string;
  readonly instanceType: string;
}

export interface RecordHeartbeatInput extends WorkerHeartbeatPayload {
  readonly heartbeatId: string;
}

function mapRowToWorkerRecord(row: {
  id: string;
  instance_id: string;
  provider: string;
  instance_type: string;
  state: string;
  current_job_id: string | null;
  current_video_id: string | null;
  current_chunk_id: string | null;
  progress_percent: number | string;
  estimated_remaining_seconds: number | string | null;
  fps: number | string | null;
  last_heartbeat_at: Date | null;
  idle_since: Date | null;
  started_at: Date;
  terminated_at: Date | null;
}): WorkerRecord {
  return {
    id: row.id,
    instanceId: row.instance_id,
    provider: row.provider,
    instanceType: row.instance_type,
    state: row.state as WorkerState,
    currentJobId: row.current_job_id,
    currentVideoId: row.current_video_id,
    currentChunkId: row.current_chunk_id,
    progressPercent: Number(row.progress_percent),
    estimatedRemainingSeconds:
      row.estimated_remaining_seconds !== null
        ? Number(row.estimated_remaining_seconds)
        : null,
    fps: row.fps !== null ? Number(row.fps) : null,
    lastHeartbeatAt: row.last_heartbeat_at,
    idleSince: row.idle_since,
    startedAt: row.started_at,
    terminatedAt: row.terminated_at,
  };
}

export async function registerWorker(
  database: Kysely<Database>,
  input: RegisterWorkerInput,
): Promise<WorkerRecord> {
  const row = await database
    .insertInto("workers")
    .values({
      id: input.id,
      instance_id: input.instanceId,
      provider: input.provider,
      instance_type: input.instanceType,
      state: "REGISTERING",
      current_job_id: null,
      current_video_id: null,
      current_chunk_id: null,
      progress_percent: 0,
      estimated_remaining_seconds: null,
      fps: null,
      last_heartbeat_at: sql<Date>`CURRENT_TIMESTAMP`,
      idle_since: sql<Date>`CURRENT_TIMESTAMP`,
      started_at: sql<Date>`CURRENT_TIMESTAMP`,
      terminated_at: null,
    })
    .onConflict((oc) =>
      oc.column("instance_id").doUpdateSet({
        state: "REGISTERING",
        last_heartbeat_at: sql<Date>`CURRENT_TIMESTAMP`,
        updated_at: sql<Date>`CURRENT_TIMESTAMP`,
      }),
    )
    .returningAll()
    .executeTakeFirstOrThrow();

  return mapRowToWorkerRecord(row);
}

export async function findWorkerById(
  database: Kysely<Database>,
  id: string,
): Promise<WorkerRecord | undefined> {
  const row = await database
    .selectFrom("workers")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();

  if (!row) {
    return undefined;
  }

  return mapRowToWorkerRecord(row);
}

export async function findWorkerByInstanceId(
  database: Kysely<Database>,
  instanceId: string,
): Promise<WorkerRecord | undefined> {
  const row = await database
    .selectFrom("workers")
    .selectAll()
    .where("instance_id", "=", instanceId)
    .executeTakeFirst();

  if (!row) {
    return undefined;
  }

  return mapRowToWorkerRecord(row);
}

export async function recordWorkerHeartbeat(
  database: Kysely<Database>,
  input: RecordHeartbeatInput,
): Promise<void> {
  await database.transaction().execute(async (trx) => {
    // 1. Insert heartbeat history record
    await trx
      .insertInto("worker_heartbeats")
      .values({
        id: input.heartbeatId,
        worker_id: input.workerId,
        job_id: input.jobId ?? null,
        video_id: input.videoId ?? null,
        chunk_id: input.chunkId ?? null,
        progress_percent: input.progressPercent,
        fps: input.fps ?? null,
        frames: input.framesProcessed ?? null,
        estimated_remaining_seconds: input.estimatedRemainingSeconds ?? null,
        cpu_usage: input.metrics?.cpuUsagePercent ?? null,
        memory_usage: input.metrics?.memoryUsageMb ?? null,
      })
      .execute();

    // 2. Update worker table snapshot
    const idleSinceUpdate: RawBuilder<Date | null> | null =
      input.state === "IDLE"
        ? sql<Date>`COALESCE(idle_since, CURRENT_TIMESTAMP)`
        : null;

    await trx
      .updateTable("workers")
      .set({
        state: input.state,
        current_job_id: input.jobId ?? null,
        current_video_id: input.videoId ?? null,
        current_chunk_id: input.chunkId ?? null,
        progress_percent: input.progressPercent,
        fps: input.fps ?? null,
        estimated_remaining_seconds: input.estimatedRemainingSeconds ?? null,
        last_heartbeat_at: sql<Date>`CURRENT_TIMESTAMP`,
        idle_since: idleSinceUpdate,
        updated_at: sql<Date>`CURRENT_TIMESTAMP`,
      })
      .where("id", "=", input.workerId)
      .execute();
  });
}

export async function updateWorkerState(
  database: Kysely<Database>,
  workerId: string,
  state: WorkerState,
  options?: {
    readonly currentJobId?: string | null;
    readonly currentVideoId?: string | null;
    readonly currentChunkId?: string | null;
  },
): Promise<void> {
  let idleSinceUpdate: RawBuilder<Date | null> | null | undefined = undefined;
  if (state === "IDLE") {
    idleSinceUpdate = sql<Date>`COALESCE(idle_since, CURRENT_TIMESTAMP)`;
  } else if (state === "PROCESSING" || state === "UPLOADING") {
    idleSinceUpdate = null;
  }

  let terminatedAtUpdate: RawBuilder<Date | null> | undefined = undefined;
  if (state === "TERMINATED") {
    terminatedAtUpdate = sql<Date>`CURRENT_TIMESTAMP`;
  }

  await database
    .updateTable("workers")
    .set({
      state,
      current_job_id:
        options?.currentJobId !== undefined ? options.currentJobId : undefined,
      current_video_id:
        options?.currentVideoId !== undefined
          ? options.currentVideoId
          : undefined,
      current_chunk_id:
        options?.currentChunkId !== undefined
          ? options.currentChunkId
          : undefined,
      idle_since: idleSinceUpdate,
      terminated_at: terminatedAtUpdate,
      updated_at: sql<Date>`CURRENT_TIMESTAMP`,
    })
    .where("id", "=", workerId)
    .execute();
}

export async function listActiveWorkers(
  database: Kysely<Database>,
): Promise<readonly WorkerRecord[]> {
  const rows = await database
    .selectFrom("workers")
    .selectAll()
    .where("state", "not in", ["TERMINATED", "FAILED"])
    .orderBy("started_at", "asc")
    .execute();

  return rows.map(mapRowToWorkerRecord);
}

export async function getReusableCapacity(
  database: Kysely<Database>,
  reuseProgressThreshold = 85,
): Promise<{
  readonly runningWorkers: number;
  readonly idleWorkers: number;
  readonly nearCompleteWorkers: number;
  readonly reusableWorkers: number;
}> {
  const activeWorkers = await database
    .selectFrom("workers")
    .select(["id", "state", "progress_percent"])
    .where("state", "not in", ["TERMINATED", "FAILED", "STOPPING"])
    .execute();

  let idleCount = 0;
  let nearCompleteCount = 0;

  for (const worker of activeWorkers) {
    if (worker.state === "IDLE" || worker.state === "REGISTERING") {
      idleCount += 1;
    } else if (
      (worker.state === "PROCESSING" || worker.state === "UPLOADING") &&
      Number(worker.progress_percent) >= reuseProgressThreshold
    ) {
      nearCompleteCount += 1;
    }
  }

  return {
    runningWorkers: activeWorkers.length,
    idleWorkers: idleCount,
    nearCompleteWorkers: nearCompleteCount,
    reusableWorkers: idleCount + nearCompleteCount,
  };
}

export async function findExpiredWorkers(
  database: Kysely<Database>,
  heartbeatTimeoutSeconds = 45,
): Promise<readonly WorkerRecord[]> {
  const rows = await database
    .selectFrom("workers")
    .selectAll()
    .where("state", "not in", ["TERMINATED", "FAILED", "STOPPING"])
    .where(
      "last_heartbeat_at",
      "<",
      sql<Date>`CURRENT_TIMESTAMP - (${heartbeatTimeoutSeconds} * INTERVAL '1 second')`,
    )
    .execute();

  return rows.map(mapRowToWorkerRecord);
}

export async function findIdleWorkersPastTimeout(
  database: Kysely<Database>,
  idleTimeoutSeconds = 300,
): Promise<readonly WorkerRecord[]> {
  const rows = await database
    .selectFrom("workers")
    .selectAll()
    .where("state", "=", "IDLE")
    .where(
      "idle_since",
      "<",
      sql<Date>`CURRENT_TIMESTAMP - (${idleTimeoutSeconds} * INTERVAL '1 second')`,
    )
    .execute();

  return rows.map(mapRowToWorkerRecord);
}
