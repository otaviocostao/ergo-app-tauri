/** Raw or filtered posture magnitudes, in degrees, without display rounding. */
export interface PostureAngles {
  readonly neckAngle: number;
  readonly shoulderAngle: number;
}

export interface TemporalPostureFilterConfig {
  /** Minimum signal cutoff in Hz. Lower values smooth slow motion more. */
  readonly minCutoff: number;
  /** Speed coefficient in Hz per degree/second. Zero disables adaptation. */
  readonly beta: number;
  /** Cutoff in Hz for the estimated angular velocity. */
  readonly derivativeCutoff: number;
  /** Longer gaps start a new sequence at its first valid sample. */
  readonly maxGapMs: number;
}

export const DEFAULT_TEMPORAL_POSTURE_FILTER_CONFIG: Readonly<TemporalPostureFilterConfig> = Object.freeze({
  minCutoff: 1,
  beta: 0.02,
  derivativeCutoff: 1,
  maxGapMs: 1000,
});

interface ScalarState {
  readonly value: number;
  readonly derivative: number;
}

interface FilterState {
  readonly timestampMs: number;
  readonly neck: ScalarState;
  readonly shoulder: ScalarState;
}

function smoothingFactor(cutoff: number, dtSeconds: number): number {
  return 1 / (1 + 1 / (2 * Math.PI * cutoff * dtSeconds));
}

function filterScalar(
  previous: ScalarState,
  current: number,
  dtSeconds: number,
  config: TemporalPostureFilterConfig,
): ScalarState | null {
  const derivative = (current - previous.value) / dtSeconds;
  const derivativeAlpha = smoothingFactor(config.derivativeCutoff, dtSeconds);
  const filteredDerivative = derivativeAlpha * derivative + (1 - derivativeAlpha) * previous.derivative;
  const cutoff = config.minCutoff + config.beta * Math.abs(filteredDerivative);
  const alpha = smoothingFactor(cutoff, dtSeconds);
  const value = alpha * current + (1 - alpha) * previous.value;

  // Reject numerical overflow atomically, without corrupting either channel.
  if (![derivative, filteredDerivative, cutoff, value].every(Number.isFinite)) return null;
  return { value, derivative: filteredDerivative };
}

/**
 * One Euro filtering with independent angular histories and monotonic ms input.
 * Uses the previous filtered value to estimate velocity, following the authors'
 * reference: https://gery.casiez.net/1euro/ . No camera, React or wall clock state.
 * Invalid samples return null and leave both channels and their timestamp intact.
 */
export class TemporalPostureFilter {
  private readonly config: Readonly<TemporalPostureFilterConfig>;
  private state: FilterState | null = null;

  constructor(config: Partial<TemporalPostureFilterConfig> = {}) {
    const resolved = { ...DEFAULT_TEMPORAL_POSTURE_FILTER_CONFIG, ...config };
    if (!Object.values(resolved).every(Number.isFinite) || resolved.minCutoff <= 0 ||
      resolved.derivativeCutoff <= 0 || resolved.maxGapMs <= 0 || resolved.beta < 0) {
      throw new RangeError("Cutoffs and maxGapMs must be positive finite numbers; beta must be finite and non-negative");
    }
    this.config = Object.freeze(resolved);
  }

  filter(rawAngles: PostureAngles, timestampMs: number): PostureAngles | null {
    if (![rawAngles.neckAngle, rawAngles.shoulderAngle, timestampMs].every(Number.isFinite) ||
      timestampMs < 0 || (this.state !== null && timestampMs <= this.state.timestampMs)) return null;

    let neck: ScalarState;
    let shoulder: ScalarState;
    if (this.state === null || timestampMs - this.state.timestampMs > this.config.maxGapMs) {
      neck = { value: rawAngles.neckAngle, derivative: 0 };
      shoulder = { value: rawAngles.shoulderAngle, derivative: 0 };
    } else {
      const dtSeconds = (timestampMs - this.state.timestampMs) / 1000;
      const nextNeck = filterScalar(this.state.neck, rawAngles.neckAngle, dtSeconds, this.config);
      const nextShoulder = filterScalar(this.state.shoulder, rawAngles.shoulderAngle, dtSeconds, this.config);
      if (nextNeck === null || nextShoulder === null) return null;
      neck = nextNeck;
      shoulder = nextShoulder;
    }

    this.state = { timestampMs, neck, shoulder };
    return { neckAngle: neck.value, shoulderAngle: shoulder.value };
  }

  /** The next valid sample is returned unchanged, including with a new clock. */
  reset(): void {
    this.state = null;
  }
}
