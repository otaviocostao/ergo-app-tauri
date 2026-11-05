import { PostureStatus } from "../../enums/postureStatus";
import type { ProcessedPostureFrame } from "../../types/vision";
import type { CreateSnapshotPayload } from "../../types/postureMetricSnapshot";
import type { EndSessionPayload } from "../../types/monitoringSession";
import type { PostureClassification } from "../../types/postureClassification";
import {
  DEFAULT_POSTURE_CLASSIFICATION_CONFIG,
  POSTURE_MEASUREMENT_LIMITS,
  type PostureClassificationConfig,
} from "../vision/postureClassificationConfig";
import { RingBuffer } from "./ringBuffer";

export const METRIC_WINDOW_MS = 60_000;
// 60s at up to 12 FPS: inference runs at ~11 FPS, so a full window never overwrites its own start.
export const METRIC_BUFFER_CAPACITY = 720;
// Stop attributing time to a measurement if inference is interrupted.
const MAX_FRAME_GAP_MS = 1_000;

const STATUSES = [PostureStatus.DANGER, PostureStatus.WARNING, PostureStatus.GOOD];
const emptyCounts = (): Record<PostureStatus, number> =>
  ({ [PostureStatus.GOOD]: 0, [PostureStatus.WARNING]: 0, [PostureStatus.DANGER]: 0 });

/**
 * Application heuristic over the same baseline-relative values used for classification:
 * only the excess beyond each metric's good range is penalised; unavailable metrics add nothing.
 */
export function calculateErgoScore(
  frame: Pick<ProcessedPostureFrame, "neckAngle" | "shoulderBalance" | "distanceCm">,
  config: PostureClassificationConfig = DEFAULT_POSTURE_CLASSIFICATION_CONFIG,
): number {
  const neck = frame.neckAngle === null ? 0 : Math.max(0, frame.neckAngle - config.neck.goodMaxDegrees) * 2.5;
  const shoulderDeviation = frame.shoulderBalance === null ? null
    : (POSTURE_MEASUREMENT_LIMITS.maxShoulderBalance - frame.shoulderBalance) / POSTURE_MEASUREMENT_LIMITS.shoulderBalancePointsPerDegree;
  const shoulders = shoulderDeviation === null ? 0 : Math.max(0, shoulderDeviation - config.shoulders.goodMaxDegrees) * 5;
  const distance = frame.distanceCm === null ? 0
    : Math.max(0, config.distance.goodMinCm - frame.distanceCm, frame.distanceCm - config.distance.goodMaxCm) * 2;
  return Math.max(0, Math.min(100, 100 - neck - shoulders - distance));
}

/** Scalars from a classification; null when it has no posture status (e.g. no active baseline). */
export function frameFromClassification(
  classification: PostureClassification,
  blinkCount = 0,
): ProcessedPostureFrame | null {
  const { metrics, postureStatus } = classification;
  if (postureStatus === null) return null;
  const limits = POSTURE_MEASUREMENT_LIMITS;
  const shoulderDeviation = metrics.shoulders.value;
  return {
    timestampMs: classification.timestampMs,
    neckAngle: metrics.neck.value,
    // Same conversion as the card, without display rounding.
    shoulderBalance: shoulderDeviation === null ? null
      : Math.max(0, Math.min(limits.maxShoulderBalance, limits.maxShoulderBalance - shoulderDeviation * limits.shoulderBalancePointsPerDegree)),
    distanceCm: metrics.distance.value,
    status: postureStatus,
    blinkCount,
  };
}

interface AggregationOptions {
  sessionId: string;
  onSnapshot: (payload: CreateSnapshotPayload) => void;
  startedAtMs?: number;
  startedAtEpochMs?: number;
  config?: PostureClassificationConfig;
}

