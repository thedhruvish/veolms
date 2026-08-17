import type { VideoChunkStatus } from "@veolms/fleet-types";
import { sql, type Kysely } from "kysely";

import type { Database } from "../schema.ts";

export interface CreateVideoChunkInput {
  readonly id: string;
  readonly videoId: string;
  readonly chunkIndex: number;
  readonly startSeconds: number;
  readonly durationSeconds: number;
  readonly sourceKey: string;
}

export interface VideoChunkRecord {
  readonly id: string;
  readonly videoId: string;
  readonly chunkIndex: number;
  readonly startSeconds: number;
  readonly durationSeconds: number;
  readonly sourceKey: string;
  readonly status: VideoChunkStatus;
  readonly workerId?: string | null;
  readonly outputKey?: string | null;
  readonly retryCount: number;
  readonly error?: string | null;
  readonly startedAt?: Date | null;
  readonly completedAt?: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

function mapRowToChunkRecord(row: {
  id: string;
  video_id: string;
  chunk_index: number;
  start_seconds: number | string;
  duration_seconds: number | string;
  source_key: string;
  status: string;
  worker_id: string | null;
  output_key: string | null;
  retry_count: number;
  error: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}): VideoChunkRecord {
  return {
    id: row.id,
    videoId: row.video_id,
    chunkIndex: row.chunk_index,
    startSeconds: Number(row.start_seconds),
    durationSeconds: Number(row.duration_seconds),
    sourceKey: row.source_key,
    status: row.status as VideoChunkStatus,
    workerId: row.worker_id,
    outputKey: row.output_key,
    retryCount: row.retry_count,
    error: row.error,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createVideoChunksBatch(
  database: Kysely<Database>,
  chunks: readonly CreateVideoChunkInput[],
): Promise<readonly VideoChunkRecord[]> {
  if (chunks.length === 0) {
    return [];
  }

  const rows = await database
    .insertInto("video_chunks")
    .values(
      chunks.map((chunk) => ({
        id: chunk.id,
        video_id: chunk.videoId,
        chunk_index: chunk.chunkIndex,
        start_seconds: chunk.startSeconds,
        duration_seconds: chunk.durationSeconds,
        source_key: chunk.sourceKey,
        status: "PENDING",
        worker_id: null,
        output_key: null,
        retry_count: 0,
        error: null,
        started_at: null,
        completed_at: null,
      })),
    )
    .returningAll()
    .execute();

  return rows.map(mapRowToChunkRecord);
}

export async function findChunkById(
  database: Kysely<Database>,
  id: string,
): Promise<VideoChunkRecord | undefined> {
  const row = await database
    .selectFrom("video_chunks")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();

  if (!row) {
    return undefined;
  }

  return mapRowToChunkRecord(row);
}

export async function listChunksForVideo(
  database: Kysely<Database>,
  videoId: string,
): Promise<readonly VideoChunkRecord[]> {
  const rows = await database
    .selectFrom("video_chunks")
    .selectAll()
    .where("video_id", "=", videoId)
    .orderBy("chunk_index", "asc")
    .execute();

  return rows.map(mapRowToChunkRecord);
}

export async function claimChunkForWorker(
  database: Kysely<Database>,
  chunkId: string,
  workerId: string,
): Promise<VideoChunkRecord | undefined> {
  const row = await database
    .updateTable("video_chunks")
    .set({
      status: "PROCESSING",
      worker_id: workerId,
      started_at: sql<Date>`COALESCE(started_at, CURRENT_TIMESTAMP)`,
      updated_at: sql<Date>`CURRENT_TIMESTAMP`,
    })
    .where("id", "=", chunkId)
    .returningAll()
    .executeTakeFirst();

  if (!row) {
    return undefined;
  }

  return mapRowToChunkRecord(row);
}

export async function completeChunk(
  database: Kysely<Database>,
  chunkId: string,
  outputKey?: string,
): Promise<VideoChunkRecord> {
  const row = await database
    .updateTable("video_chunks")
    .set({
      status: "COMPLETED",
      output_key: outputKey ?? undefined,
      completed_at: sql<Date>`CURRENT_TIMESTAMP`,
      updated_at: sql<Date>`CURRENT_TIMESTAMP`,
    })
    .where("id", "=", chunkId)
    .returningAll()
    .executeTakeFirstOrThrow();

  return mapRowToChunkRecord(row);
}

export async function failChunk(
  database: Kysely<Database>,
  chunkId: string,
  error: string,
): Promise<VideoChunkRecord> {
  const row = await database
    .updateTable("video_chunks")
    .set({
      status: "FAILED",
      error,
      retry_count: sql<number>`retry_count + 1`,
      worker_id: null,
      updated_at: sql<Date>`CURRENT_TIMESTAMP`,
    })
    .where("id", "=", chunkId)
    .returningAll()
    .executeTakeFirstOrThrow();

  return mapRowToChunkRecord(row);
}

export async function getCompletedChunksCountForVideo(
  database: Kysely<Database>,
  videoId: string,
): Promise<number> {
  const result = await database
    .selectFrom("video_chunks")
    .select(database.fn.count("id").as("count"))
    .where("video_id", "=", videoId)
    .where("status", "=", "COMPLETED")
    .executeTakeFirst();

  return Number(result?.count ?? 0);
}
