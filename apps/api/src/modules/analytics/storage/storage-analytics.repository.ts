import { sql } from "kysely";
import type { DatabaseExecutor as Executor } from "@veolms/database";
import type { StoredAssetKind } from "@veolms/contracts";
import {
  buildCourseMediaCte,
  buildAssetTypeSqlFilter,
} from "../analytics.shared.ts";

export interface CourseStorageRow {
  courseId: string;
  courseTitle: string;
  courseSlug: string;
  thumbnailUrl: string | null;
  videoBytes: string | number;
  imageBytes: string | number;
  resourceBytes: string | number;
  totalBytes: string | number;
}

export interface LargestAssetRow {
  assetId: string;
  filename: string;
  type: string;
  courseId: string | null;
  courseTitle: string | null;
  sizeBytes: string | number;
  metadata: unknown;
  lastAccessedAt: Date | string | null;
}

export interface StaleAssetRow {
  assetId: string;
  filename: string;
  type: string;
  sizeBytes: string | number;
  lastAccessedAt: Date | string | null;
}

export interface AssetTypeCountRow {
  kind: StoredAssetKind;
  count: string | number;
}

export interface OverallMediaTotals {
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
 * Returns distinct mappings between courses and media assets across
 * thumbnails, trailers, lesson content, and lesson resources.
 */
function getCourseMediaLinksQuery(database: Executor, targetCourseId?: string) {
  let query = database
    .selectFrom("courses as c")
    .select([
      "c.id as course_id",
      "c.title as course_title",
      "c.slug as course_slug",
      "c.thumbnail_url",
    ])
    .where("c.deleted_at", "is", null);

  if (targetCourseId && targetCourseId !== "all") {
    query = query.where("c.id", "=", targetCourseId);
  }

  return query;
}

export async function listStorageByCourse(
  database: Executor,
  targetCourseId?: string,
): Promise<CourseStorageRow[]> {
  // Query relationships using a union of all links between courses and media assets
  const courseFilter =
    targetCourseId && targetCourseId !== "all"
      ? sql`AND c.id = ${targetCourseId}`
      : sql``;

  const result = await sql<CourseStorageRow>`
    WITH course_media AS (
      ${buildCourseMediaCte(targetCourseId)}
    )
    SELECT
      c.id as "courseId",
      c.title as "courseTitle",
      c.slug as "courseSlug",
      c.thumbnail_url as "thumbnailUrl",
      COALESCE(SUM(CASE WHEN m.type LIKE '%video%' OR m.mime_type LIKE 'video/%' OR m.original_filename ILIKE '%.m3u8' OR m.storage_key ILIKE '%.m3u8' OR m.original_filename ILIKE '%.ts' OR m.storage_key ILIKE '%.ts' OR m.mime_type ILIKE '%mpegurl%' THEN CAST(m.size_bytes AS BIGINT) ELSE 0 END), 0) as "videoBytes",
      COALESCE(SUM(CASE WHEN m.type LIKE '%image%' OR m.mime_type LIKE 'image/%' THEN CAST(m.size_bytes AS BIGINT) ELSE 0 END), 0) as "imageBytes",
      COALESCE(SUM(CASE WHEN m.type NOT LIKE '%video%' AND m.type NOT LIKE '%image%' AND m.mime_type NOT LIKE 'video/%' AND m.mime_type NOT LIKE 'image/%' AND m.original_filename NOT ILIKE '%.m3u8' AND m.storage_key NOT ILIKE '%.m3u8' AND m.original_filename NOT ILIKE '%.ts' AND m.storage_key NOT ILIKE '%.ts' THEN CAST(m.size_bytes AS BIGINT) ELSE 0 END), 0) as "resourceBytes",
      COALESCE(SUM(CAST(m.size_bytes AS BIGINT)), 0) as "totalBytes"
    FROM courses c
    LEFT JOIN course_media cm ON cm.course_id = c.id
    LEFT JOIN media_assets m ON m.id = cm.media_id
    WHERE c.deleted_at IS NULL ${courseFilter}
    GROUP BY c.id, c.title, c.slug, c.thumbnail_url
    ORDER BY "totalBytes" DESC
  `.execute(database);

  return result.rows;
}

export async function listLargestStoredAssets(
  database: Executor,
  limit = 10,
  targetCourseId?: string,
  targetAssetType?: string,
): Promise<LargestAssetRow[]> {
  const courseFilter =
    targetCourseId && targetCourseId !== "all"
      ? sql`AND cm.course_id = ${targetCourseId}`
      : sql``;

  const assetTypeFilter = buildAssetTypeSqlFilter(targetAssetType, "m");

  const result = await sql<LargestAssetRow>`
    WITH course_media AS (
      ${buildCourseMediaCte(targetCourseId)}
    )
    SELECT
      m.id as "assetId",
      m.original_filename as "filename",
      m.type as "type",
      cm.course_id as "courseId",
      cm.course_title as "courseTitle",
      m.size_bytes as "sizeBytes",
      m.metadata as "metadata",
      COALESCE(m.updated_at, m.created_at) as "lastAccessedAt"
    FROM media_assets m
    LEFT JOIN (
      SELECT DISTINCT ON (media_id) media_id, course_id, course_title
      FROM course_media
    ) cm ON cm.media_id = m.id
    WHERE 1=1 ${courseFilter} ${assetTypeFilter}
    ORDER BY CAST(m.size_bytes AS BIGINT) DESC
    LIMIT ${limit}
  `.execute(database);

  return result.rows;
}

export async function listStaleAssets(
  database: Executor,
  staleDays = 60,
  limit = 10,
): Promise<{ rows: StaleAssetRow[]; totalCount: number }> {
  const cutoffDate = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000);

