import { PostureStatus } from "../../enums/postureStatus";
import type { BlinkRateMeasurement } from "./blinkRate";
import { DEFAULT_BLINK_RATE_CONFIG } from "./ocularConfig";
import type { PostureCalibrationDTO } from "../../types/postureCalibration";
import type { MetricClassification, PostureClassification, PostureObservation } from "../../types/postureClassification";
import {
  DEFAULT_POSTURE_CLASSIFICATION_CONFIG,
  POSTURE_MEASUREMENT_LIMITS,
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

/** Reuse the existing rolling rate and warm-up; persistence belongs to shared hysteresis. */
export function classifyBlinkFrequency(
  measurement: BlinkRateMeasurement | null | undefined,
  config: PostureClassificationConfig = DEFAULT_POSTURE_CLASSIFICATION_CONFIG,
): PostureStatus | null {
  if (!measurement || measurement.isWarmingUp || !Number.isFinite(measurement.observedMs) ||
    measurement.observedMs < DEFAULT_BLINK_RATE_CONFIG.minObservedMs ||
    measurement.blinksPerMinute === null || !Number.isFinite(measurement.blinksPerMinute) ||
    measurement.blinksPerMinute < 0) return null;
  return measurement.blinksPerMinute < config.blinkRate.lowBelowPerMinute ? PostureStatus.WARNING : PostureStatus.GOOD;
}

/** One deterministic result per inference; the caller supplies the active calibration. */
export function classifyPosture(
  observation: PostureObservation,
  baseline: PostureCalibrationDTO | null,
  config: PostureClassificationConfig = DEFAULT_POSTURE_CLASSIFICATION_CONFIG,
): PostureClassification {
  const limits = POSTURE_MEASUREMENT_LIMITS;
  const active = baseline?.isActive && baseline.id.trim() ? baseline : null;
  const validAngle = (value: number | null, maximum: number): value is number =>
    value !== null && Number.isFinite(value) && value >= 0 && value <= maximum;
  const neckDeviation = active && validAngle(observation.neckAngle, limits.maxNeckDegrees) &&
    validAngle(active.baselineNeckAngle, limits.maxNeckDegrees)
    ? Math.abs(observation.neckAngle - active.baselineNeckAngle) : null;
  // Zero balance is saturated: it cannot distinguish 10 degrees from larger angles.
  const shoulderDeviation = active && validAngle(observation.shoulderAngle, limits.maxShoulderDegrees) &&
    Number.isFinite(active.baselineShoulderBalance) && active.baselineShoulderBalance > 0 &&
    active.baselineShoulderBalance <= limits.maxShoulderBalance
    ? Math.abs(observation.shoulderAngle - (limits.maxShoulderBalance - active.baselineShoulderBalance) / limits.shoulderBalancePointsPerDegree)
    : null;
  const measurement = (value: number | null, status: PostureStatus | null): MetricClassification =>
    ({ value: status === null ? null : value, status });
  const metrics = {
    neck: measurement(neckDeviation, classifyNeckDeviation(neckDeviation, config)),
    shoulders: measurement(shoulderDeviation, classifyShoulderDeviation(shoulderDeviation, config)),
    distance: measurement(observation.distanceCm, classifyScreenDistance(observation.distanceCm, config)),
    "blink-rate": measurement(observation.blinkRate?.blinksPerMinute ?? null, classifyBlinkFrequency(observation.blinkRate, config)),
  };
  const statuses = [metrics.neck.status, metrics.shoulders.status, metrics.distance.status];
  const postureStatus = statuses.includes(PostureStatus.DANGER) ? PostureStatus.DANGER
    : statuses.includes(PostureStatus.WARNING) ? PostureStatus.WARNING
      : statuses.includes(PostureStatus.GOOD) ? PostureStatus.GOOD : null;
  return { timestampMs: observation.timestampMs, captureId: observation.captureId, baselineId: active?.id ?? null, metrics, postureStatus };
}

/** Existing status output labels, derived from the same metric classification as the cards. */
export function getPostureStatusLabel(
  classification: PostureClassification,
  config: PostureClassificationConfig = DEFAULT_POSTURE_CLASSIFICATION_CONFIG,
): string {
  const { metrics, postureStatus } = classification;
  if (postureStatus === null) return "Aguardando calibração ou leituras válidas";
  if (postureStatus === PostureStatus.GOOD) return "Postura Excelente";
  if (metrics.neck.status === postureStatus) return postureStatus === PostureStatus.DANGER
    ? "Atenção: Pescoço Muito Inclinado!" : "Atenção à Inclinação do Pescoço";
  if (metrics.shoulders.status === postureStatus) return postureStatus === PostureStatus.DANGER
    ? "Ombros Desalinhados" : "Atenção ao Alinhamento dos Ombros";
  if (postureStatus === PostureStatus.WARNING) return "Atenção à Distância da Tela";
  return metrics.distance.value !== null && metrics.distance.value < config.distance.goodMinCm
    ? "Muito Próximo da Tela" : "Muito Distante da Tela";
}
