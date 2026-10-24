import { calculateMeanEAR, type Point2D } from "./biomechanics";
import { MIN_OCULAR_CONFIDENCE } from "./ocularConfig";
import { FACE_EAR_INDEX, type LandmarkPoint } from "./poseDetector";

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
