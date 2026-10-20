/**
 * Image-plane coordinates: x increases rightward and y increases downward.
 * Both axes must use the same scale (for example, pixels). Convert normalized
 * landmarks with x * frameWidth and y * frameHeight before calculating angles.
 */
export interface Point2D {
  readonly x: number;
  readonly y: number;
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
