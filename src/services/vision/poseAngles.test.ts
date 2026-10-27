import { describe, expect, it } from "vitest";
import { calculatePoseAngles } from "./poseAngles";
import { POSE_LANDMARK_INDEX as INDEX, type LandmarkPoint } from "./poseDetector";

function upright(): LandmarkPoint[] {
  const landmarks = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0, presence: 0 }));
  for (const [index, x, y] of [
    [INDEX.NOSE, 0.5, 0.2], [INDEX.LEFT_EAR, 0.45, 0.3], [INDEX.RIGHT_EAR, 0.55, 0.3],
    [INDEX.LEFT_SHOULDER, 0.3, 0.6], [INDEX.RIGHT_SHOULDER, 0.7, 0.6],
  ]) landmarks[index] = { x, y, z: 0, visibility: 1, presence: 1 };
  return landmarks;
}

describe("MediaPipe pose angle integration", () => {
  it("uses both ears to avoid a lateral bias for an upright front view", () => {
    const result = calculatePoseAngles(upright(), 1280, 720)!;
    expect(result.neckAngle).toBeCloseTo(0, 10);
    expect(result.shoulderBalance).toBe(100);
    expect(result.shoulderAngle).toBe(0);
    expect(result.headCenter).toEqual({ x: 0.5, y: 0.25 });
  });

  it.each([INDEX.LEFT_EAR, INDEX.RIGHT_EAR])("uses the visible ear in a side view with ear %s occluded", (hidden) => {
    const landmarks = upright();
    landmarks[hidden].visibility = 0;
    const visible = hidden === INDEX.LEFT_EAR ? INDEX.RIGHT_EAR : INDEX.LEFT_EAR;
    landmarks[visible].x = 0.5;
    expect(calculatePoseAngles(landmarks, 1280, 720)?.neckAngle).toBe(0);
  });

  it.each([[1280, 720], [640, 480], [720, 1280]])("recovers a known angle in a %sx%s video", (width, height) => {
    const landmarks = upright();
    const horizontalOffset = Math.tan(30 * Math.PI / 180) * (0.6 - 0.25) * height / width;
    for (const index of [INDEX.NOSE, INDEX.LEFT_EAR, INDEX.RIGHT_EAR]) landmarks[index].x += horizontalOffset;
    expect(calculatePoseAngles(landmarks, width, height)?.neckAngle).toBeCloseTo(30, 10);
  });

  it("measures a five-degree shoulder slope after correcting the video aspect ratio", () => {
    const landmarks = upright();
    const slope = Math.tan(5 * Math.PI / 180) * (0.7 - 0.3) * 1280 / 720;
    landmarks[INDEX.LEFT_SHOULDER].y -= slope / 2;
    landmarks[INDEX.RIGHT_SHOULDER].y += slope / 2;
    expect(calculatePoseAngles(landmarks, 1280, 720)?.shoulderBalance).toBeCloseTo(50, 10);
    expect(calculatePoseAngles(landmarks, 1280, 720)?.shoulderAngle).toBeCloseTo(5, 10);
  });

  it.each([15, 30, 45])("keeps the raw %s degree shoulder angle after the percentage reaches zero", angle => {
    const landmarks = upright();
    const slope = Math.tan(angle * Math.PI / 180) * 0.4 * 1280 / 720;
    landmarks[INDEX.LEFT_SHOULDER].y -= slope / 2;
    landmarks[INDEX.RIGHT_SHOULDER].y += slope / 2;
    const result = calculatePoseAngles(landmarks, 1280, 720)!;
    expect(result.shoulderAngle).toBeCloseTo(angle, 10);
    expect(result.shoulderBalance).toBe(0);
  });

  it("preserves measurements under mirroring and swapping the shoulder order", () => {
    const landmarks = upright();
    landmarks[INDEX.RIGHT_SHOULDER].y = 0.61;
    const expected = calculatePoseAngles(landmarks, 1280, 720)!;
    const mirrored = landmarks.map(point => ({ ...point, x: 1 - point.x }));
    [mirrored[INDEX.LEFT_SHOULDER], mirrored[INDEX.RIGHT_SHOULDER]] = [mirrored[INDEX.RIGHT_SHOULDER], mirrored[INDEX.LEFT_SHOULDER]];
    const actual = calculatePoseAngles(mirrored, 1280, 720)!;
    expect(actual.neckAngle).toBeCloseTo(expected.neckAngle, 10);
    expect(actual.shoulderBalance).toBeCloseTo(expected.shoulderBalance, 10);
    expect(actual.shoulderAngle).toBeCloseTo(expected.shoulderAngle, 10);
  });

  it.each([INDEX.NOSE, INDEX.LEFT_SHOULDER, INDEX.RIGHT_SHOULDER])("rejects an occluded required landmark %s", (index) => {
    const landmarks = upright();
    landmarks[index].visibility = 0.2;
    expect(calculatePoseAngles(landmarks, 1280, 720)).toBeNull();
    landmarks[index].visibility = 1;
    landmarks[index].presence = 0.2;
    expect(calculatePoseAngles(landmarks, 1280, 720)).toBeNull();
  });

  it.each([NaN, Infinity, -Infinity])("rejects non-finite coordinates or confidence %s", (invalid) => {
    const landmarks = upright();
    landmarks[INDEX.NOSE].x = invalid;
    expect(calculatePoseAngles(landmarks, 1280, 720)).toBeNull();
    landmarks[INDEX.NOSE].x = 0.5;
    landmarks[INDEX.NOSE].visibility = invalid;
    expect(calculatePoseAngles(landmarks, 1280, 720)).toBeNull();
  });

  it("rejects missing ears, incomplete poses and degenerate vectors", () => {
    expect(calculatePoseAngles([], 1280, 720)).toBeNull();
    const landmarks = upright();
    landmarks[INDEX.LEFT_EAR].visibility = 0;
    landmarks[INDEX.RIGHT_EAR].visibility = 0;
    expect(calculatePoseAngles(landmarks, 1280, 720)).toBeNull();
    const coincidentShoulders = upright();
    coincidentShoulders[INDEX.RIGHT_SHOULDER] = { ...coincidentShoulders[INDEX.LEFT_SHOULDER] };
    expect(calculatePoseAngles(coincidentShoulders, 1280, 720)).toBeNull();
    const zeroNeck = upright();
    for (const index of [INDEX.NOSE, INDEX.LEFT_EAR, INDEX.RIGHT_EAR]) zeroNeck[index] = { x: 0.5, y: 0.6, z: 0 };
    expect(calculatePoseAngles(zeroNeck, 1280, 720)).toBeNull();
  });

  it.each([[0, 720], [1280, 0], [-1, 720], [1280, NaN], [Infinity, 720]])("rejects invalid video dimensions %sx%s", (width, height) => {
    expect(calculatePoseAngles(upright(), width, height)).toBeNull();
  });

  it("keeps detector output unchanged and accepts optional confidence fields", () => {
    const landmarks = upright().map(({ x, y, z }) => Object.freeze({ x, y, z }));
    const before = JSON.stringify(landmarks);
    expect(calculatePoseAngles(Object.freeze(landmarks), 1280, 720)?.shoulderBalance).toBe(100);
    expect(JSON.stringify(landmarks)).toBe(before);
  });
});
