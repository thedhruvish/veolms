import type { ExternalTextTrack, VideoSource } from "@veolms/video-player";
import type { VideoPlaybackDrm } from "@veolms/contracts";
import type { CourseVideo } from "../courseContent";
import {
  createLearningStreamingRequestFilter,
  LEARNING_HLS_MIME_TYPE,
  LEARNING_HLS_STREAMING,
  toAbsoluteLearningMediaUrl,
} from "./learningHlsConstants";

export {
  LEARNING_HLS_MIME_TYPE,
  LEARNING_HLS_STREAMING,
} from "./learningHlsConstants";
export { createLearningHlsPreloadSource } from "./learningHlsPreloadSource";

export const LEARNING_LESSON_TEXT_TRACKS: readonly ExternalTextTrack[] = [
  {
    src: "/assets/designing-users.vtt",
    language: "en",
    label: "English",
    kind: "captions",
    mimeType: "text/vtt",
  },
];

export function isHlsUrl(src: string): boolean {
  return /\.m3u8(?:$|[?#])/i.test(src);
}

export function isDashUrl(src: string): boolean {
  return /\.mpd(?:$|[?#])/i.test(src);
}

export function createLearningLessonVideoSource(options: {
  media: CourseVideo;
  lessonTitle: string;
  mediaKey: string;
  startTime: number;
  protectedPlayback?: boolean;
  segmentToken?: string;
  segmentTokenExpiresAt?: number;
  drm?: VideoPlaybackDrm;
  refreshSegmentToken?: () => Promise<{
    token: string;
    expiresAt?: number;
  } | null>;
}): VideoSource {
  const hls = isHlsUrl(options.media.src);
  const dash = !hls && isDashUrl(options.media.src);
  const kind = dash ? "dash" : hls ? "hls" : "file";
  return {
    id: options.mediaKey,
    src:
      hls || dash
        ? toAbsoluteLearningMediaUrl(options.media.src)
        : options.media.src,
    type: dash
      ? "application/dash+xml"
      : hls
        ? LEARNING_HLS_MIME_TYPE
        : "video/mp4",
    kind,
    // The catalog duration can be stale after an asset replacement. Shaka
    // receives the stored position and the loaded event clamps it against
    // the actual media duration before progress is reported.
    startTime: options.startTime,
    metadata: {
      duration: options.media.duration,
      title: options.lessonTitle,
    },
    streaming: hls || dash ? { ...LEARNING_HLS_STREAMING } : undefined,
    drm: options.drm
      ? {
          clearKey: { licenseUrl: options.drm.licenseUrl },
          preferredSystems: ["clearkey"] as const,
        }
      : undefined,
    networking:
      hls || dash
        ? {
            requestFilter: createLearningStreamingRequestFilter({
              protectedPlayback:
                options.protectedPlayback || Boolean(options.drm),
              segmentToken: options.segmentToken,
              segmentTokenExpiresAt: options.segmentTokenExpiresAt,
              refreshSegmentToken: options.refreshSegmentToken,
            }),
          }
        : undefined,
    textTracks: undefined,
  };
}
