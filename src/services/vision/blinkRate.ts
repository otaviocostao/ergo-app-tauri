import { DEFAULT_BLINK_CONFIG, DEFAULT_BLINK_RATE_CONFIG } from "./ocularConfig";

/** Rolling time window, warm-up and maximum sample gap, all in ms. */
export interface BlinkRateConfig {
  readonly windowMs: number;
  readonly minObservedMs: number;
  readonly maxGapMs: number;
}

/** Only observed intervals and blink times inside the rolling window are kept. */
export interface BlinkRateState {
  readonly lastTimestampMs: number | null;
  readonly lastSampleAvailable: boolean;
  readonly intervals: readonly { readonly startMs: number; readonly endMs: number }[];
  readonly blinkTimestampsMs: readonly number[];
}

/** A null rate explicitly marks insufficient observed data during warm-up. */
export interface BlinkRateMeasurement {
  readonly blinkCount: number;
  readonly observedMs: number;
  readonly blinksPerMinute: number | null;
  readonly isWarmingUp: boolean;
}

/** State plus a measurement normalized by actual observed time, never wall time. */
export interface BlinkRateUpdate {
  readonly state: BlinkRateState;
  readonly measurement: BlinkRateMeasurement;
}

/** Empty bounded-history accumulator with no implicit clock. */
export function createBlinkRateState(): BlinkRateState {
  return { lastTimestampMs: null, lastSampleAvailable: false, intervals: [], blinkTimestampsMs: [] };
}

/**
 * Pure rolling-window update, using monotonic ms. Counts an interval only when
 * both endpoints are usable and their separation is <= maxGapMs. Missing face,
 * invalid EAR and long gaps must be reported as unavailable; no absence time
 * enters the denominator. Blinks at the exact left window boundary expire.
 * Before minObservedMs, the rate is null; afterwards count * 60000 / observedMs.
 * Returns null for invalid configuration or non-increasing/invalid timestamps.
 */
export function updateBlinkRate(
  state: BlinkRateState,
  timestampMs: number,
  available: boolean,
  blinkOccurred: boolean,
  config: Readonly<BlinkRateConfig> = { ...DEFAULT_BLINK_RATE_CONFIG, maxGapMs: DEFAULT_BLINK_CONFIG.maxGapMs },
): BlinkRateUpdate | null {
  if (![timestampMs, config.windowMs, config.minObservedMs, config.maxGapMs].every(Number.isFinite) ||
    timestampMs < 0 || config.windowMs <= 0 || config.minObservedMs <= 0 ||
    config.minObservedMs > config.windowMs || config.maxGapMs <= 0 ||
    (state.lastTimestampMs !== null && timestampMs <= state.lastTimestampMs)) return null;

  const cutoff = timestampMs - config.windowMs;
  const intervals = state.intervals.filter(interval => interval.endMs > cutoff)
    .map(interval => ({ startMs: Math.max(cutoff, interval.startMs), endMs: interval.endMs }));
  const continuous = available && state.lastSampleAvailable && state.lastTimestampMs !== null &&
    timestampMs - state.lastTimestampMs <= config.maxGapMs;
  if (continuous && state.lastTimestampMs !== null) {
    const startMs = Math.max(cutoff, state.lastTimestampMs);
    const last = intervals[intervals.length - 1];
    if (last && last.endMs === startMs) last.endMs = timestampMs;
    else intervals.push({ startMs, endMs: timestampMs });
  }
  const blinkTimestampsMs = state.blinkTimestampsMs.filter(time => time > cutoff);
  if (continuous && blinkOccurred) blinkTimestampsMs.push(timestampMs);
  const observedMs = intervals.reduce((total, interval) => total + interval.endMs - interval.startMs, 0);
  const isWarmingUp = observedMs < config.minObservedMs;

  return {
    state: { lastTimestampMs: timestampMs, lastSampleAvailable: available, intervals, blinkTimestampsMs },
    measurement: {
      blinkCount: blinkTimestampsMs.length, observedMs, isWarmingUp,
      blinksPerMinute: isWarmingUp ? null : blinkTimestampsMs.length * 60_000 / observedMs,
    },
  };
}
