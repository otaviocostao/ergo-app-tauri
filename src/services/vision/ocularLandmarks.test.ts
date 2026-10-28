import { describe, expect, it } from "vitest";
import {
  calculateFaceEAR,
  calculateInterpupillaryDistance,
  getEyeLandmarksInPixels,
  normalizedPointToPixels,
  validateCalibrationIPD,
} from "./ocularLandmarks";
import { FACE_EAR_INDEX, type LandmarkPoint } from "./poseDetector";

function face(): LandmarkPoint[] {
  const points = Array.from({ length: 478 }, (): LandmarkPoint => ({ x: 0, y: 0, z: 0, visibility: 0 }));
  for (const [indices, offset] of [[FACE_EAR_INDEX.RIGHT_EYE, 300], [FACE_EAR_INDEX.LEFT_EYE, 500]] as const) {
    for (const [i, [x, y]] of [[0, 0], [3, -1.5], [7, -1.5], [10, 0], [7, 1.5], [3, 1.5]].entries()) {
      points[indices[i]] = { x: (offset + x) / 1280, y: (200 + y) / 720, z: 0 };
    }
  }
  return points;
}

describe("ocular landmark pixel adaptation", () => {
  it("uses frame dimensions instead of preview dimensions to recover EAR", () => {
    expect(normalizedPointToPixels({ x: 0.5, y: 0.25 }, 1280, 720)).toEqual({ x: 640, y: 180 });
    expect(calculateFaceEAR(face(), 1280, 720)).toBeCloseTo(0.30, 10);
    expect(getEyeLandmarksInPixels(face(), 1280, 720, "right")?.[3]).toEqual({ x: 310, y: 200 });
  });

  it.each([NaN, Infinity, -1, 0])("rejects invalid dimensions %s", value => {
    expect(calculateFaceEAR(face(), value, 720)).toBeNull();
    expect(calculateFaceEAR(face(), 1280, value)).toBeNull();
  });

  it("rejects absent, low-confidence and non-finite points while allowing one eye", () => {
    expect(calculateFaceEAR([], 1280, 720)).toBeNull();
    const points = face();
    points[33].visibility = 0.35;
    expect(getEyeLandmarksInPixels(points, 1280, 720, "right")).toBeNull();
    expect(calculateFaceEAR(points, 1280, 720)).toBeCloseTo(0.30, 10);
    points[362].presence = NaN;
    expect(calculateFaceEAR(points, 1280, 720)).toBeNull();
    expect(normalizedPointToPixels({ x: NaN, y: 0 }, 1280, 720)).toBeNull();
    expect(normalizedPointToPixels({ x: Number.MAX_VALUE, y: 0 }, 1280, 720)).toBeNull();
  });
});

describe("calculateInterpupillaryDistance", () => {
  it("prefers iris centers, reports their source and uses both frame axes", () => {
    const points = face();
    points[468] = { x: 0.25, y: 0.25, z: 0 };
    points[473] = { x: 0.75, y: 0.75, z: 0 };
    expect(calculateInterpupillaryDistance(points, 600, 800)).toEqual({ distancePx: 500, source: "iris" });
  });

  it("falls back to eye-corner midpoints on a 468-point mesh or one unusable iris", () => {
    const points = face();
    expect(calculateInterpupillaryDistance(points.slice(0, 468), 1280, 720))
      .toEqual({ distancePx: 200, source: "eye-corners" });
    points[468] = { x: 0.1, y: 0.1, z: 0 };
    expect(calculateInterpupillaryDistance(points, 1280, 720)?.distancePx).toBe(200);
    expect(calculateInterpupillaryDistance(points, 1280, 720, "iris")).toBeNull();
  });

  it("can require corner calibration even when irises are present", () => {
    const points = face();
    points[468] = { x: 0.1, y: 0.1, z: 0 }; points[473] = { x: 0.9, y: 0.1, z: 0 };
    expect(calculateInterpupillaryDistance(points, 1280, 720, "eye-corners"))
      .toEqual({ distancePx: 200, source: "eye-corners" });
  });

  it("rejects missing/occluded corners, coincident centers, invalid sizes and non-finite iris", () => {
    expect(calculateInterpupillaryDistance([], 1280, 720)).toBeNull();
    const points = face(); points[33].presence = 0;
    expect(calculateInterpupillaryDistance(points, 1280, 720)).toBeNull();
    points[468] = { x: NaN, y: 0.5, z: 0 }; points[473] = { x: 0.6, y: 0.5, z: 0 };
    expect(calculateInterpupillaryDistance(points, 1280, 720)).toBeNull();
    points[468] = { ...points[473] };
    expect(calculateInterpupillaryDistance(points, 1280, 720, "iris")).toBeNull();
    expect(calculateInterpupillaryDistance(face(), 0, 720)).toBeNull();
  });
});

describe("validateCalibrationIPD", () => {
  it("approves IPD within the normal optical plausibility range", () => {
    // 120px on 1280 (ratio: 0.09375, ~9.4%)
    expect(validateCalibrationIPD(120, 1280)).toBe("valid");
    // 200px on 1920 (ratio: 0.104, ~10.4%)
    expect(validateCalibrationIPD(200, 1920)).toBe("valid");
    // Boundary checks: 5% and 20%
    expect(validateCalibrationIPD(64, 1280)).toBe("valid");
    expect(validateCalibrationIPD(256, 1280)).toBe("valid");
  });

  it("identifies when the user is too close to the screen (excessive IPD ratio)", () => {
    // 350px on 1280 (ratio: 0.273, > 20%)
    expect(validateCalibrationIPD(350, 1280)).toBe("too-close");
    // 400px on 1920 (ratio: 0.208, > 20%)
    expect(validateCalibrationIPD(400, 1920)).toBe("too-close");
  });

  it("identifies when the user is too far from the screen (insufficient IPD ratio)", () => {
    // 30px on 1280 (ratio: 0.023, < 4%)
    expect(validateCalibrationIPD(30, 1280)).toBe("too-far");
    // 70px on 1920 (ratio: 0.036, < 4%)
    expect(validateCalibrationIPD(70, 1920)).toBe("too-far");
  });

  it("safely handles non-finite, zero or negative inputs as too-far", () => {
    expect(validateCalibrationIPD(NaN, 1280)).toBe("too-far");
    expect(validateCalibrationIPD(120, 0)).toBe("too-far");
    expect(validateCalibrationIPD(120, -1280)).toBe("too-far");
    expect(validateCalibrationIPD(0, 1280)).toBe("too-far");
    expect(validateCalibrationIPD(-50, 1280)).toBe("too-far");
    expect(validateCalibrationIPD(120, Infinity)).toBe("too-far");
  });
});
