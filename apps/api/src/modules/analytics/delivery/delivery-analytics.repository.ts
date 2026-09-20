import { sql } from "kysely";
import type { DatabaseExecutor as Executor } from "@veolms/database";
import type { DataDeliveryAssetTypeFilter } from "@veolms/contracts";
import {
  buildCourseMediaCte,
  buildAssetTypeSqlFilter,
} from "../analytics.shared.ts";

export interface CourseDeliveryRow {
  courseId: string;
  courseTitle: string;
  courseSlug: string;
  thumbnailUrl: string | null;
  videoBytes: string | number;
  imageBytes: string | number;
  resourceBytes: string | number;
  totalBytes: string | number;
  activeLearnersCount: string | number;
}

export interface TopBandwidthItemRow {
  contentId: string;
  title: string;
  type: string;
  courseId: string | null;
  courseTitle: string | null;
  sizeBytes: string | number;
  storageKey: string;
  metadata: unknown;
  updatedAt: Date | string | null;
  requestsCount?: string | number;
  uniqueUsersCount?: string | number;
}

export interface OverallDeliveryTotals {
  totalBytes: number;
  videoBytes: number;
  imageBytes: number;
  resourceBytes: number;
  audioBytes: number;
  hlsBytes: number;
  streamSegmentBytes: number;
  encryptedMediaBytes: number;
  otherBytes: number;
  totalAssetsCount: number;
}

/**
 * Lists delivery volume aggregated by course, joined with active learner count.
 */
export async function listDeliveryByCourse(
  database: Executor,
  targetCourseId?: string,
): Promise<CourseDeliveryRow[]> {
  const courseFilter =
    targetCourseId && targetCourseId !== "all"
      ? sql`AND c.id = ${targetCourseId}`
      : sql``;

  const result = await sql<CourseDeliveryRow>`
    WITH course_media AS (
      ${buildCourseMediaCte(targetCourseId)}
    ),
    active_learners AS (
      SELECT
        e.course_id,
        COUNT(DISTINCT e.user_id) as learner_count
      FROM enrollments e
      WHERE e.status = 'active'
      GROUP BY e.course_id
    )
    SELECT
      c.id as "courseId",
      c.title as "courseTitle",
      c.slug as "courseSlug",
      c.thumbnail_url as "thumbnailUrl",
      COALESCE(SUM(CASE WHEN m.type LIKE '%video%' OR m.mime_type LIKE 'video/%' OR m.original_filename ILIKE '%.m3u8' OR m.storage_key ILIKE '%.m3u8' OR m.original_filename ILIKE '%.ts' OR m.storage_key ILIKE '%.ts' OR m.mime_type ILIKE '%mpegurl%' THEN CAST(m.size_bytes AS BIGINT) ELSE 0 END), 0) as "videoBytes",
      COALESCE(SUM(CASE WHEN m.type LIKE '%image%' OR m.mime_type LIKE 'image/%' THEN CAST(m.size_bytes AS BIGINT) ELSE 0 END), 0) as "imageBytes",
      COALESCE(SUM(CASE WHEN m.type NOT LIKE '%video%' AND m.type NOT LIKE '%image%' AND m.mime_type NOT LIKE 'video/%' AND m.mime_type NOT LIKE 'image/%' AND m.original_filename NOT ILIKE '%.m3u8' AND m.storage_key NOT ILIKE '%.m3u8' AND m.original_filename NOT ILIKE '%.ts' AND m.storage_key NOT ILIKE '%.ts' THEN CAST(m.size_bytes AS BIGINT) ELSE 0 END), 0) as "resourceBytes",
      COALESCE(SUM(CAST(m.size_bytes AS BIGINT)), 0) as "totalBytes",
      COALESCE(al.learner_count, 1) as "activeLearnersCount"
    FROM courses c
    LEFT JOIN course_media cm ON cm.course_id = c.id
    LEFT JOIN media_assets m ON m.id = cm.media_id
    LEFT JOIN active_learners al ON al.course_id = c.id
    WHERE c.deleted_at IS NULL ${courseFilter}
    GROUP BY c.id, c.title, c.slug, c.thumbnail_url, al.learner_count
    ORDER BY "totalBytes" DESC
  `.execute(database);

  return result.rows;
}

