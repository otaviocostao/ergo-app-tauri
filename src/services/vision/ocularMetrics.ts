import { calculateHeadPitch, clampScreenDistance, estimateScreenDistance, smoothScreenDistance, type FaceTransformationMatrix } from "./biomechanics";
import { createBlinkState, updateBlinkState, type BlinkState, type BlinkUpdate } from "./blinkDetector";
import { classifyBlinkRate, createBlinkRateState, updateBlinkRate, type BlinkRateState, type BlinkRateMeasurement, type VisualFatigueLevel } from "./blinkRate";
import { DEFAULT_DISTANCE_CONFIG, type ScreenDistanceBaseline } from "./ocularConfig";
import { calculateFaceEAR, calculateInterpupillaryDistance, type IPDMeasurement, type IPDSource } from "./ocularLandmarks";
import type { VisionDetectionResult } from "./poseDetector";

/**
 * Runtime calibration context. Existing persisted fields are reused; callers
 * must also know the capture resolution and IPD method and invalidate on camera
 * or optics changes. The current DTO does not persist this extra context.
 */
export interface ScreenDistanceReference extends ScreenDistanceBaseline {
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly source: IPDSource;
}

/** Ocular temporal state is isolated from React and from body-pose tracking. */
export interface OcularMetricsState {
  readonly blink: BlinkState;
  readonly rate: BlinkRateState;
  readonly previousDistanceCm: number | null;
  readonly reference: ScreenDistanceReference | null;
}

/** Per-frame measurements; null values must be rendered as unavailable. */
export interface OcularMetrics {
  readonly available: boolean;
  readonly ear: number | null;
  readonly ipd: IPDMeasurement | null;
  readonly rawDistanceCm: number | null;
  readonly distanceCm: number | null;
  readonly blinkEvent: BlinkUpdate["event"];
  readonly eyeState: BlinkState["phase"];
  readonly blinkRate: BlinkRateMeasurement;
  readonly visualFatigue: VisualFatigueLevel | null;
  readonly frameWidth?: number;
  readonly frameHeight?: number;
}

/** Fresh temporal state; use on pause, camera changes, mute and hardware loss. */
export function createOcularMetricsState(): OcularMetricsState {
  return { blink: createBlinkState(), rate: createBlinkRateState(), previousDistanceCm: null, reference: null };
}

/**
 * Independent quality gate: reuses validated pitch and extracts yaw from the
 * same column-major rotation. Rejects either rotation above the configurable
 * degree limit; roll alone does not change the 2D interpupillary span.
 */
export function isScreenDistancePoseUsable(
  matrix: FaceTransformationMatrix | null | undefined,
  maxRotationDegrees: number = DEFAULT_DISTANCE_CONFIG.maxHeadRotationDegrees,
): boolean {
  const pitch = calculateHeadPitch(matrix);
  if (!matrix || pitch === null || !Number.isFinite(maxRotationDegrees) || maxRotationDegrees < 0 || maxRotationDegrees >= 90) return false;
  const m = matrix.data;
  const yaw = Math.atan2(-m[2], Math.hypot(m[0], m[1])) * 180 / Math.PI;
  return Math.abs(pitch) <= maxRotationDegrees && Math.abs(yaw) <= maxRotationDegrees;
}

/**
 * Pure per-inference adapter using detection.timestamp (monotonic ms).
 * Face absence immediately invalidates pending blinks and distance; body-pose
 * absence does not stop ocular tracking. Distance needs matching calibration
 * method/resolution and frontal head pose, and separately applies clamp/EMA.
 * Returns null for invalid/non-increasing timestamps without mutating inputs.
 */
export function updateOcularMetrics(
  state: OcularMetricsState,
  detection: Pick<VisionDetectionResult, "hasFace" | "faceLandmarks" | "faceTransformationMatrix" | "timestamp">,
  frameWidth: number,
  frameHeight: number,
  reference: ScreenDistanceReference | null = null,
): { readonly state: OcularMetricsState; readonly metrics: OcularMetrics } | null {
  const landmarks = detection.hasFace ? detection.faceLandmarks : null;
  const ear = landmarks ? calculateFaceEAR(landmarks, frameWidth, frameHeight) : null;
  const blink = updateBlinkState(state.blink, ear, detection.timestamp);
  if (!blink) return null;
  const available = ear !== null && blink.state.phase !== "unknown";
  const rate = updateBlinkRate(state.rate, detection.timestamp, available, blink.event === "blink");
  if (!rate) return null;

  const ipd = landmarks ? calculateInterpupillaryDistance(landmarks, frameWidth, frameHeight, reference?.source) : null;
  const rawDistanceCm = ipd && reference && reference.frameWidth === frameWidth && reference.frameHeight === frameHeight &&
    isScreenDistancePoseUsable(detection.faceTransformationMatrix)
    ? estimateScreenDistance(ipd.distancePx, reference) : null;
  const sameReference = reference !== null && state.reference !== null &&
    reference.baselineDistanceCm === state.reference.baselineDistanceCm &&
    reference.baselineEyeDistancePx === state.reference.baselineEyeDistancePx &&
    reference.frameWidth === state.reference.frameWidth && reference.frameHeight === state.reference.frameHeight &&
    reference.source === state.reference.source;
  const clamped = rawDistanceCm === null ? null : clampScreenDistance(rawDistanceCm);
  const distanceCm = clamped === null ? null : smoothScreenDistance(clamped,
    blink.continuous && sameReference ? state.previousDistanceCm : null);

  return {
    state: { blink: blink.state, rate: rate.state, previousDistanceCm: distanceCm, reference },
    metrics: {
      available, ear, ipd, rawDistanceCm, distanceCm,
      blinkEvent: blink.event, eyeState: blink.state.phase, blinkRate: rate.measurement,
      visualFatigue: available ? classifyBlinkRate(rate.measurement.blinksPerMinute) : null,
      frameWidth, frameHeight,
    },
  };
}
