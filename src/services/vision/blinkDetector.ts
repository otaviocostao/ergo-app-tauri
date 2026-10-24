import { DEFAULT_BLINK_CONFIG, type BlinkDetectorConfig } from "./ocularConfig";

/** Timestamp-driven eye state. Unknown requires a confirmed reopening to arm. */
export interface BlinkState {
  readonly phase: "unknown" | "open" | "closed" | "prolonged";
  readonly lastTimestampMs: number | null;
  readonly closedAtMs: number | null;
}

/** A prolonged-closure event is emitted once, independently of normal blinks. */
export interface BlinkUpdate {
  readonly state: BlinkState;
  readonly event: "blink" | "prolonged-closure" | null;
  readonly closedDurationMs: number | null;
  /** True only when this sample continues an observed interval without a gap. */
  readonly continuous: boolean;
}

/** Fresh unarmed state; no clocks, timers or side effects. */
export function createBlinkState(): BlinkState {
  return { phase: "unknown", lastTimestampMs: null, closedAtMs: null };
}

/**
 * Pure transition using monotonic timestamps in ms and raw dimensionless EAR.
 * Closes below closeThreshold and reopens at/above reopenThreshold. Durations
 * inside [minClosedMs,maxClosedMs] produce one blink on reopening. Longer
 * closures emit once as soon as observed beyond maxClosedMs, never as a blink.
 * Missing/invalid EAR, non-increasing time and gaps discard pending closures.
 * Returns null for invalid configuration; input state is never mutated.
 */
export function updateBlinkState(
  state: BlinkState,
  ear: number | null,
  timestampMs: number,
  config: Readonly<BlinkDetectorConfig> = DEFAULT_BLINK_CONFIG,
): BlinkUpdate | null {
  if (!Object.values(config).every(Number.isFinite) || config.closeThreshold <= 0 ||
    config.reopenThreshold <= config.closeThreshold || config.minClosedMs <= 0 ||
    config.maxClosedMs < config.minClosedMs || config.maxGapMs <= 0) return null;

  const validTime = Number.isFinite(timestampMs) && timestampMs >= 0 &&
    (state.lastTimestampMs === null || timestampMs > state.lastTimestampMs);
  const validEAR = ear !== null && Number.isFinite(ear) && ear >= 0;
  const unknown: BlinkState = {
    phase: "unknown", closedAtMs: null,
    lastTimestampMs: validTime ? timestampMs : state.lastTimestampMs,
  };
  if (!validTime || !validEAR) {
    return { state: unknown, event: null, closedDurationMs: null, continuous: false };
  }

  const continuous = state.phase !== "unknown" && state.lastTimestampMs !== null &&
    timestampMs - state.lastTimestampMs <= config.maxGapMs;
  let phase: BlinkState["phase"] = continuous ? state.phase : "unknown";
  let closedAtMs = continuous ? state.closedAtMs : null;
  let event: BlinkUpdate["event"] = null;
  let duration: number | null = null;

  if (phase === "unknown") {
    if (ear >= config.reopenThreshold) phase = "open";
  } else if (phase === "open") {
    if (ear < config.closeThreshold) {
      phase = "closed"; closedAtMs = timestampMs; duration = 0;
    }
  } else if (closedAtMs !== null) {
    duration = timestampMs - closedAtMs;
    if (phase === "closed" && duration > config.maxClosedMs) {
      phase = "prolonged"; event = "prolonged-closure";
    }
    if (ear >= config.reopenThreshold) {
      if (phase === "closed" && duration >= config.minClosedMs) event = "blink";
      phase = "open"; closedAtMs = null;
    }
  }

  return { state: { phase, lastTimestampMs: timestampMs, closedAtMs }, event, closedDurationMs: duration, continuous };
}
