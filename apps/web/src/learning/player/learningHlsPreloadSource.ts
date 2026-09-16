import { readResumePosition } from "./lessonPlayerPersistence";
import type { VideoPlaybackDrm } from "@veolms/contracts";
import {
  createLearningStreamingRequestFilter,
  LEARNING_HLS_MIME_TYPE,
  LEARNING_HLS_STREAMING,
  toAbsoluteLearningMediaUrl,
} from "./learningHlsConstants";

function shouldResumeFromLastPosition(): boolean {
  if (typeof localStorage === "undefined") return true;
  try {
    const stored = JSON.parse(
      localStorage.getItem("veolms-learning-preferences") || "{}",
    ) as { resumeFromLastPosition?: unknown };
    if (typeof stored.resumeFromLastPosition === "boolean") {
      return stored.resumeFromLastPosition;
    }
  } catch {
    // Prefer the product default when preference storage is unavailable.
  }
  return true;
}

export function createLearningHlsPreloadSource(options: {
  manifestUrl: string;
  mediaKey?: string;
  protectedPlayback?: boolean;
  segmentToken?: string;
  segmentTokenExpiresAt?: number;
  refreshSegmentToken?: () => Promise<{
    token: string;
    expiresAt?: number;
  } | null>;
  manifestType?: "hls" | "dash";
  drm?: VideoPlaybackDrm;
}) {
  const dash =
    options.manifestType === "dash" ||
    /\.mpd(?:$|[?#])/i.test(options.manifestUrl);
  const startTime =
    options.mediaKey && shouldResumeFromLastPosition()
      ? readResumePosition(options.mediaKey)
      : 0;
  return {
    id: options.mediaKey,
    src: toAbsoluteLearningMediaUrl(options.manifestUrl),
    type: dash ? "application/dash+xml" : LEARNING_HLS_MIME_TYPE,
    kind: dash ? ("dash" as const) : ("hls" as const),
    startTime,
    streaming: { ...LEARNING_HLS_STREAMING },
    networking: {
      requestFilter: createLearningStreamingRequestFilter({
        protectedPlayback: options.protectedPlayback || Boolean(options.drm),
        segmentToken: options.segmentToken,
        segmentTokenExpiresAt: options.segmentTokenExpiresAt,
        refreshSegmentToken: options.refreshSegmentToken,
      }),
    },
    drm: options.drm
      ? {
          clearKey: { licenseUrl: options.drm.licenseUrl },
          preferredSystems: ["clearkey"] as const,
        }
      : undefined,
  };
}
