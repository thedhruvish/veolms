import type { VideoQuality } from "@veolms/fleet-types";

import type { RenditionSpec } from "./types.ts";

export const QUALITY_RENDITION_MAP: Readonly<
  Record<VideoQuality, RenditionSpec>
> = {
  "144p": {
    quality: "144p",
    width: 256,
    height: 144,
    maxBitrateKbps: 250,
    bufSizeKbps: 500,
    audioBitrateKbps: 48,
  },
  "240p": {
    quality: "240p",
    width: 426,
    height: 240,
    maxBitrateKbps: 400,
    bufSizeKbps: 800,
    audioBitrateKbps: 64,
  },
  "360p": {
    quality: "360p",
    width: 640,
    height: 360,
    maxBitrateKbps: 800,
    bufSizeKbps: 1600,
    audioBitrateKbps: 96,
  },
  "480p": {
    quality: "480p",
    width: 854,
    height: 480,
    maxBitrateKbps: 1400,
    bufSizeKbps: 2800,
    audioBitrateKbps: 128,
  },
  "540p": {
    quality: "540p",
    width: 960,
    height: 540,
    maxBitrateKbps: 2000,
    bufSizeKbps: 4000,
    audioBitrateKbps: 128,
  },
  "720p": {
    quality: "720p",
    width: 1280,
    height: 720,
    maxBitrateKbps: 2800,
    bufSizeKbps: 5600,
    audioBitrateKbps: 128,
  },
  "900p": {
    quality: "900p",
    width: 1600,
    height: 900,
    maxBitrateKbps: 3800,
    bufSizeKbps: 7600,
    audioBitrateKbps: 160,
  },
  "1080p": {
    quality: "1080p",
    width: 1920,
    height: 1080,
    maxBitrateKbps: 5000,
    bufSizeKbps: 10000,
    audioBitrateKbps: 192,
  },
  "1440p": {
    quality: "1440p",
    width: 2560,
    height: 1440,
    maxBitrateKbps: 9000,
    bufSizeKbps: 18000,
    audioBitrateKbps: 192,
  },
  "2160p": {
    quality: "2160p",
    width: 3840,
    height: 2160,
    maxBitrateKbps: 18000,
    bufSizeKbps: 36000,
    audioBitrateKbps: 256,
  },
  "4320p": {
    quality: "4320p",
    width: 7680,
    height: 4320,
    maxBitrateKbps: 35000,
    bufSizeKbps: 70000,
    audioBitrateKbps: 320,
  },
};

/**
 * Filters and clamps requested video qualities against source resolution.
 *
 * Enforces the No-Upscaling Rule:
 * We never upscale renditions beyond the native height of the source video.
 * If source is 720p, requested 1080p and 2160p renditions are excluded.
 */
export function filterRenditionsForSource(
  requestedQualities: readonly VideoQuality[],
  sourceHeight: number,
): readonly RenditionSpec[] {
  const uniqueQualities = Array.from(new Set(requestedQualities));
  const validSpecs: RenditionSpec[] = [];

  for (const quality of uniqueQualities) {
    const spec = QUALITY_RENDITION_MAP[quality];
    if (!spec) continue;

    // Only allow renditions that do not upscale beyond source height
    if (spec.height <= sourceHeight) {
      validSpecs.push(spec);
    }
  }

  // Fallback: If all requested qualities exceeded source height, provide the closest lower/equal rendition
  if (validSpecs.length === 0) {
    const fallbackList = Object.values(QUALITY_RENDITION_MAP)
      .filter((s) => s.height <= sourceHeight)
      .sort((a, b) => b.height - a.height);

    if (fallbackList.length > 0 && fallbackList[0]) {
      validSpecs.push(fallbackList[0]);
    } else {
      // Smallest baseline rendition (240p)
      validSpecs.push(QUALITY_RENDITION_MAP["240p"]);
    }
  }

  // Sort renditions by height descending (e.g. 1080p -> 720p -> 240p)
  return validSpecs.sort((a, b) => b.height - a.height);
}
