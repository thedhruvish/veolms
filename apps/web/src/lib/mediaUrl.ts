const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api/v1";
const STREAMING_URL =
  import.meta.env.VITE_STREAMING_URL ||
  import.meta.env.STREAMING_URL ||
  "";

/**
 * Resolves a media asset ID, relative media path, or full media URL
 * into a valid URL for display (thumbnails, avatars, static media assets).
 */
export function resolveMediaAssetUrl(
  mediaIdOrUrl: string | null | undefined,
): string | null {
  if (!mediaIdOrUrl) return null;
  const trimmed = mediaIdOrUrl.trim();
  if (!trimmed) return null;

  // Preserve data URLs and full external URLs
  if (/^(?:https?:|data:|blob:)/i.test(trimmed)) {
    return trimmed;
  }

  // Preserve local static assets like /assets/something.webp
  if (
    trimmed.startsWith("/") &&
    !/^\/(?:api\/v1\/)?(?:media|m)\//.test(trimmed)
  ) {
    return trimmed;
  }

  // Strip leading /media/, /m/, or /api/v1/media/ to get the raw asset ID
  const cleanId = trimmed
    .replace(/^\/?(?:api\/v1\/)?(?:media|m)\//, "")
    .replace(/^\/+/, "");

  const cleanBase = String(API_BASE_URL).replace(/\/+$/, "");

  if (STREAMING_URL) {
    const streamTrimmed = STREAMING_URL.trim().replace(/\/+$/, "");
    if (/^https?:\/\//i.test(streamTrimmed)) {
      return `${streamTrimmed}/${encodeURIComponent(cleanId)}`;
    }
    if (streamTrimmed.startsWith("/")) {
      const prefix = streamTrimmed.replace(/\/+$/, "");
      return `${cleanBase}${prefix}/${encodeURIComponent(cleanId)}`;
    }
  }

  return `${cleanBase}/m/${encodeURIComponent(cleanId)}`;
}