/**
 * Lists the top bandwidth-consuming content items across media assets.
 */
export async function listTopBandwidthContent(
  database: Executor,
  limit = 10,
  targetCourseId?: string,
  targetAssetType?: DataDeliveryAssetTypeFilter,
): Promise<TopBandwidthItemRow[]> {
  const courseFilter =
    targetCourseId && targetCourseId !== "all"
      ? sql`AND cm.course_id = ${targetCourseId}`
      : sql``;

  const assetTypeFilter = buildAssetTypeSqlFilter(targetAssetType, "m");

  const result = await sql<TopBandwidthItemRow>`
    WITH course_media AS (
      ${buildCourseMediaCte(targetCourseId)}
    )
    SELECT
      m.id as "contentId",
      COALESCE(cm.asset_context, m.original_filename) as "title",
      m.type as "type",
      cm.course_id as "courseId",
      cm.course_title as "courseTitle",
      m.size_bytes as "sizeBytes",
      m.storage_key as "storageKey",
      m.metadata as "metadata",
      m.updated_at as "updatedAt",
      COALESCE(COUNT(lp.id), 0) as "requestsCount",
      COALESCE(COUNT(DISTINCT COALESCE(lp.user_id, en.user_id)), 0) as "uniqueUsersCount"
    FROM media_assets m
    LEFT JOIN course_media cm ON cm.media_id = m.id
    LEFT JOIN learning_progress lp ON lp.lesson_id = cm.lesson_id
    LEFT JOIN enrollments en ON en.course_id = cm.course_id AND en.status = 'active'
    WHERE m.status = 'ready'
    ${courseFilter}
    ${assetTypeFilter}
    GROUP BY m.id, cm.asset_context, m.original_filename, m.type, cm.course_id, cm.course_title, m.size_bytes, m.storage_key, m.metadata, m.updated_at
    ORDER BY CAST(m.size_bytes AS BIGINT) DESC
    LIMIT ${limit}
  `.execute(database);

  return result.rows;
}

/**
 * Computes overall totals and distribution by media type.
 */
