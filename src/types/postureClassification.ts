import type { PostureStatus } from "../enums/postureStatus";
import type { BlinkRateMeasurement } from "../services/vision/blinkRate";

export type PostureMetric = "neck" | "shoulders" | "distance" | "blink-rate";

/** Measurements from one inference, before display rounding. Null means unavailable. */
export interface PostureObservation {
  readonly timestampMs: number;
  readonly captureId: number;
  readonly neckAngle: number | null;
  readonly shoulderAngle: number | null;
  readonly distanceCm: number | null;
  readonly blinkRate: BlinkRateMeasurement | null;
}

export interface MetricClassification {
  /** Angular values are deviations from baseline; distance is cm, blink rate is /min. */
  readonly value: number | null;
  readonly status: PostureStatus | null;
}

export interface PostureClassification {
  readonly timestampMs: number;
  readonly captureId: number;
  readonly baselineId: string | null;
  readonly metrics: Readonly<Record<PostureMetric, MetricClassification>>;
  /** Worst available neck/shoulder/distance status; ocular fatigue is independent. */
  readonly postureStatus: PostureStatus | null;
}

export interface PostureAlertCondition {
  readonly metric: PostureMetric;
  readonly level: PostureStatus.WARNING | PostureStatus.DANGER;
  readonly startedAtMs: number;
  readonly durationMs: number;
}

export interface PostureHysteresisResult {
  /** One event when a continuous condition first exceeds its persistence threshold. */
  readonly alerts: readonly PostureAlertCondition[];
  /** Still-sustained conditions allow cooldown-controlled repeat delivery. */
  readonly sustained: readonly PostureAlertCondition[];
}
