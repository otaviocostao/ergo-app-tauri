import { calculateMeanEAR, type Point2D } from "./biomechanics";
import { CALIBRATION_IPD_RATIO_LIMITS, MIN_OCULAR_CONFIDENCE, MIN_OCULAR_SPAN_PX } from "./ocularConfig";
import { FACE_EAR_INDEX, FACE_LANDMARK_INDEX, type LandmarkPoint } from "./poseDetector";

/**
 * Converts normalized x/y to original-frame px, correcting aspect ratio.
 * Returns null for missing/non-finite coordinates, invalid sizes or overflow.
 */
export function normalizedPointToPixels(
  point: Point2D | null | undefined,
  frameWidth: number,
  frameHeight: number,
): Point2D | null {
  if (!point || ![point.x, point.y, frameWidth, frameHeight].every(Number.isFinite) ||
    frameWidth <= 0 || frameHeight <= 0) return null;
  const pixels = { x: point.x * frameWidth, y: point.y * frameHeight };
  return Number.isFinite(pixels.x) && Number.isFinite(pixels.y) ? pixels : null;
}

function usablePixels(point: LandmarkPoint | undefined, width: number, height: number): Point2D | null {
  if (!point || !Number.isFinite(point.visibility ?? 1) || !Number.isFinite(point.presence ?? 1) ||
    (point.visibility ?? 1) <= MIN_OCULAR_CONFIDENCE || (point.presence ?? 1) <= MIN_OCULAR_CONFIDENCE) return null;
  return normalizedPointToPixels(point, width, height);
}

/** Six P1..P6 points in px for the subject's anatomical eye, or null if unusable. */
export function getEyeLandmarksInPixels(
  landmarks: readonly LandmarkPoint[],
  frameWidth: number,
  frameHeight: number,
  eye: "left" | "right",
): readonly Point2D[] | null {
  const indices = eye === "left" ? FACE_EAR_INDEX.LEFT_EYE : FACE_EAR_INDEX.RIGHT_EYE;
  const points = indices.map(index => usablePixels(landmarks[index], frameWidth, frameHeight));
  return points.every((point): point is Point2D => point !== null) ? points : null;
}

/** Mean EAR from normalized FaceLandmarker points, tolerating one unusable eye. */
export function calculateFaceEAR(
  landmarks: readonly LandmarkPoint[],
  frameWidth: number,
  frameHeight: number,
): number | null {
  return calculateMeanEAR(
    getEyeLandmarksInPixels(landmarks, frameWidth, frameHeight, "left"),
    getEyeLandmarksInPixels(landmarks, frameWidth, frameHeight, "right"),
  );
}

/** IPD method must match the method used during calibration. */
export type IPDSource = "iris" | "eye-corners";

/** Separation in original-frame pixels, with the method needed for calibration. */
export interface IPDMeasurement {
  readonly distancePx: number;
  readonly source: IPDSource;
}

/**
 * Prefers iris centers 468/473; falls back to the midpoint of each pair of
 * eye corners (an IPD proxy, not anatomical pupil centers). Never mixes methods
 * between eyes. Pass source to require the calibration's method without fallback.
 * Uses real frame width/height, never canvas/CSS size. Returns null if unusable.
 */
export function calculateInterpupillaryDistance(
  landmarks: readonly LandmarkPoint[],
  frameWidth: number,
  frameHeight: number,
  source?: IPDSource,
): IPDMeasurement | null {
  const pixel = (index: number) => usablePixels(landmarks[index], frameWidth, frameHeight);
  const measure = (a: Point2D | null, b: Point2D | null, method: IPDSource): IPDMeasurement | null => {
    if (!a || !b) return null;
    const distancePx = Math.hypot(a.x - b.x, a.y - b.y);
    return Number.isFinite(distancePx) && distancePx > MIN_OCULAR_SPAN_PX ? { distancePx, source: method } : null;
  };

  if (source !== "eye-corners") {
    const iris = measure(pixel(FACE_LANDMARK_INDEX.RIGHT_IRIS_CENTER), pixel(FACE_LANDMARK_INDEX.LEFT_IRIS_CENTER), "iris");
    if (iris || source === "iris") return iris;
  }

  const center = (eye: typeof FACE_LANDMARK_INDEX.LEFT_EYE | typeof FACE_LANDMARK_INDEX.RIGHT_EYE) => {
    const a = pixel(eye.OUTER), b = pixel(eye.INNER);
    return a && b ? { x: a.x / 2 + b.x / 2, y: a.y / 2 + b.y / 2 } : null;
  };
  return measure(center(FACE_LANDMARK_INDEX.LEFT_EYE), center(FACE_LANDMARK_INDEX.RIGHT_EYE), "eye-corners");
}

export type IPDCalibrationValidationResult = "valid" | "too-close" | "too-far";

/**
 * Validates whether the measured interpupillary distance (in pixels) during calibration
 * conforms to human optical plausibility given the camera frame width.
 * Prevents saving calibrations where the user is sitting too close (< 40cm) or too far (> 90cm).
 */
export function validateCalibrationIPD(
  ipdPx: number,
  frameWidth: number,
  limits = CALIBRATION_IPD_RATIO_LIMITS,
): IPDCalibrationValidationResult {
  if (!Number.isFinite(ipdPx) || !Number.isFinite(frameWidth) || frameWidth <= 0 || ipdPx <= 0) return "too-far";
  const ratio = ipdPx / frameWidth;
  if (ratio > limits.maxRatio) return "too-close";
  if (ratio < limits.minRatio) return "too-far";
  return "valid";
}
