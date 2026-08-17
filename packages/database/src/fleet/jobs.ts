import type { VideoJobStatus, VideoQuality } from "@veolms/fleet-types";
import { sql, type Kysely, type RawBuilder } from "kysely";

import type { Database } from "../schema.ts";

export interface CreateVideoJobInput {
  readonly id: string;
  readonly sourceKey: string;
  readonly durationSeconds: number;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly sourceFps: number;
  readonly sourceCodec: string;
  readonly requestedQualities: readonly VideoQuality[];
  readonly qualityComplexity: number;
  readonly sourceComplexity: number;
  readonly chunkDurationSeconds: number;
  readonly chunkCount: number;
  readonly requiredWorkers: number;
}

export interface VideoJobRecord {
  readonly id: string;
  readonly status: VideoJobStatus;
  readonly sourceKey: string;
  readonly durationSeconds: number;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly sourceFps: number;
  readonly sourceCodec: string;
  readonly requestedQualities: readonly VideoQuality[];
  readonly qualityComplexity: number;
  readonly sourceComplexity: number;
  readonly chunkDurationSeconds: number;
  readonly chunkCount: number;
  readonly requiredWorkers: number;
  readonly activeWorkers: number;
  readonly completedChunks: number;
  readonly outputManifestKey?: string | null;
  readonly error?: string | null;
  readonly startedAt?: Date | null;
  readonly completedAt?: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

function mapRowToJobRecord(row: {
  id: string;
  status: string;
  source_key: string;
  duration_seconds: number | string;
  source_width: number;
  source_height: number;
  source_fps: number | string;
  source_codec: string;
  requested_qualities: string;
  quality_complexity: number | string;
  source_complexity: number | string;
  chunk_duration_seconds: number;
  chunk_count: number;
  required_workers: number;
  active_workers: number;
  completed_chunks: number;
  output_manifest_key: string | null;
  error: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}): VideoJobRecord {
  let parsedQualities: readonly VideoQuality[] = [];
  try {
    parsedQualities = JSON.parse(
      row.requested_qualities,
    ) as readonly VideoQuality[];
  } catch {
    parsedQualities = [];
  }

  return {
    id: row.id,
    status: row.status as VideoJobStatus,
    sourceKey: row.source_key,
    durationSeconds: Number(row.duration_seconds),
    sourceWidth: row.source_width,
    sourceHeight: row.source_height,
    sourceFps: Number(row.source_fps),
    sourceCodec: row.source_codec,
    requestedQualities: parsedQualities,
    qualityComplexity: Number(row.quality_complexity),
    sourceComplexity: Number(row.source_complexity),
    chunkDurationSeconds: row.chunk_duration_seconds,
    chunkCount: row.chunk_count,
    requiredWorkers: row.required_workers,
    activeWorkers: row.active_workers,
    completedChunks: row.completed_chunks,
    outputManifestKey: row.output_manifest_key,
    error: row.error,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createVideoJob(
  database: Kysely<Database>,
  input: CreateVideoJobInput,
): Promise<VideoJobRecord> {
  const row = await database
    .insertInto("video_jobs")
    .values({
      id: input.id,
      status: "PENDING",
      source_key: input.sourceKey,
      duration_seconds: input.durationSeconds,
      source_width: input.sourceWidth,
      source_height: input.sourceHeight,
      source_fps: input.sourceFps,
      source_codec: input.sourceCodec,
      requested_qualities: JSON.stringify(input.requestedQualities),
      quality_complexity: input.qualityComplexity,
      source_complexity: input.sourceComplexity,
      chunk_duration_seconds: input.chunkDurationSeconds,
      chunk_count: input.chunkCount,
      required_workers: input.requiredWorkers,
      active_workers: 0,
      completed_chunks: 0,
      output_manifest_key: null,
      error: null,
      started_at: null,
      completed_at: null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  return mapRowToJobRecord(row);
}

export async function findVideoJobById(
  database: Kysely<Database>,
  id: string,
): Promise<VideoJobRecord | undefined> {
  const row = await database
    .selectFrom("video_jobs")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();

  if (!row) {
    return undefined;
  }

  return mapRowToJobRecord(row);
}

export async function listActiveVideoJobs(
  database: Kysely<Database>,
): Promise<readonly VideoJobRecord[]> {
  const rows = await database
    .selectFrom("video_jobs")
    .selectAll()
    .where("status", "in", ["PENDING", "SPLITTING", "ENCODING", "FINALIZING"])
    .orderBy("created_at", "asc")
    .execute();

  return rows.map(mapRowToJobRecord);
}

export async function updateVideoJobStatus(
  database: Kysely<Database>,
  id: string,
  status: VideoJobStatus,
  options?: {
    readonly outputManifestKey?: string;
    readonly error?: string;
  },
): Promise<void> {
  let startedAtUpdate: RawBuilder<Date | null> | undefined = undefined;
  let completedAtUpdate: RawBuilder<Date | null> | undefined = undefined;

  if (status === "SPLITTING" || status === "ENCODING") {
    startedAtUpdate = sql<Date>`COALESCE(started_at, CURRENT_TIMESTAMP)`;
  }
  if (status === "COMPLETED" || status === "FAILED") {
    completedAtUpdate = sql<Date>`CURRENT_TIMESTAMP`;
  }

  await database
    .updateTable("video_jobs")
    .set({
      status,
      output_manifest_key: options?.outputManifestKey ?? undefined,
      error: options?.error ?? undefined,
      started_at: startedAtUpdate,
      completed_at: completedAtUpdate,
      updated_at: sql<Date>`CURRENT_TIMESTAMP`,
    })
    .where("id", "=", id)
    .execute();
}

export async function incrementVideoJobCompletedChunks(
  database: Kysely<Database>,
  id: string,
): Promise<{ readonly completedChunks: number; readonly chunkCount: number }> {
  const row = await database
    .updateTable("video_jobs")
    .set({
      completed_chunks: sql<number>`completed_chunks + 1`,
      updated_at: sql<Date>`CURRENT_TIMESTAMP`,
    })
    .where("id", "=", id)
    .returning(["completed_chunks", "chunk_count"])
    .executeTakeFirstOrThrow();

  return {
    completedChunks: row.completed_chunks,
    chunkCount: row.chunk_count,
  };
}

export async function updateVideoJobActiveWorkers(
  database: Kysely<Database>,
  id: string,
  activeWorkers: number,
): Promise<void> {
  await database
    .updateTable("video_jobs")
    .set({
      active_workers: activeWorkers,
      updated_at: sql<Date>`CURRENT_TIMESTAMP`,
    })
    .where("id", "=", id)
    .execute();
}
