import {
  DEFAULT_FLEET_CONFIG,
  type FleetManagerConfig,
  type SourceComplexityResult,
  type SourceMetadata,
} from "@veolms/fleet-types";

/**
 * Normalizes a codec string (e.g. "avc1.64001f", "h264", "hevc") to match configuration keys.
 */
function normalizeCodec(codec: string): string {
  const lower = codec.toLowerCase().trim();
  if (
    lower.startsWith("avc") ||
    lower.includes("h264") ||
    lower.includes("264")
  ) {
    return "h264";
  }
  if (
    lower.startsWith("hev") ||
    lower.includes("h265") ||
    lower.includes("265")
  ) {
    return "hevc";
  }
  if (lower.includes("vp9")) {
    return "vp9";
  }
  if (lower.startsWith("av01") || lower.includes("av1")) {
    return "av01";
  }
  if (lower.includes("prores")) {
    return "prores";
  }
  return lower;
}

/**
 * Calculates the source video complexity based on pixel count, frame rate, and compression codec
 * relative to the baseline configuration (default: 1920x1080 @ 30 FPS).
 */
export function calculateSourceComplexity(
  metadata: SourceMetadata,
  config: Partial<FleetManagerConfig> = {},
): SourceComplexityResult {
  const baselineWidth =
    config.baselineWidth ?? DEFAULT_FLEET_CONFIG.baselineWidth;
  const baselineHeight =
    config.baselineHeight ?? DEFAULT_FLEET_CONFIG.baselineHeight;
  const baselineFps = config.baselineFps ?? DEFAULT_FLEET_CONFIG.baselineFps;
  const codecMultipliers =
    config.codecMultipliers ?? DEFAULT_FLEET_CONFIG.codecMultipliers;

  const baselinePixels = baselineWidth * baselineHeight;
  const sourcePixels = Math.max(1, metadata.width * metadata.height);

  const resolutionFactor = sourcePixels / baselinePixels;
  const fpsFactor = Math.max(1, metadata.fps) / baselineFps;

  const normalizedKey = normalizeCodec(metadata.codec);
  const codecMultiplier = codecMultipliers[normalizedKey] ?? 1.0;

  const totalSourceComplexity = resolutionFactor * fpsFactor * codecMultiplier;

  return {
    resolutionFactor: Number(resolutionFactor.toFixed(4)),
    fpsFactor: Number(fpsFactor.toFixed(4)),
    codecMultiplier: Number(codecMultiplier.toFixed(2)),
    totalSourceComplexity: Number(totalSourceComplexity.toFixed(4)),
  };
}
