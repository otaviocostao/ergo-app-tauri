import { MIN_OCULAR_SPAN_PX } from "./ocularConfig";

/**
 * Image-plane coordinates: x increases rightward and y increases downward.
 * Both axes must use the same scale (for example, pixels). Convert normalized
 * landmarks with x * frameWidth and y * frameHeight before calculating angles.
 */
export interface Point2D {
  readonly x: number;
  readonly y: number;
}

/** MediaPipe canonical-face transform, flattened in column-major order. */
export interface FaceTransformationMatrix {
  readonly rows: number;
  readonly columns: number;
  readonly data: readonly number[];
}

const RADIANS_TO_DEGREES = 180 / Math.PI;

function isFinitePoint(point: Point2D): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function isValidVector(dx: number, dy: number): boolean {
  return Number.isFinite(dx) && Number.isFinite(dy) && (dx !== 0 || dy !== 0);
}

/**
 * Raw angle in degrees [0, 180] between the upward vertical and the vector from
 * shoulderCenter to the midpoint of nose and ear. An upright vector measures 0.
 *
 * The horizontal offset represents anterior projection in a side view; in a
 * front view this measures lateral inclination. This is a 2D geometric measure;
 * comparison with a calibrated neutral posture belongs to the caller.
 * Returns null for non-finite coordinates or a zero-length neck vector.
 */
export function calculateNeckAngle(
  nose: Point2D,
  ear: Point2D,
  shoulderCenter: Point2D,
): number | null {
  if (![nose, ear, shoulderCenter].every(isFinitePoint)) {
    return null;
  }

  const headX = nose.x / 2 + ear.x / 2;
  const headY = nose.y / 2 + ear.y / 2;
  const dx = headX - shoulderCenter.x;
  const upwardY = shoulderCenter.y - headY;

  if (!isValidVector(dx, upwardY)) {
    return null;
  }

  return Math.atan2(Math.abs(dx), upwardY) * RADIANS_TO_DEGREES;
}

/**
 * Signed vertical head rotation in degrees [-180, 180], relative to the camera.
 * Extracts pitch from R = Rz(roll) * Ry(yaw) * Rx(pitch), independently of
 * translation and uniform scale. This estimates head orientation, not a
 * calibrated anatomical cervical angle. Use its magnitude for posture checks.
 * Returns null for missing/invalid transforms or a singular yaw orientation.
 */
export function calculateHeadPitch(matrix: FaceTransformationMatrix | null | undefined): number | null {
  if (!matrix || matrix.rows !== 4 || matrix.columns !== 4 || matrix.data.length !== 16 ||
    !matrix.data.every(Number.isFinite)) return null;

  const m = matrix.data;
  const tolerance = 1e-3;
  if (Math.abs(m[3]) > tolerance || Math.abs(m[7]) > tolerance ||
    Math.abs(m[11]) > tolerance || Math.abs(m[15] - 1) > tolerance) return null;

  const columns = [0, 4, 8].map(offset => [m[offset], m[offset + 1], m[offset + 2]]);
  const lengths = columns.map(column => Math.hypot(...column));
  if (lengths.some(length => !Number.isFinite(length) || length <= 1e-8) ||
    lengths.some(length => Math.abs(length / lengths[0] - 1) > tolerance)) return null;

  const [x, y, z] = columns.map((column, index) => column.map(value => value / lengths[index]));
  const dot = (a: number[], b: number[]) => a.reduce((sum, value, index) => sum + value * b[index], 0);
  const crossXY = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
  if (Math.abs(dot(x, y)) > tolerance || Math.abs(dot(x, z)) > tolerance ||
    Math.abs(dot(y, z)) > tolerance || Math.abs(dot(crossXY, z) - 1) > tolerance) return null;

  // At yaw +/-90 degrees pitch and roll cannot be separated reliably.
  if (Math.hypot(x[0], x[1]) < 1e-3) return null;
  return Math.atan2(y[2], z[2]) * RADIANS_TO_DEGREES;
}

/**
 * Shoulder leveling percentage [0, 100]: 100 for a horizontal shoulder line,
 * decreasing by 10 percentage points per degree and reaching 0 at 10 degrees.
 * The angle is the acute inclination to the horizontal [0, 90], independent
 * of landmark order or camera mirroring.
 * Returns null for non-finite coordinates or coincident shoulders.
 */
export function calculateShoulderBalance(
  leftShoulder: Point2D,
  rightShoulder: Point2D,
): number | null {
  if (![leftShoulder, rightShoulder].every(isFinitePoint)) {
    return null;
  }

  const dx = rightShoulder.x - leftShoulder.x;
  const dy = rightShoulder.y - leftShoulder.y;

  if (!isValidVector(dx, dy)) {
    return null;
  }

  const angle = Math.atan2(Math.abs(dy), Math.abs(dx)) * RADIANS_TO_DEGREES;
  return Math.max(0, Math.min(100, 100 - angle * 10));
}

/**
 * Dimensionless EAR = (|P2-P6| + |P3-P5|) / (2 * |P1-P4|).
 * Supply exactly six P1..P6 points in pixels (or equal-scale image axes),
 * never raw width/height-normalized coordinates. Ignores z intentionally.
 * Returns null for missing/non-finite points, near-zero width or overflow.
 * Soukupova & Cech (2016): https://vision.fe.uni-lj.si/cvww2016/proceedings/papers/05.pdf
 */
export function calculateEAR(eyeLandmarks: readonly Point2D[] | null | undefined): number | null {
  if (!eyeLandmarks || eyeLandmarks.length !== 6 ||
    !Array.from(eyeLandmarks).every(point => point && isFinitePoint(point))) return null;

  const distance = (a: Point2D, b: Point2D) => Math.hypot(a.x - b.x, a.y - b.y);
  const width = distance(eyeLandmarks[0], eyeLandmarks[3]);
  if (!Number.isFinite(width) || width <= MIN_OCULAR_SPAN_PX) return null;

  const ear = (distance(eyeLandmarks[1], eyeLandmarks[5]) / width +
    distance(eyeLandmarks[2], eyeLandmarks[4]) / width) / 2;
  return Number.isFinite(ear) ? ear : null;
}

/** Mean dimensionless EAR, using the available eye if the other is invalid. */
export function calculateMeanEAR(
  leftEye: readonly Point2D[] | null | undefined,
  rightEye: readonly Point2D[] | null | undefined,
): number | null {
  const left = calculateEAR(leftEye);
  const right = calculateEAR(rightEye);
  return left === null ? right : right === null ? left : left / 2 + right / 2;
}
