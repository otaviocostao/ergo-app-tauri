import { PostureStatus } from "../../enums/postureStatus";
import type {
  PostureAlertCondition, PostureClassification, PostureHysteresisResult, PostureMetric,
} from "../../types/postureClassification";
import { createPostureClassificationConfig, POSTURE_METRICS, type PostureClassificationConfig } from "./postureClassificationConfig";

interface PendingCondition {
  readonly level: PostureAlertCondition["level"];
  readonly startedAtMs: number;
  emitted: boolean;
}

/** One transition event per sustained level. Timestamps are injected monotonic ms. */
export class PostureHysteresis {
  private readonly config: PostureClassificationConfig;
  private readonly pending = new Map<PostureMetric, PendingCondition>();
  private lastTimestampMs: number | null = null;
  private captureId: number | null = null;
  private baselineId: string | null = null;

  constructor(config: Partial<PostureClassificationConfig> = {}) {
    this.config = createPostureClassificationConfig(config);
  }

  update(classification: PostureClassification): PostureHysteresisResult {
    const { timestampMs, captureId, baselineId } = classification;
    const alerts: PostureAlertCondition[] = [];
    const sustained: PostureAlertCondition[] = [];
    if (!Number.isFinite(timestampMs) || timestampMs < 0 ||
      !Number.isInteger(captureId) || captureId < 0 ||
      (this.lastTimestampMs !== null && timestampMs <= this.lastTimestampMs)) return { alerts, sustained };

    if (this.lastTimestampMs !== null && (timestampMs - this.lastTimestampMs > this.config.maxSampleGapMs ||
      captureId !== this.captureId || baselineId !== this.baselineId)) this.pending.clear();
    this.lastTimestampMs = timestampMs;
    this.captureId = captureId;
    this.baselineId = baselineId;

    for (const metric of POSTURE_METRICS) {
      const measurement = classification.metrics[metric];
      const level = measurement.status;
      // Attention also counts as poor posture, but never inherits a danger timer.
      if (measurement.value === null || !Number.isFinite(measurement.value) ||
        (level !== PostureStatus.WARNING && level !== PostureStatus.DANGER)) {
        this.pending.delete(metric);
        continue;
      }
      const previous = this.pending.get(metric);
      if (!previous || previous.level !== level) {
        this.pending.set(metric, { level, startedAtMs: timestampMs, emitted: false });
        continue;
      }
      const durationMs = timestampMs - previous.startedAtMs;
      const requiredMs = metric === "blink-rate" ? this.config.blinkPersistenceMs : this.config.persistenceMs;
      if (durationMs > requiredMs) {
        const condition = { metric, level, startedAtMs: previous.startedAtMs, durationMs };
        sustained.push(condition);
        if (!previous.emitted) {
          alerts.push(condition);
          previous.emitted = true;
        }
      }
    }
    return { alerts, sustained };
  }

  /** Pause/invalid capture must not preserve evidence of continuous poor posture. */
  resetContinuity(): void {
    this.pending.clear();
    this.lastTimestampMs = null;
    this.captureId = null;
    this.baselineId = null;
  }
}
