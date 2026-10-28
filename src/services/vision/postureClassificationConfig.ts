import type { PostureMetric } from "../../types/postureClassification";

export const POSTURE_METRICS: readonly PostureMetric[] = Object.freeze(["neck", "shoulders", "distance", "blink-rate"]);

/** Geometry/display conversion already used by biomechanics and calibration. */
export const POSTURE_MEASUREMENT_LIMITS = Object.freeze({
  maxNeckDegrees: 180,
  maxShoulderDegrees: 90,
  maxShoulderBalance: 100,
  shoulderBalancePointsPerDegree: 10,
});

export interface AngularClassificationThresholds {
  readonly goodMaxDegrees: number;
  readonly warningMaxDegrees: number;
}

export interface PostureClassificationConfig {
  readonly neck: AngularClassificationThresholds;
  readonly shoulders: AngularClassificationThresholds;
  readonly distance: {
    readonly dangerBelowCm: number;
    readonly goodMinCm: number;
    readonly goodMaxCm: number;
    readonly dangerAboveCm: number;
  };
  readonly blinkRate: { readonly lowBelowPerMinute: number };
  readonly persistenceMs: number;
  readonly blinkPersistenceMs: number;
  readonly cooldownMs: number;
  readonly maxSampleGapMs: number;
}

export const POSTURE_TIME_LIMITS = Object.freeze({
  minPersistenceMs: 15_000,
  maxPersistenceMs: 30_000,
  minCooldownMs: 120_000,
  maxCooldownMs: 180_000,
});

export const DEFAULT_POSTURE_CLASSIFICATION_CONFIG: PostureClassificationConfig = Object.freeze({
  neck: Object.freeze({ goodMaxDegrees: 12, warningMaxDegrees: 20 }),
  shoulders: Object.freeze({ goodMaxDegrees: 3, warningMaxDegrees: 6 }),
  distance: Object.freeze({ dangerBelowCm: 40, goodMinCm: 50, goodMaxCm: 75, dangerAboveCm: 85 }),
  blinkRate: Object.freeze({ lowBelowPerMinute: 8 }),
  persistenceMs: 20_000,
  blinkPersistenceMs: 20_000,
  cooldownMs: 180_000,
  maxSampleGapMs: 250,
});

/** Resolve and validate once, outside the inference loop. No settings UI is required. */
export function createPostureClassificationConfig(
  overrides: Partial<PostureClassificationConfig> = {},
): PostureClassificationConfig {
  const config = { ...DEFAULT_POSTURE_CLASSIFICATION_CONFIG, ...overrides };
  const validAngles = (limits: AngularClassificationThresholds | undefined) =>
    limits !== undefined && Number.isFinite(limits.goodMaxDegrees) && Number.isFinite(limits.warningMaxDegrees) &&
    limits.goodMaxDegrees >= 0 && limits.warningMaxDegrees > limits.goodMaxDegrees;
  const timeLimits = POSTURE_TIME_LIMITS;
  const validPersistence = (value: number) => Number.isFinite(value) &&
    value >= timeLimits.minPersistenceMs && value <= timeLimits.maxPersistenceMs;
  const distance = config.distance;
  if (!validAngles(config.neck) || !validAngles(config.shoulders) || !distance || !config.blinkRate ||
    !Object.values(distance).every(Number.isFinite) || distance.dangerBelowCm <= 0 ||
    distance.dangerBelowCm >= distance.goodMinCm || distance.goodMinCm > distance.goodMaxCm ||
    distance.goodMaxCm >= distance.dangerAboveCm ||
    !Number.isFinite(config.blinkRate.lowBelowPerMinute) || config.blinkRate.lowBelowPerMinute <= 0 ||
    !validPersistence(config.persistenceMs) || !validPersistence(config.blinkPersistenceMs) ||
    !Number.isFinite(config.cooldownMs) || config.cooldownMs < timeLimits.minCooldownMs ||
    config.cooldownMs > timeLimits.maxCooldownMs || !Number.isFinite(config.maxSampleGapMs) ||
    config.maxSampleGapMs <= 0 || config.maxSampleGapMs >= Math.min(config.persistenceMs, config.blinkPersistenceMs)) {
    throw new RangeError("Invalid posture thresholds or temporal configuration");
  }
  return Object.freeze({ ...config,
    neck: Object.freeze({ ...config.neck }),
    shoulders: Object.freeze({ ...config.shoulders }),
    distance: Object.freeze({ ...config.distance }),
    blinkRate: Object.freeze({ ...config.blinkRate }),
  });
}
