import { PostureStatus } from "../../enums/postureStatus";
import type { CreateAlertPayload } from "../../types/postureAlert";
import type { PostureAlertCondition, PostureClassification, PostureMetric } from "../../types/postureClassification";
import { DEFAULT_POSTURE_CLASSIFICATION_CONFIG, POSTURE_METRICS } from "../vision/postureClassificationConfig";

export const POSTURE_ALERT_TYPES: Readonly<Record<PostureMetric, string>> = Object.freeze({
  neck: "neck_posture",
  shoulders: "shoulder_alignment",
  distance: "screen_distance",
  "blink-rate": "low_blink_rate",
});

const ALERT_MESSAGES: Readonly<Record<PostureMetric, string>> = Object.freeze({
  neck: "Desvio persistente do pescoço em relação à postura base.",
  shoulders: "Desalinhamento persistente dos ombros em relação à postura base.",
  distance: "Distância da tela fora da faixa recomendada de forma persistente.",
  "blink-rate": "Frequência de piscadas reduzida de forma persistente.",
});

type AlertLevel = PostureAlertCondition["level"];

export interface AlertResolution {
  resolvedAt: string;
  durationSeconds: number;
  severity: AlertLevel;
}

interface AlertEpisodeOptions {
  sessionId: string;
  onAlert: (metric: PostureMetric, payload: CreateAlertPayload) => void;
  onAlertResolved: (metric: PostureMetric, resolution: AlertResolution) => void;
  maxSampleGapMs?: number;
}

interface OpenEpisode {
  startedAtMs: number;
  severity: AlertLevel;
}

const isDeviation = (status: PostureStatus | null): status is AlertLevel =>
  status === PostureStatus.WARNING || status === PostureStatus.DANGER;

/**
 * Persists one alert per continuous deviation of a metric. The shared PostureHysteresis
 * decides when a deviation is confirmed; this class tracks the whole episode so its final
 * duration and highest severity can be recorded. A warning→danger escalation stays one episode.
 */
export class PostureAlertEpisodes {
  private readonly maxSampleGapMs: number;
  private readonly deviatedSince = new Map<PostureMetric, number>();
  private readonly lastDeviatedAt = new Map<PostureMetric, number>();
  private readonly open = new Map<PostureMetric, OpenEpisode>();
  private lastTimestampMs: number | null = null;
  private captureId: number | null = null;
  private baselineId: string | null = null;

  constructor(private readonly options: AlertEpisodeOptions) {
    this.maxSampleGapMs = options.maxSampleGapMs ?? DEFAULT_POSTURE_CLASSIFICATION_CONFIG.maxSampleGapMs;
  }

  /** Call once per classification with the hysteresis `alerts` of the same update. */
  update(classification: PostureClassification, confirmed: readonly PostureAlertCondition[]): void {
    const { timestampMs, captureId, baselineId } = classification;
    if (!Number.isFinite(timestampMs) || (this.lastTimestampMs !== null && timestampMs <= this.lastTimestampMs)) return;
    // Same continuity rules as the hysteresis: a gap or a new capture/baseline ends every episode.
    if (this.lastTimestampMs !== null && (timestampMs - this.lastTimestampMs > this.maxSampleGapMs ||
      captureId !== this.captureId || baselineId !== this.baselineId)) this.pause();
    this.lastTimestampMs = timestampMs;
    this.captureId = captureId;
    this.baselineId = baselineId;

    for (const metric of POSTURE_METRICS) {
      const { value, status } = classification.metrics[metric];
      if (value === null || !isDeviation(status)) {
        // Recovery ends the episode at the first non-deviated sample.
        this.end(metric, timestampMs);
        continue;
      }
      if (!this.deviatedSince.has(metric)) this.deviatedSince.set(metric, timestampMs);
      this.lastDeviatedAt.set(metric, timestampMs);
      const episode = this.open.get(metric);
      if (episode && status === PostureStatus.DANGER) episode.severity = PostureStatus.DANGER;
    }

    for (const condition of confirmed) {
      if (this.open.has(condition.metric)) continue;
      const startedAtMs = Math.min(this.deviatedSince.get(condition.metric) ?? condition.startedAtMs, condition.startedAtMs);
      const durationMs = timestampMs - startedAtMs;
      this.open.set(condition.metric, { startedAtMs, severity: condition.level });
      this.options.onAlert(condition.metric, {
        sessionId: this.options.sessionId,
        // The alert describes the whole episode, so it is stamped at its start.
        timestamp: new Date(Date.now() - durationMs).toISOString(),
        alertType: POSTURE_ALERT_TYPES[condition.metric],
        severity: condition.level,
        durationSeconds: Math.floor(durationMs / 1000),
        message: ALERT_MESSAGES[condition.metric],
      });
    }
  }

  /** Pause, absence or invalid capture: open episodes end at their last deviated sample. */
  pause(): void {
    for (const metric of POSTURE_METRICS) this.end(metric);
    this.lastTimestampMs = null;
    this.captureId = null;
    this.baselineId = null;
  }

  private end(metric: PostureMetric, endedAtMs = this.lastDeviatedAt.get(metric)): void {
    const episode = this.open.get(metric);
    if (episode && endedAtMs !== undefined) {
      this.options.onAlertResolved(metric, {
        resolvedAt: new Date().toISOString(),
        // Frames arrive every ~90ms, so round to the nearest second rather than truncating.
        durationSeconds: Math.round((endedAtMs - episode.startedAtMs) / 1000),
        severity: episode.severity,
      });
    }
    this.open.delete(metric);
    this.deviatedSince.delete(metric);
    this.lastDeviatedAt.delete(metric);
  }
}