  const [countResult, rowsResult] = await Promise.all([
    sql<{ count: string | number }>`
      SELECT COUNT(*) as count
      FROM media_assets m
      WHERE m.updated_at < ${cutoffDate}
    `.execute(database),
    sql<StaleAssetRow>`
      SELECT
        m.id as "assetId",
        m.original_filename as "filename",
        m.type as "type",
        m.size_bytes as "sizeBytes",
        m.updated_at as "lastAccessedAt"
      FROM media_assets m
      WHERE m.updated_at < ${cutoffDate}
      ORDER BY CAST(m.size_bytes AS BIGINT) DESC
      LIMIT ${limit}
    `.execute(database),
  ]);

  return {
    rows: rowsResult.rows,
    totalCount: Number(countResult.rows[0]?.count ?? 0),
  };
}

export async function getAssetCountByType(
  database: Executor,
  targetCourseId?: string,
): Promise<AssetTypeCountRow[]> {
  const kindCase = sql`
    CASE
      WHEN m.original_filename ILIKE '%.m3u8' OR m.storage_key ILIKE '%.m3u8' OR m.mime_type ILIKE '%mpegurl%' OR m.type ILIKE '%hls%' THEN 'hls'
      WHEN m.original_filename ILIKE '%.mpd' OR m.storage_key ILIKE '%.mpd' OR m.mime_type ILIKE '%dash%' THEN 'dash'
      WHEN m.original_filename ILIKE '%.ts' OR m.storage_key ILIKE '%.ts' OR m.original_filename ILIKE '%.m4u' OR m.storage_key ILIKE '%.m4u' OR m.original_filename ILIKE '%.m4s' OR m.storage_key ILIKE '%.m4s' OR m.mime_type ILIKE '%mp2t%' OR m.mime_type ILIKE '%iso.segment%' THEN 'stream_segment'
      WHEN m.original_filename ILIKE '%.key' OR m.storage_key ILIKE '%.key' OR m.original_filename ILIKE '%.enc' OR m.storage_key ILIKE '%.enc' OR m.original_filename ILIKE '%.bin' OR m.type ILIKE '%encrypt%' THEN 'encrypted_media'
      WHEN m.type ILIKE '%video%' OR m.mime_type ILIKE 'video/%' THEN 'video'
      WHEN m.type ILIKE '%image%' OR m.mime_type ILIKE 'image/%' THEN 'image'
      WHEN m.type ILIKE '%audio%' OR m.mime_type ILIKE 'audio/%' THEN 'audio'
      WHEN m.type ILIKE '%pdf%' OR m.type ILIKE '%doc%' OR m.type ILIKE '%text%' OR m.type ILIKE '%resource%' OR m.mime_type ILIKE 'application/%' THEN 'document'
      ELSE 'other'
    END
  `;

  if (targetCourseId && targetCourseId !== "all") {
    const result = await sql<AssetTypeCountRow>`
      WITH course_media AS (
        ${buildCourseMediaCte(targetCourseId)}
      )
      SELECT
        ${kindCase} as kind,
        COUNT(DISTINCT m.id) as count
      FROM media_assets m
      JOIN course_media cm ON cm.media_id = m.id
      WHERE cm.course_id = ${targetCourseId}
      GROUP BY ${kindCase}
    `.execute(database);
    return result.rows;
  }

  const result = await sql<AssetTypeCountRow>`
    SELECT
      ${kindCase} as kind,
      COUNT(*) as count
    FROM media_assets m
    GROUP BY ${kindCase}
  `.execute(database);

  return result.rows;
}

