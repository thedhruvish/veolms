import type { FastifyBaseLogger } from "fastify";
import { sql } from "kysely";
import type { StoredAssetKind } from "@veolms/contracts";

export interface ResolvedDateRange {
  startDate: Date;
  endDate: Date;
  compareStartDate: Date;
  compareEndDate: Date;
  windowDays: number;
  periodDurationMs: number;
  comparisonLabel: string;
}

export interface ResolveDateRangeOptions {
  timeWindow?: "7D" | "30D" | "3M" | "1Y" | string;
  startDate?: string;
  endDate?: string;
  compareStartDate?: string;
  compareEndDate?: string;
}

/**
 * Formats a raw byte count into human-readable string (e.g. 1.25 GB).
 */
export function formatBytes(bytes: number): string {
  if (bytes <= 0 || isNaN(bytes)) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(1024));
  const unitIndex = Math.min(i, units.length - 1);
  const val = bytes / Math.pow(1024, unitIndex);
  const formatted =
    unitIndex === 0
      ? Math.round(val).toString()
      : val >= 100
        ? val.toFixed(0)
        : val >= 10
          ? val.toFixed(1)
          : val.toFixed(2);
  return `${formatted} ${units[unitIndex]}`;
}

/**
 * Formats bytes with an explicit sign prefix (+12.4 GB, -3.2 MB, 0 B).
 */
export function formatSignedBytes(bytes: number): string {
  if (bytes === 0 || isNaN(bytes)) return "0 B";
  const sign = bytes > 0 ? "+" : "-";
  return `${sign}${formatBytes(Math.abs(bytes))}`;
}

/**
 * Formats a Date object to short label (e.g. "Sep 20").
 */