export interface PresenceObservation {
  timestampMs: number;
  hasBody: boolean;
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export class MetricAggregation {
  private readonly buffer = new RingBuffer<ProcessedPostureFrame>(METRIC_BUFFER_CAPACITY);
  private readonly config: PostureClassificationConfig;
  private windowStartedAt: number;
  private readonly startedAtMs: number;
  private readonly startedAtEpochMs: number;
  private lastFrameAt: number | null = null;
  private lastAcceptedFrameAt: number | null = null;
  private firstPresenceAt: number | null = null;
  private lastPresenceAt: number | null = null;
  private hadBody = false;
  private presenceGap = false;
  // Session totals retain only aggregate scalars, including across buffer rotations.
  private totalSamples = 0;
  private totalScore = 0;
  private activeMs = 0;
  private readonly statusCounts = emptyCounts();

  constructor(private readonly options: AggregationOptions) {
    this.config = options.config ?? DEFAULT_POSTURE_CLASSIFICATION_CONFIG;
    this.startedAtMs = options.startedAtMs ?? 0;
    this.startedAtEpochMs = options.startedAtEpochMs ?? Date.now();
    this.windowStartedAt = this.startedAtMs;
  }

  get samplesCount(): number {
    return this.buffer.size;
  }

  /** Invalid frames are skipped; a lasting interruption is detected by the frame gap. */
  recordFrame(frame: ProcessedPostureFrame): void {
    if (!this.isValidFrame(frame)) return;
    if (frame.timestampMs < this.windowStartedAt ||
      (this.lastAcceptedFrameAt !== null && frame.timestampMs <= this.lastAcceptedFrameAt)) return;

    this.tick(frame.timestampMs);
    if (this.lastFrameAt !== null) this.activeMs += frame.timestampMs - this.lastFrameAt;
    this.lastFrameAt = frame.timestampMs;
    this.lastAcceptedFrameAt = frame.timestampMs;
    // Copy only scalar fields; callers cannot mutate retained measurements or attach raw data.
    this.buffer.push({
      timestampMs: frame.timestampMs,
      neckAngle: frame.neckAngle,
      shoulderBalance: frame.shoulderBalance,
      distanceCm: frame.distanceCm,
      status: frame.status,
      blinkCount: frame.blinkCount ?? 0,
    });
    this.totalSamples++;
    this.totalScore += calculateErgoScore(frame, this.config);
    this.statusCounts[frame.status]++;
  }

  /** Fixed session minutes close even with interrupted or unavailable measurements. */
  tick(now: number): void {
    if (!Number.isFinite(now) || now < this.windowStartedAt) return;
    if (this.lastFrameAt !== null && now - this.lastFrameAt > MAX_FRAME_GAP_MS) this.lastFrameAt = null;
    while (now - this.windowStartedAt >= METRIC_WINDOW_MS) {
      const end = this.windowStartedAt + METRIC_WINDOW_MS;
      const payload = this.aggregate(end);
      this.buffer.clear();
      this.windowStartedAt = end;
      this.firstPresenceAt = this.lastPresenceAt = null;
      this.hadBody = this.presenceGap = false;
      // Raw measurements are released before any asynchronous IPC begins.
      this.options.onSnapshot(payload);
    }
  }

  /** Presence evidence is independent of calibration and posture measurement availability. */
  observePresence(observation: PresenceObservation): void {
    const { timestampMs, hasBody } = observation;
    if (!Number.isFinite(timestampMs) || timestampMs < this.windowStartedAt ||
      (this.lastPresenceAt !== null && timestampMs <= this.lastPresenceAt)) return;
    this.tick(timestampMs);
    if (this.lastPresenceAt !== null && timestampMs - this.lastPresenceAt > MAX_FRAME_GAP_MS) this.presenceGap = true;
    this.firstPresenceAt ??= timestampMs;
    this.lastPresenceAt = timestampMs;
    this.hadBody ||= hasBody;
  }

  millisecondsUntilNextWindow(now: number): number {
    return Math.max(0, this.windowStartedAt + METRIC_WINDOW_MS - now);
  }

  /** Interrupt active-time continuity while preserving this minute's valid measurements. */
  pause(): void {
    this.lastFrameAt = null;
  }

  sessionSummary(): Omit<EndSessionPayload, "id" | "endedAt"> {
    const count = this.totalSamples;
    return {
      durationSeconds: Math.floor(this.activeMs / 1000),
      averageScore: count ? this.totalScore / count : 0,
      goodPosturePercentage: count ? this.statusCounts[PostureStatus.GOOD] * 100 / count : 0,
      warningPosturePercentage: count ? this.statusCounts[PostureStatus.WARNING] * 100 / count : 0,
      dangerPosturePercentage: count ? this.statusCounts[PostureStatus.DANGER] * 100 / count : 0,
    };
  }

  private isValidFrame(frame: ProcessedPostureFrame): boolean {
    const limits = POSTURE_MEASUREMENT_LIMITS;
    const optional = (value: number | null, valid: (value: number) => boolean) =>
      value === null || (Number.isFinite(value) && valid(value));
    return Number.isFinite(frame.timestampMs) && frame.timestampMs >= 0
      && optional(frame.neckAngle, value => value >= 0 && value <= limits.maxNeckDegrees)
      && optional(frame.shoulderBalance, value => value >= 0 && value <= limits.maxShoulderBalance)
      && optional(frame.distanceCm, value => value > 0)
      && STATUSES.includes(frame.status)
      && (frame.blinkCount === undefined || (Number.isInteger(frame.blinkCount) && frame.blinkCount >= 0));
  }

  private aggregate(endedAtMs: number): CreateSnapshotPayload {
    const frames = this.buffer.values();
    const fullyObservedAbsence = !this.hadBody && !this.presenceGap &&
      this.firstPresenceAt !== null && this.firstPresenceAt - this.windowStartedAt <= MAX_FRAME_GAP_MS &&
      this.lastPresenceAt !== null && endedAtMs - this.lastPresenceAt <= MAX_FRAME_GAP_MS;
    const present = (pick: (frame: ProcessedPostureFrame) => number | null) =>
      frames.map(pick).filter((value): value is number => value !== null);
    const neck = present(frame => frame.neckAngle);
    const shoulders = present(frame => frame.shoulderBalance);
    const distance = present(frame => frame.distanceCm);
    let blinks = 0, score = 0;
    const counts = emptyCounts();
    for (const frame of frames) {
      blinks += frame.blinkCount ?? 0;
      score += calculateErgoScore(frame, this.config);
      counts[frame.status]++;
    }
    // On ties prefer the more severe status, with a deterministic ordering.
    const dominantStatus = STATUSES.reduce((dominant, status) =>
      counts[status] > counts[dominant] ? status : dominant,
    );
    return {
      sessionId: this.options.sessionId,
      timestamp: new Date(this.startedAtEpochMs + Math.round(endedAtMs - this.startedAtMs)).toISOString(),
      avgNeckAngle: mean(neck),
      maxNeckAngle: neck.length ? Math.max(...neck) : null,
      avgShoulderBalance: mean(shoulders),
      minShoulderBalance: shoulders.length ? Math.min(...shoulders) : null,
      avgDistanceCm: mean(distance),
      blinkCount: blinks,
      dominantStatus: frames.length ? dominantStatus : fullyObservedAbsence ? "absent" : "unavailable",
      score: frames.length ? score / frames.length : 0,
      samplesCount: frames.length,
    };
  }
}
