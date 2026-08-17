import {
  DEFAULT_QUALITY_WEIGHTS,
  type QualityComplexityResult,
  type QualityWeightMap,
  type VideoQuality,
} from "@veolms/fleet-types";

/**
 * Calculates the aggregate quality complexity score by summing the weights
 * of all requested output renditions.
 *
 * Example:
 * [240p (0.8), 360p (1.0), 720p (2.0)] => 3.8
 */
export function calculateQualityComplexity(
  qualities: readonly VideoQuality[],
  weights: QualityWeightMap = DEFAULT_QUALITY_WEIGHTS,
): QualityComplexityResult {
  if (qualities.length === 0) {
    return {
      requestedQualities: [],
      totalWeight: 0,
    };
  }

  // Deduplicate requested qualities to prevent duplicate weight inflation
  const uniqueQualities = Array.from(new Set(qualities));
  let totalWeight = 0;

  for (const quality of uniqueQualities) {
    const weight = weights[quality];
    if (typeof weight === "number" && Number.isFinite(weight)) {
      totalWeight += weight;
    }
  }

  return {
    requestedQualities: uniqueQualities,
    totalWeight: Number(totalWeight.toFixed(2)),
  };
}
