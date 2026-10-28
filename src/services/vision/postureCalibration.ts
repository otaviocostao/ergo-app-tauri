import type { IPDMeasurement } from "./ocularLandmarks";
import type { PostureAngles } from "./temporalPostureFilter";
import type { PostureCalibrationDTO } from "../../types/postureCalibration";

/** One inference, before display rounding. Never combine observations from different frames. */
export interface PostureCalibrationFrame {
  readonly timestampMs: number;
  readonly captureId: number;
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly ipd: IPDMeasurement;
  readonly rawAngles: PostureAngles;
  readonly filteredAngles: PostureAngles;
}

/** Initial engineering limits, to be evaluated with a physical webcam. */
export const POSTURE_CALIBRATION_LIMITS = Object.freeze({
  durationMs: 5000,
  minSamples: 30,
  minCoverageMs: 4000,
  maxGapMs: 500,
  maxNeckRangeDegrees: 3,
  maxShoulderRangeDegrees: 1.5,
  maxRelativeIpdRange: 0.08,
});

/** User positions themselves at this assumed distance; it is not a camera measurement. */
export const DEFAULT_REFERENCE_DISTANCE_CM = 60;

export type CalibratedBaseline = Pick<PostureCalibrationDTO,
  "baselineNeckAngle" | "baselineShoulderBalance" | "baselineDistanceCm" | "baselineEyeDistancePx">;

export type CalibrationFailure = "insufficient-data" | "invalid-frame" | "capture-changed" |
  "unstable-posture" | "unstable-ipd";

export type CalibrationEvaluation =
  | { readonly ok: false; readonly reason: CalibrationFailure }
  | { readonly ok: true; readonly baseline: CalibratedBaseline; readonly frameWidth: number };

function validAngles(angles: PostureAngles): boolean {
  return Number.isFinite(angles.neckAngle) && angles.neckAngle >= 0 && angles.neckAngle <= 180 &&
    Number.isFinite(angles.shoulderAngle) && angles.shoulderAngle >= 0 && angles.shoulderAngle <= 90;
}

/** Checks coverage and raw motion before averaging the unrounded, filtered posture. */
export function evaluatePostureCalibration(
  frames: readonly PostureCalibrationFrame[],
  startedAtMs: number,
  finishedAtMs: number,
): CalibrationEvaluation {
  const limits = POSTURE_CALIBRATION_LIMITS;
  if (!Number.isFinite(startedAtMs) || startedAtMs < 0 || !Number.isFinite(finishedAtMs) ||
    finishedAtMs - startedAtMs < limits.durationMs || frames.length < limits.minSamples) {
    return { ok: false, reason: "insufficient-data" };
  }

  const first = frames[0], last = frames[frames.length - 1];
  const deadlineMs = startedAtMs + limits.durationMs;
  for (const [index, frame] of frames.entries()) {
    if (![frame.timestampMs, frame.captureId, frame.frameWidth, frame.frameHeight, frame.ipd.distancePx]
      .every(Number.isFinite) || frame.timestampMs < startedAtMs || frame.timestampMs > deadlineMs ||
      frame.frameWidth <= 0 || frame.frameHeight <= 0 || frame.ipd.distancePx <= 0 ||
      !Number.isInteger(frame.captureId) || frame.captureId < 0 ||
      !["iris", "eye-corners"].includes(frame.ipd.source) ||
      !validAngles(frame.rawAngles) || !validAngles(frame.filteredAngles) ||
      (index > 0 && frame.timestampMs <= frames[index - 1].timestampMs)) {
      return { ok: false, reason: "invalid-frame" };
    }
    if (frame.captureId !== first.captureId || frame.frameWidth !== first.frameWidth ||
      frame.frameHeight !== first.frameHeight || frame.ipd.source !== first.ipd.source) {
      return { ok: false, reason: "capture-changed" };
    }
    if (index > 0 && frame.timestampMs - frames[index - 1].timestampMs > limits.maxGapMs) {
      return { ok: false, reason: "insufficient-data" };
    }
  }

  if (first.timestampMs - startedAtMs > limits.maxGapMs || deadlineMs - last.timestampMs > limits.maxGapMs ||
    last.timestampMs - first.timestampMs < limits.minCoverageMs) {
    return { ok: false, reason: "insufficient-data" };
  }

  const range = (values: readonly number[]) => Math.max(...values) - Math.min(...values);
  if (range(frames.map(frame => frame.rawAngles.neckAngle)) > limits.maxNeckRangeDegrees ||
    range(frames.map(frame => frame.rawAngles.shoulderAngle)) > limits.maxShoulderRangeDegrees) {
    return { ok: false, reason: "unstable-posture" };
  }

  const mean = (values: readonly number[]) => values.reduce((average, value, index) => average + (value - average) / (index + 1), 0);
  const ipds = frames.map(frame => frame.ipd.distancePx);
  const meanIpd = mean(ipds);
  if (range(ipds) / meanIpd > limits.maxRelativeIpdRange) {
    return { ok: false, reason: "unstable-ipd" };
  }

  return {
    ok: true,
    frameWidth: first.frameWidth,
    baseline: {
      baselineNeckAngle: mean(frames.map(frame => frame.filteredAngles.neckAngle)),
      baselineShoulderBalance: mean(frames.map(frame => Math.max(0, 100 - frame.filteredAngles.shoulderAngle * 10))),
      baselineDistanceCm: DEFAULT_REFERENCE_DISTANCE_CM,
      baselineEyeDistancePx: meanIpd,
    },
  };
}
