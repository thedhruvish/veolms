import type { FleetManagerConfig } from "../config/config.ts";

export interface CalculateNextCheckOptions {
  estimatedDurationSec: number;
  progressPercent: number;
  lastCheckIntervalSec?: number;
}

export interface NextCheckResult {
  nextCheckAt: Date;
  checkIntervalSec: number;
}

export interface Scheduler {
  calculateNextCheck(options: CalculateNextCheckOptions): NextCheckResult;
}

export function createScheduler(config: FleetManagerConfig): Scheduler {
  const minInterval = config.MIN_CHECK_INTERVAL_SECONDS;
  const maxInterval = config.MAX_CHECK_INTERVAL_SECONDS;
  const defaultInterval = config.DEFAULT_CHECK_INTERVAL_SECONDS;

  return {
    calculateNextCheck(options: CalculateNextCheckOptions): NextCheckResult {
      const { estimatedDurationSec, progressPercent } = options;

      const safeEstimated = Math.max(10, estimatedDurationSec);
      const safeProgress = Math.min(100, Math.max(0, progressPercent));

      if (safeProgress >= 99.0) {
        return {
          nextCheckAt: new Date(Date.now() + minInterval * 1000),
          checkIntervalSec: minInterval,
        };
      }

      // Estimate remaining seconds based on progress
      const remainingPercent = (100 - safeProgress) / 100;
      const estimatedRemainingSec = safeEstimated * remainingPercent;

      // Check halfway through remaining estimated time, bounded by [minInterval, maxInterval]
      let targetInterval = Math.round(estimatedRemainingSec / 2);

      if (targetInterval <= 0) {
        targetInterval = defaultInterval;
      }

      const checkIntervalSec = Math.max(
        minInterval,
        Math.min(maxInterval, targetInterval),
      );

      return {
        nextCheckAt: new Date(Date.now() + checkIntervalSec * 1000),
        checkIntervalSec,
      };
    },
  };
}
