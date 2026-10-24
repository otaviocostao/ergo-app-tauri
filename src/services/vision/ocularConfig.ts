import type { PostureCalibrationDTO } from "../../types/postureCalibration";

/** Existing calibration fields, measured in original-frame px and known cm. */
export type ScreenDistanceBaseline = Readonly<Pick<PostureCalibrationDTO,
  "baselineEyeDistancePx" | "baselineDistanceCm">>;

/** Timestamp thresholds in ms; EAR thresholds are dimensionless. */
export interface BlinkDetectorConfig {
  readonly closeThreshold: number;
  readonly reopenThreshold: number;
  readonly minClosedMs: number;
  readonly maxClosedMs: number;
  readonly maxGapMs: number;
}

/** Experimental defaults; require evaluation with the selected face model. */
export const DEFAULT_BLINK_CONFIG: Readonly<BlinkDetectorConfig> = Object.freeze({
  closeThreshold: 0.20,
  reopenThreshold: 0.23,
  minClosedMs: 70,
  maxClosedMs: 300,
  maxGapMs: 250,
});

/** Separate display filtering defaults; never applied by the raw estimator. */
export const DEFAULT_DISTANCE_CONFIG = Object.freeze({
  minCm: 20,
  maxCm: 150,
  alpha: 0.3,
  maxHeadRotationDegrees: 25,
});

/** Minimum usable confidence follows the existing pose adapter. */
export const MIN_OCULAR_CONFIDENCE = 0.35;
/** Pixel geometry below this span cannot support a stable EAR/IPD. */
export const MIN_OCULAR_SPAN_PX = 1e-8;
/** Sliding-window and warm-up durations, in ms. */
export const DEFAULT_BLINK_RATE_CONFIG = Object.freeze({ windowMs: 60_000, minObservedMs: 30_000 });

/** Thresholds in blinks/minute, interpreted as strict lower bounds. */
export interface BlinkRateThresholds {
  readonly highRiskBelow: number;
  readonly attentionBelow: number;
}

/**
 * Heuristics, not diagnostic cutoffs. The roadmap proposes attention below 8/min;
 * 5/min separates a lower-frequency band. Tsubota & Nakamori (1993) observed
 * 22/min at rest and 7/min during screen use, with substantial variation:
 * https://doi.org/10.1056/NEJM199302253280817
 */
export const DEFAULT_BLINK_RATE_THRESHOLDS: Readonly<BlinkRateThresholds> = Object.freeze({
  highRiskBelow: 5,
  attentionBelow: 8,
});