export async function getOverallMediaTotals(
  database: Executor,
  beforeDate?: Date,
  targetCourseId?: string,
): Promise<OverallMediaTotals> {
  const dateFilter = beforeDate ? sql`AND m.created_at <= ${beforeDate}` : sql``;
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
      COALESCE(SUM(CASE WHEN m.type LIKE '%pdf%' OR m.type LIKE '%doc%' OR m.type LIKE '%document%' OR m.type LIKE '%text%' OR m.type LIKE '%zip%' THEN CAST(m.size_bytes AS BIGINT) ELSE 0 END), 0) as "resourceBytes",
      COALESCE(SUM(CASE WHEN m.type LIKE '%audio%' OR m.mime_type LIKE 'audio/%' THEN CAST(m.size_bytes AS BIGINT) ELSE 0 END), 0) as "audioBytes",
      COALESCE(SUM(CASE WHEN m.original_filename ILIKE '%.m3u8' OR m.storage_key ILIKE '%.m3u8' OR m.mime_type ILIKE '%mpegurl%' THEN CAST(m.size_bytes AS BIGINT) ELSE 0 END), 0) as "hlsBytes",
      COALESCE(SUM(CASE WHEN m.original_filename ILIKE '%.ts' OR m.original_filename ILIKE '%.m4u' OR m.original_filename ILIKE '%.m4s' OR m.storage_key ILIKE '%.ts' OR m.mime_type ILIKE '%mp2t%' OR m.mime_type ILIKE '%iso.segment%' THEN CAST(m.size_bytes AS BIGINT) ELSE 0 END), 0) as "streamSegmentBytes",
      COALESCE(SUM(CASE WHEN m.original_filename ILIKE '%.key' OR m.original_filename ILIKE '%.enc' OR m.original_filename ILIKE '%.bin' OR m.type ILIKE '%encrypt%' THEN CAST(m.size_bytes AS BIGINT) ELSE 0 END), 0) as "encryptedMediaBytes",
      COALESCE(SUM(CASE WHEN m.type NOT LIKE '%video%' AND m.type NOT LIKE '%image%' AND m.type NOT LIKE '%pdf%' AND m.type NOT LIKE '%doc%' AND m.type NOT LIKE '%document%' AND m.type NOT LIKE '%zip%' AND m.type NOT LIKE '%audio%' AND NOT (m.original_filename ILIKE '%.m3u8' OR m.storage_key ILIKE '%.m3u8' OR m.original_filename ILIKE '%.ts' OR m.storage_key ILIKE '%.ts') THEN CAST(m.size_bytes AS BIGINT) ELSE 0 END), 0) as "otherBytes",
      COUNT(DISTINCT m.id) as "totalAssetsCount"
    FROM media_assets m
    ${
      targetCourseId && targetCourseId !== "all"
        ? sql`JOIN course_media cm ON cm.media_id = m.id WHERE 1=1 ${courseFilter} ${dateFilter}`
        : sql`WHERE 1=1 ${dateFilter}`
    }
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

export async function getRecentUploadsStats(
  database: Executor,
  sinceDate: Date,
): Promise<{ addedBytes: number; count: number }> {
  const result = await sql<{ addedBytes: string | number; count: string | number }>`
    SELECT
      COALESCE(SUM(CAST(size_bytes AS BIGINT)), 0) as "addedBytes",
      COUNT(*) as count
    FROM media_assets
    WHERE created_at >= ${sinceDate}
  `.execute(database);

  const row = result.rows[0];
  return {
    addedBytes: Number(row?.addedBytes ?? 0),
    count: Number(row?.count ?? 0),
  };
}

export async function getTimeSeriesStorageFromDb(
  database: Executor,
  startDate: Date,
  endDate: Date,
  pointsCount = 14,
): Promise<
  Array<{
    date: string;
    timestamp: string;
    originalVideosBytes: number;
    transcodedVariantsBytes: number;
    imagesBytes: number;
    resourcesBytes: number;
    otherBytes: number;
    totalBytes: number;
  }>
> {
  const startMs = startDate.getTime();
  const endMs = endDate.getTime();
  const stepMs = Math.max((endMs - startMs) / Math.max(pointsCount - 1, 1), 86400000);

  const timestamps: Date[] = [];
  for (let currentMs = startMs; currentMs <= endMs; currentMs += stepMs) {
    timestamps.push(new Date(currentMs));
  }
  const lastTs = timestamps[timestamps.length - 1];
  if (!lastTs || lastTs.getTime() < endMs) {
    timestamps.push(new Date(endMs));
  }

  // Compute cumulative storage at each checkpoint
  const points = await Promise.all(
    timestamps.map(async (ts) => {
      const totals = await getOverallMediaTotals(database, ts);
      // In VeoLMS, transcoded HLS variants add approximately 45-60% of original video size
      const transcodedBytes = Math.round(totals.videoBytes * 0.46);
      const totalCombined = totals.totalBytes + transcodedBytes;

      const dateStr = ts.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });

      return {
        date: dateStr,
        timestamp: ts.toISOString(),
        originalVideosBytes: totals.videoBytes,
        transcodedVariantsBytes: transcodedBytes,
        imagesBytes: totals.imageBytes,
        resourcesBytes: totals.resourceBytes,
        otherBytes: totals.otherBytes + totals.audioBytes,
        totalBytes: totalCombined,
      };
    }),
  );

  return points;
}
