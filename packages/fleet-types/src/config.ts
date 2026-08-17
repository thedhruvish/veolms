import { DEFAULT_QUALITY_WEIGHTS, type QualityWeightMap } from "./video.ts";

/**
 * System configuration parameters for the Fleet Manager control plane.
 */
export interface FleetManagerConfig {
  /**
   * Maximum workers that can be concurrently assigned to a single video.
   * Default: 4
   */
  readonly maxWorkersPerVideo: number;

  /**
   * Hard ceiling for the entire global worker pool across all videos.
   * Default: 20
   */
  readonly maxTotalWorkers: number;

  /**
   * Progress percentage at which a busy worker is considered "near-complete" and reusable.
   * Default: 85 (%)
   */
  readonly reuseProgressThreshold: number;

  /**
   * Time in seconds an idle worker can remain unused before being terminated.
   * Default: 300 (5 minutes)
   */
  readonly idleTimeoutSeconds: number;

  /**
   * Heartbeat timeout in seconds after which a worker is marked dead/FAILED.
   * Default: 45 seconds
   */
  readonly heartbeatTimeoutSeconds: number;

  /**
   * Minimum duration for a single no-reencode chunk in seconds.
   * Default: 300 (5 minutes)
   */
  readonly minChunkDurationSeconds: number;

  /**
   * Maximum duration for a single no-reencode chunk in seconds.
   * Default: 1800 (30 minutes)
   */
  readonly maxChunkDurationSeconds: number;

  /**
   * Target work budget constant used in Formula A to determine raw chunk duration.
   * Default: 60
   */
  readonly targetChunkWorkBudget: number;

  /**
   * Baseline width used for source complexity calculation. Default: 1920
   */
  readonly baselineWidth: number;

  /**
   * Baseline height used for source complexity calculation. Default: 1080
   */
  readonly baselineHeight: number;

  /**
   * Baseline FPS used for source complexity calculation. Default: 30
   */
  readonly baselineFps: number;

  /**
   * Default CRF value used for initial compression (Video Architecture V2).
   * Default: 22
   */
  readonly defaultCrf: number;

  /**
   * Multiplier weights per requested resolution height.
   */
  readonly qualityWeights: QualityWeightMap;

  /**
   * Multipliers for different video source codecs.
   */
  readonly codecMultipliers: Readonly<Record<string, number>>;
}

export const DEFAULT_FLEET_CONFIG: FleetManagerConfig = {
  maxWorkersPerVideo: 4,
  maxTotalWorkers: 20,
  reuseProgressThreshold: 85,
  idleTimeoutSeconds: 300,
  heartbeatTimeoutSeconds: 45,
  minChunkDurationSeconds: 300,
  maxChunkDurationSeconds: 1800,
  targetChunkWorkBudget: 60,
  baselineWidth: 1920,
  baselineHeight: 1080,
  baselineFps: 30,
  defaultCrf: 22,
  qualityWeights: DEFAULT_QUALITY_WEIGHTS,
  codecMultipliers: {
    h264: 1.0,
    avc1: 1.0,
    hevc: 1.5,
    h265: 1.5,
    vp9: 1.4,
    av01: 2.0,
    prores: 0.8,
  },
};