export async function getOverallDeliveryTotals(
  database: Executor,
  targetCourseId?: string,
): Promise<OverallDeliveryTotals> {
  const courseFilter =
    targetCourseId && targetCourseId !== "all"
      ? sql`AND cm.course_id = ${targetCourseId}`
      : sql``;

  const result = await sql<{
    totalBytes: string | number;
    videoBytes: string | number;
    imageBytes: string | number;
    resourceBytes: string | number;
    audioBytes: string | number;
    hlsBytes: string | number;
    streamSegmentBytes: string | number;
    encryptedMediaBytes: string | number;
    otherBytes: string | number;
    totalAssetsCount: string | number;
  }>`
    WITH course_media AS (
      ${buildCourseMediaCte(targetCourseId)}
    )
    SELECT
      COALESCE(SUM(CAST(m.size_bytes AS BIGINT)), 0) as "totalBytes",
      COALESCE(SUM(CASE WHEN (m.type LIKE '%video%' OR m.mime_type LIKE 'video/%') AND NOT (m.original_filename ILIKE '%.ts' OR m.original_filename ILIKE '%.m3u8' OR m.original_filename ILIKE '%.mpd' OR m.storage_key ILIKE '%.m3u8' OR m.storage_key ILIKE '%.ts') THEN CAST(m.size_bytes AS BIGINT) ELSE 0 END), 0) as "videoBytes",
      COALESCE(SUM(CASE WHEN m.type LIKE '%image%' OR m.mime_type LIKE 'image/%' THEN CAST(m.size_bytes AS BIGINT) ELSE 0 END), 0) as "imageBytes",
      COALESCE(SUM(CASE WHEN m.type LIKE '%pdf%' OR m.type LIKE '%doc%' OR m.type LIKE '%text%' OR m.type LIKE '%zip%' OR m.type LIKE '%resource%' THEN CAST(m.size_bytes AS BIGINT) ELSE 0 END), 0) as "resourceBytes",
      COALESCE(SUM(CASE WHEN m.type LIKE '%audio%' OR m.mime_type LIKE 'audio/%' THEN CAST(m.size_bytes AS BIGINT) ELSE 0 END), 0) as "audioBytes",
      COALESCE(SUM(CASE WHEN m.original_filename ILIKE '%.m3u8' OR m.storage_key ILIKE '%.m3u8' OR m.mime_type ILIKE '%mpegurl%' THEN CAST(m.size_bytes AS BIGINT) ELSE 0 END), 0) as "hlsBytes",
      COALESCE(SUM(CASE WHEN m.original_filename ILIKE '%.ts' OR m.original_filename ILIKE '%.m4u' OR m.original_filename ILIKE '%.m4s' OR m.storage_key ILIKE '%.ts' OR m.mime_type ILIKE '%mp2t%' OR m.mime_type ILIKE '%iso.segment%' THEN CAST(m.size_bytes AS BIGINT) ELSE 0 END), 0) as "streamSegmentBytes",
      COALESCE(SUM(CASE WHEN m.original_filename ILIKE '%.key' OR m.original_filename ILIKE '%.enc' OR m.original_filename ILIKE '%.bin' OR m.type ILIKE '%encrypt%' THEN CAST(m.size_bytes AS BIGINT) ELSE 0 END), 0) as "encryptedMediaBytes",
      COALESCE(SUM(CASE WHEN m.type NOT LIKE '%video%' AND m.type NOT LIKE '%image%' AND m.type NOT LIKE '%audio%' AND m.type NOT LIKE '%pdf%' AND m.type NOT LIKE '%doc%' AND m.type NOT LIKE '%text%' AND m.type NOT LIKE '%zip%' AND m.type NOT LIKE '%resource%' AND NOT (m.original_filename ILIKE '%.m3u8' OR m.storage_key ILIKE '%.m3u8' OR m.original_filename ILIKE '%.ts' OR m.storage_key ILIKE '%.ts') THEN CAST(m.size_bytes AS BIGINT) ELSE 0 END), 0) as "otherBytes",
      COUNT(m.id) as "totalAssetsCount"
    FROM media_assets m
    LEFT JOIN course_media cm ON cm.media_id = m.id
    WHERE m.status = 'ready' ${courseFilter}
  `.execute(database);

  const row = result.rows[0];
  return {
    totalBytes: Number(row?.totalBytes ?? 0),
    videoBytes: Number(row?.videoBytes ?? 0),
    imageBytes: Number(row?.imageBytes ?? 0),
    resourceBytes: Number(row?.resourceBytes ?? 0),
    audioBytes: Number(row?.audioBytes ?? 0),
    hlsBytes: Number(row?.hlsBytes ?? 0),
    streamSegmentBytes: Number(row?.streamSegmentBytes ?? 0),
    encryptedMediaBytes: Number(row?.encryptedMediaBytes ?? 0),
    otherBytes: Number(row?.otherBytes ?? 0),
    totalAssetsCount: Number(row?.totalAssetsCount ?? 0),
  };
}

/**
 * Returns the count of active learners across courses.
 */
export async function getActiveLearnersCount(
  database: Executor,
  targetCourseId?: string,
): Promise<number> {
  const courseFilter =
    targetCourseId && targetCourseId !== "all"
      ? sql`AND e.course_id = ${targetCourseId}`
      : sql``;

  const result = await sql<{ count: string | number }>`
    SELECT COUNT(DISTINCT e.user_id) as count
    FROM enrollments e
    WHERE e.status = 'active' ${courseFilter}
  `.execute(database);

  const count = Number(result.rows[0]?.count ?? 0);
  return Math.max(1, count);
}
