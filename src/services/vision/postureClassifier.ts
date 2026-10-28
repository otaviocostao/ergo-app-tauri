import { PostureStatus } from "../../enums/postureStatus";
import {
  DEFAULT_POSTURE_CLASSIFICATION_CONFIG,
  type AngularClassificationThresholds,
  type PostureClassificationConfig,
} from "./postureClassificationConfig";

function classifyAngularDeviation(
  deviationDegrees: number | null | undefined,
  thresholds: AngularClassificationThresholds,
): PostureStatus | null {
  if (deviationDegrees == null || !Number.isFinite(deviationDegrees)) return null;
  // A signed difference describes direction; the task classifies its magnitude.
  const magnitude = Math.abs(deviationDegrees);
  if (magnitude <= thresholds.goodMaxDegrees) return PostureStatus.GOOD;
  return magnitude <= thresholds.warningMaxDegrees ? PostureStatus.WARNING : PostureStatus.DANGER;
}

/** Classify a degree difference from neutral, not an absolute camera orientation. */
export function classifyNeckDeviation(
  deviationDegrees: number | null | undefined,
  config: PostureClassificationConfig = DEFAULT_POSTURE_CLASSIFICATION_CONFIG,
): PostureStatus | null {
  return classifyAngularDeviation(deviationDegrees, config.neck);
}

export function classifyShoulderDeviation(
  deviationDegrees: number | null | undefined,
  config: PostureClassificationConfig = DEFAULT_POSTURE_CLASSIFICATION_CONFIG,
): PostureStatus | null {
  return classifyAngularDeviation(deviationDegrees, config.shoulders);
}

/** The existing ocular estimator already produces cm; no conversion is needed. */
export function classifyScreenDistance(
  distanceCm: number | null | undefined,
  config: PostureClassificationConfig = DEFAULT_POSTURE_CLASSIFICATION_CONFIG,
): PostureStatus | null {
  if (distanceCm == null || !Number.isFinite(distanceCm) || distanceCm <= 0) return null;
  const limits = config.distance;
  if (distanceCm >= limits.goodMinCm && distanceCm <= limits.goodMaxCm) return PostureStatus.GOOD;
  if (distanceCm < limits.dangerBelowCm || distanceCm > limits.dangerAboveCm) return PostureStatus.DANGER;
  return PostureStatus.WARNING;
}
