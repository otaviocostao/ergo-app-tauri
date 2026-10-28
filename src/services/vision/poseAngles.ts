import { calculateNeckAngle, calculateShoulderAngle, type Point2D } from "./biomechanics";
import { POSE_LANDMARK_INDEX, type LandmarkPoint } from "./poseDetector";

const MIN_CONFIDENCE = 0.35;

export interface PoseAngles {
  neckAngle: number;
  /** Raw inclination in degrees, before conversion to the display percentage. */
  shoulderAngle: number;
  shoulderBalance: number;
  /** Normalized midpoint used by both the neck calculation and the overlay. */
  headCenter: Point2D;
}

function isUsable(point: LandmarkPoint | undefined): point is LandmarkPoint {
  return point !== undefined &&
    Number.isFinite(point.x) && Number.isFinite(point.y) &&
    Number.isFinite(point.visibility ?? 1) && (point.visibility ?? 1) > MIN_CONFIDENCE &&
    Number.isFinite(point.presence ?? 1) && (point.presence ?? 1) > MIN_CONFIDENCE;
}

function midpoint(first: Point2D, second: Point2D): Point2D {
  return { x: first.x / 2 + second.x / 2, y: first.y / 2 + second.y / 2 };
}

/**
 * Adapts normalized MediaPipe landmarks to image-plane geometry in video pixels.
 * Uses the midpoint of both visible ears in a front view, or the visible ear in
 * a side view. Missing/occluded points and invalid frame sizes yield null.
 * The raw 2D neck angle is not a calibrated measurement of sagittal flexion.
 */
export function calculatePoseAngles(
  landmarks: readonly LandmarkPoint[],
  frameWidth: number,
  frameHeight: number,
): PoseAngles | null {
  if (!Number.isFinite(frameWidth) || !Number.isFinite(frameHeight) || frameWidth <= 0 || frameHeight <= 0) {
    return null;
  }

  const nose = landmarks[POSE_LANDMARK_INDEX.NOSE];
  const leftShoulder = landmarks[POSE_LANDMARK_INDEX.LEFT_SHOULDER];
  const rightShoulder = landmarks[POSE_LANDMARK_INDEX.RIGHT_SHOULDER];
  const leftEar = landmarks[POSE_LANDMARK_INDEX.LEFT_EAR];
  const rightEar = landmarks[POSE_LANDMARK_INDEX.RIGHT_EAR];

  if (!isUsable(nose) || !isUsable(leftShoulder) || !isUsable(rightShoulder)) return null;

  const ear = isUsable(leftEar)
    ? isUsable(rightEar) ? midpoint(leftEar, rightEar) : leftEar
    : isUsable(rightEar) ? rightEar : null;
  if (!ear) return null;

  const pixels = (point: Point2D): Point2D => ({ x: point.x * frameWidth, y: point.y * frameHeight });
  const neckAngle = calculateNeckAngle(pixels(nose), pixels(ear), pixels(midpoint(leftShoulder, rightShoulder)));
  const shoulderAngle = calculateShoulderAngle(pixels(leftShoulder), pixels(rightShoulder));
  if (neckAngle === null || shoulderAngle === null) return null;

  const shoulderBalance = Math.max(0, Math.min(100, 100 - shoulderAngle * 10));
  return { neckAngle, shoulderAngle, shoulderBalance, headCenter: midpoint(nose, ear) };
}