export function formatDateShort(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Formats a comparison period string (e.g. "vs Aug 21 – Sep 20").
 */
export function formatComparisonPeriod(start: Date, end: Date): string {
  return `vs ${formatDateShort(start)} – ${formatDateShort(end)}`;
}

/**
 * Resolves standard date ranges, comparison windows, and human-readable comparison labels.
 */
export function resolveAnalyticsDateRange(
  options: ResolveDateRangeOptions,
): ResolvedDateRange {
  const now = new Date();
  let windowDays = 30;
  let defaultComparisonLabel = "vs previous 30 days";

  if (options.timeWindow === "7D") {
    windowDays = 7;
    defaultComparisonLabel = "vs previous 7 days";
  } else if (options.timeWindow === "30D") {
    windowDays = 30;
    defaultComparisonLabel = "vs previous 30 days";
  } else if (options.timeWindow === "3M") {
    windowDays = 90;
    defaultComparisonLabel = "vs previous 3 months";
  } else if (options.timeWindow === "1Y") {
    windowDays = 365;
    defaultComparisonLabel = "vs previous year";
  }

  const endDate = options.endDate ? new Date(options.endDate) : now;
  const startDate = options.startDate
    ? new Date(options.startDate)
    : new Date(endDate.getTime() - windowDays * 24 * 60 * 60 * 1000);

  const periodDurationMs = endDate.getTime() - startDate.getTime();

  const compareEndDate = options.compareEndDate
    ? new Date(options.compareEndDate)
    : new Date(startDate.getTime());
  const compareStartDate = options.compareStartDate
    ? new Date(options.compareStartDate)
    : new Date(compareEndDate.getTime() - periodDurationMs);

  const comparisonLabel =
    options.compareStartDate && options.compareEndDate
      ? formatComparisonPeriod(compareStartDate, compareEndDate)
      : defaultComparisonLabel;

  return {
    startDate,
    endDate,
    compareStartDate,
    compareEndDate,
    windowDays,
    periodDurationMs,
    comparisonLabel,
  };
}

/**
 * Calculates share percentage with 1 decimal precision.
 */
export function calcPercentage(numerator: number, denominator: number): number {
  if (denominator <= 0 || isNaN(denominator) || isNaN(numerator)) return 0;
  return Number(((numerator / denominator) * 100).toFixed(1));
}

/**
 * Calculates percentage difference between current and previous values.
 */
export function calcChangePercentage(current: number, previous: number): number {
  if (previous <= 0) return current > 0 ? 100 : 0;
  return parseFloat((((current - previous) / previous) * 100).toFixed(1));
}

/**
 * Resolves trend direction ("up" | "down" | "neutral") from change percentage.
 */
export function resolveTrendDirection(
  changePct: number,
): "up" | "down" | "neutral" {
  if (changePct > 0.05) return "up";
  if (changePct < -0.05) return "down";
  return "neutral";
}

/**
 * Generates an interpolated sparkline array between start and end values.
 */
export function generateSparkline(
  startVal: number,
  endVal: number,
  points = 7,
): number[] {
  const result: number[] = [];
  const delta = endVal - startVal;
  for (let i = 0; i < points; i++) {
    const progress = points > 1 ? i / (points - 1) : 0;
    const val = Math.max(0, Math.round(startVal + delta * progress));
    result.push(val);
  }
  return result;
}

/**
 * Samples or pads an arbitrary array of numbers to exactly targetPoints.
 */
export function sampleSparkline(points: number[], targetPoints = 7): number[] {
  if (points.length === 0) return Array(targetPoints).fill(0);
  if (points.length <= targetPoints) {
    return Array(targetPoints - points.length).fill(0).concat(points);
  }
  const step = (points.length - 1) / (targetPoints - 1);
  const result: number[] = [];
  for (let i = 0; i < targetPoints; i++) {
    const idx = Math.min(points.length - 1, Math.round(i * step));
    result.push(points[idx] ?? 0);
  }
  return result;
}

/**
 * Chunks a date range into slices no longer than maxChunkDays (for Cloudflare GraphQL query limits).
 */
export function splitDateRange(
  startDate: Date,
  endDate: Date,
  maxChunkDays = 30,
): Array<{ start: Date; end: Date }> {
  const chunks: Array<{ start: Date; end: Date }> = [];
  let currStart = new Date(startDate.getTime());
  const endMs = endDate.getTime();

  while (currStart.getTime() < endMs) {
    const nextEndMs = Math.min(
      currStart.getTime() + maxChunkDays * 24 * 60 * 60 * 1000,
      endMs,
    );
    const currEnd = new Date(nextEndMs);
    chunks.push({ start: currStart, end: currEnd });
    currStart = new Date(nextEndMs + 1000);
  }
  return chunks;
}

/**
 * Classifies raw type, filename, or MIME type into a standardized StoredAssetKind,
 * handling streaming formats (HLS m3u8, DASH mpd, ts, m4u, m4s) and encrypted media (.key, .bin, .enc).
 */
export function classifyMediaAssetKind(
  rawType?: string | null,
  filename?: string | null,
  mimeType?: string | null,
): StoredAssetKind {
  const typeLower = (rawType || "").toLowerCase();
  const fileLower = (filename || "").toLowerCase();
  const mimeLower = (mimeType || "").toLowerCase();

  // 1. HLS Manifest / Playlist
  if (
    typeLower.includes("m3u8") ||
    fileLower.endsWith(".m3u8") ||
    mimeLower.includes("mpegurl") ||
    typeLower === "hls"
  ) {
    return "hls";
  }

  // 2. DASH Manifest
  if (
    typeLower.includes("mpd") ||
    fileLower.endsWith(".mpd") ||
    mimeLower.includes("dash") ||
    typeLower === "dash"
  ) {
    return "dash";
  }

  // 3. Stream segments (.ts, .m4u, .m4s, fMP4)
  if (
    typeLower.includes("mp2t") ||
    typeLower.includes("transportstream") ||
    typeLower.includes("segment") ||
    fileLower.endsWith(".ts") ||
    fileLower.endsWith(".m4s") ||
    fileLower.endsWith(".m4u") ||
    mimeLower.includes("mp2t") ||
    mimeLower.includes("iso.segment") ||
    typeLower === "stream_segment"
  ) {
    return "stream_segment";
  }

  // 4. Encrypted DRM media / encryption keys
  if (
    typeLower.includes("encrypt") ||
    typeLower.includes("drm") ||
    fileLower.endsWith(".key") ||
    fileLower.endsWith(".enc") ||
    fileLower.endsWith(".bin") ||
    typeLower === "encrypted_media"
  ) {
    return "encrypted_media";
  }

  // 5. Standard Video
  if (
    typeLower.includes("video") ||
    fileLower.endsWith(".mp4") ||
    fileLower.endsWith(".webm") ||
    fileLower.endsWith(".mov") ||
    fileLower.endsWith(".mkv") ||
    mimeLower.startsWith("video/")
  ) {
    return "video";
  }

  // 6. Image
  if (
    typeLower.includes("image") ||
    fileLower.endsWith(".jpg") ||
    fileLower.endsWith(".jpeg") ||
    fileLower.endsWith(".png") ||
    fileLower.endsWith(".webp") ||
    fileLower.endsWith(".svg") ||
    fileLower.endsWith(".gif") ||
    mimeLower.startsWith("image/")
  ) {
    return "image";
  }

  // 7. Audio
  if (
    typeLower.includes("audio") ||
    fileLower.endsWith(".mp3") ||
    fileLower.endsWith(".aac") ||
    fileLower.endsWith(".wav") ||
    fileLower.endsWith(".ogg") ||
    mimeLower.startsWith("audio/")
  ) {
    return "audio";
  }

  // 8. Documents
  if (
    typeLower.includes("pdf") ||
    typeLower.includes("doc") ||
    typeLower.includes("text") ||
    typeLower.includes("document") ||
    typeLower.includes("sheet") ||
    typeLower.includes("presentation") ||
    fileLower.endsWith(".pdf") ||
    fileLower.endsWith(".docx") ||
    fileLower.endsWith(".txt")
  ) {
    return "document";
  }

  return "other";
}

/**
 * Maps MIME type, raw type string, or filename to clean, human-readable display type name.
 */
export function resolveAssetDisplayType(rawType: string, filename?: string): string {
  const kind = classifyMediaAssetKind(rawType, filename);
  switch (kind) {
    case "hls":
      return "HLS Playlist (m3u8)";
    case "dash":
      return "DASH Manifest (mpd)";
    case "stream_segment": {
      const fileLower = (filename || "").toLowerCase();
      if (fileLower.endsWith(".ts")) return "HLS Segment (TS)";
      if (fileLower.endsWith(".m4u") || fileLower.endsWith(".m4s")) {
        return "CMAF/fMP4 Segment";
      }
      return "Stream Segment";
    }
    case "encrypted_media":
      return "Encrypted Media / Key";
    case "video":
      return "Video";
    case "image":
      return "Image";
    case "audio":
      return "Audio";
    case "document": {
      const lower = (rawType || "").toLowerCase();
      const fileLower = (filename || "").toLowerCase();
      if (lower.includes("pdf") || fileLower.endsWith(".pdf")) return "PDF";
      return "Document";
    }
    default: {
      const lower = (rawType || "").toLowerCase();
      if (lower.includes("zip") || lower.includes("tar") || lower.includes("archive")) {
        return "Archive";
      }
      return "Resource";
    }
  }
}

/**
 * Builds a dynamic SQL fragment for filtering by asset type across media tables.
 */
export function buildAssetTypeSqlFilter(
  targetAssetType?: string,
  alias: string = "m",
) {
  if (!targetAssetType || targetAssetType === "all") {
    return sql``;
  }

  const colType = sql.raw(`${alias}.type`);
  const colFile = sql.raw(`${alias}.original_filename`);
  const colKey = sql.raw(`${alias}.storage_key`);
  const colMime = sql.raw(`${alias}.mime_type`);

  if (targetAssetType === "hls" || targetAssetType === "m3u8") {
    return sql`AND (${colFile} ILIKE '%.m3u8' OR ${colKey} ILIKE '%.m3u8' OR ${colMime} ILIKE '%mpegurl%' OR ${colType} ILIKE '%hls%' OR ${colType} ILIKE '%m3u8%')`;
  }
  if (targetAssetType === "dash" || targetAssetType === "mpd") {
    return sql`AND (${colFile} ILIKE '%.mpd' OR ${colKey} ILIKE '%.mpd' OR ${colMime} ILIKE '%dash%' OR ${colType} ILIKE '%dash%' OR ${colType} ILIKE '%mpd%')`;
  }
  if (
    targetAssetType === "stream_segment" ||
    targetAssetType === "ts" ||
    targetAssetType === "m4u" ||
    targetAssetType === "m4s"
  ) {
    return sql`AND (${colFile} ILIKE '%.ts' OR ${colKey} ILIKE '%.ts' OR ${colFile} ILIKE '%.m4u' OR ${colKey} ILIKE '%.m4u' OR ${colFile} ILIKE '%.m4s' OR ${colKey} ILIKE '%.m4s' OR ${colMime} ILIKE '%mp2t%' OR ${colMime} ILIKE '%iso.segment%')`;
  }
  if (
    targetAssetType === "encrypted_media" ||
    targetAssetType === "key" ||
    targetAssetType === "bin" ||
    targetAssetType === "enc"
  ) {
    return sql`AND (${colFile} ILIKE '%.key' OR ${colKey} ILIKE '%.key' OR ${colFile} ILIKE '%.enc' OR ${colKey} ILIKE '%.enc' OR ${colFile} ILIKE '%.bin' OR ${colKey} ILIKE '%.bin' OR ${colType} ILIKE '%encrypt%')`;
  }
  if (targetAssetType === "video") {
    return sql`AND (${colType} ILIKE '%video%' OR ${colMime} ILIKE 'video/%') AND NOT (${colFile} ILIKE '%.ts' OR ${colFile} ILIKE '%.m3u8' OR ${colFile} ILIKE '%.mpd' OR ${colKey} ILIKE '%.ts' OR ${colKey} ILIKE '%.m3u8' OR ${colKey} ILIKE '%.mpd')`;
  }
  if (targetAssetType === "image" || targetAssetType === "thumbnail") {
    return sql`AND (${colType} ILIKE '%image%' OR ${colMime} ILIKE 'image/%')`;
  }
  if (targetAssetType === "audio") {
    return sql`AND (${colType} ILIKE '%audio%' OR ${colMime} ILIKE 'audio/%')`;
  }
  if (targetAssetType === "document" || targetAssetType === "resource") {
    return sql`AND (${colType} ILIKE '%pdf%' OR ${colType} ILIKE '%doc%' OR ${colType} ILIKE '%text%' OR ${colType} ILIKE '%zip%' OR ${colType} ILIKE '%resource%' OR ${colMime} ILIKE 'application/%') AND NOT (${colFile} ILIKE '%.m3u8' OR ${colFile} ILIKE '%.mpd' OR ${colFile} ILIKE '%.ts' OR ${colFile} ILIKE '%.key' OR ${colFile} ILIKE '%.enc')`;
  }

  return sql`AND ${colType} ILIKE ${`%${targetAssetType}%`}`;
}

/**
 * Standard user roles permitted to access Analytics endpoints.
 */
export const ANALYTICS_ALLOWED_ROLES = [
  "admin",
  "analytics_viewer",
  "course_manager",
] as const;

/**
 * Options for executing a GraphQL query against Cloudflare API.
 */
export interface CloudflareGraphQLRequestOptions {
  endpoint?: string;
  apiToken: string;
  query: string;
  variables: Record<string, unknown>;
  logger?: FastifyBaseLogger;
  operationName?: string;
}

/**
 * Reusable helper that sends authenticated GraphQL requests to Cloudflare,
 * handles HTTP and GraphQL error responses, and returns strongly typed data.
 */
export async function executeCloudflareGraphQL<T>(
  options: CloudflareGraphQLRequestOptions,
): Promise<T | null> {
  const endpoint = options.endpoint || "https://api.cloudflare.com/client/v4/graphql";
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.apiToken}`,
      },
      body: JSON.stringify({
        query: options.query,
        variables: options.variables,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      options.logger?.warn(
        { status: response.status, body: errorText, operation: options.operationName },
        "Cloudflare GraphQL query returned non-200 response",
      );
      return null;
    }

    const body = (await response.json()) as {
      data?: T;
      errors?: Array<{ message: string }>;
    };

    if (body.errors && body.errors.length > 0) {
      options.logger?.warn(
        { errors: body.errors, operation: options.operationName },
        "Cloudflare GraphQL returned errors in payload",
      );
      return null;
    }

    return body.data ?? null;
  } catch (err) {
    options.logger?.error(
      { err, operation: options.operationName },
      "Failed to execute Cloudflare GraphQL query",
    );
    return null;
  }
}

/**
 * Builds a reusable SQL CTE fragment linking courses to their media assets
 * (thumbnails, trailers, lesson videos, and lesson attachments).
 */
export function buildCourseMediaCte(targetCourseId?: string) {
  const courseFilter =
    targetCourseId && targetCourseId !== "all"
      ? sql`AND c.id = ${targetCourseId}`
      : sql``;

  return sql`
    SELECT c.id as course_id, c.title as course_title, c.thumbnail_media_id as media_id, 'Course Thumbnail' as asset_context, NULL::text as lesson_id
    FROM courses c WHERE c.thumbnail_media_id IS NOT NULL AND c.deleted_at IS NULL ${courseFilter}
    UNION
    SELECT c.id as course_id, c.title as course_title, c.trailer_media_id as media_id, 'Course Trailer' as asset_context, NULL::text as lesson_id
    FROM courses c WHERE c.trailer_media_id IS NOT NULL AND c.deleted_at IS NULL ${courseFilter}
    UNION
    SELECT cl.course_id, c.title as course_title, cl.content_media_id as media_id, cl.title as asset_context, cl.id as lesson_id
    FROM course_lessons cl
    JOIN courses c ON c.id = cl.course_id
    WHERE cl.content_media_id IS NOT NULL AND cl.deleted_at IS NULL AND c.deleted_at IS NULL ${courseFilter}
    UNION
    SELECT cl.course_id, c.title as course_title, lr.media_asset_id as media_id, lr.title as asset_context, cl.id as lesson_id
    FROM lesson_resources lr
    JOIN course_lessons cl ON cl.id = lr.lesson_id
    JOIN courses c ON c.id = cl.course_id
    WHERE lr.deleted_at IS NULL AND cl.deleted_at IS NULL AND c.deleted_at IS NULL ${courseFilter}
  `;
}

