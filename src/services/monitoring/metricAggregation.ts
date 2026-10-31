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
  config?: PostureClassificationConfig;
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export class MetricAggregation {
  private readonly buffer = new RingBuffer<ProcessedPostureFrame>(METRIC_BUFFER_CAPACITY);
  private readonly config: PostureClassificationConfig;
  private windowStartedAt: number | null = null;
  private lastFrameAt: number | null = null;
  // Session totals retain only aggregate scalars, including across buffer rotations.
  private totalSamples = 0;
  private totalScore = 0;
  private activeMs = 0;
  private readonly statusCounts = emptyCounts();

  constructor(private readonly options: AggregationOptions) {
    this.config = options.config ?? DEFAULT_POSTURE_CLASSIFICATION_CONFIG;
  }

  get samplesCount(): number {
    return this.buffer.size;
  }

  /** Invalid frames are skipped; a lasting interruption is detected by the frame gap. */
  recordFrame(frame: ProcessedPostureFrame): void {
    if (!this.isValidFrame(frame)) return;
    if (this.lastFrameAt !== null && frame.timestampMs <= this.lastFrameAt) return;

    this.tick(frame.timestampMs);
    if (this.lastFrameAt !== null) this.activeMs += frame.timestampMs - this.lastFrameAt;
    this.lastFrameAt = frame.timestampMs;
    this.windowStartedAt ??= frame.timestampMs;
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

  /** Called by a timer as well as inference, so a minute closes even between frames. */
  tick(now: number): void {
    if (this.lastFrameAt === null || now < this.lastFrameAt) return;
    if (now - this.lastFrameAt > MAX_FRAME_GAP_MS) {
      this.pause();
      return;
    }
    if (this.windowStartedAt !== null && now - this.windowStartedAt >= METRIC_WINDOW_MS) {
      const payload = this.aggregate();
      this.buffer.clear();
      this.windowStartedAt += METRIC_WINDOW_MS;
      // Raw measurements are released before any asynchronous IPC begins.
      if (payload) this.options.onSnapshot(payload);
    }
  }

  /** Incomplete windows are discarded on absence, occlusion, calibration or pause. */
  pause(): void {
    this.buffer.clear();
    this.windowStartedAt = null;
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

  private aggregate(): CreateSnapshotPayload | null {
    const frames = this.buffer.values();
    if (!frames.length) return null;
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
      timestamp: new Date().toISOString(),
      avgNeckAngle: mean(neck),
      maxNeckAngle: neck.length ? Math.max(...neck) : null,
      avgShoulderBalance: mean(shoulders),
      minShoulderBalance: shoulders.length ? Math.min(...shoulders) : null,
      avgDistanceCm: mean(distance),
      blinkCount: blinks,
      dominantStatus,
      score: score / frames.length,
      samplesCount: frames.length,
    };
  }
}
