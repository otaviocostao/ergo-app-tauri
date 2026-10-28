import { describe, expect, it } from "vitest";
import {
  evaluatePostureCalibration, POSTURE_CALIBRATION_LIMITS, type PostureCalibrationFrame,
} from "./postureCalibration";

function frames(): PostureCalibrationFrame[] {
  return Array.from({ length: 55 }, (_, index) => ({
    timestampMs: 100 + index * 90,
    captureId: 1,
    frameWidth: 1280,
    frameHeight: 720,
    ipd: { source: "iris", distancePx: 200 },
    rawAngles: { neckAngle: 1.25, shoulderAngle: 0.125 },
    filteredAngles: { neckAngle: 1.25, shoulderAngle: 0.125 },
  }));
}

describe("posture calibration quality", () => {
  it("averages a stable five-second capture without display rounding or input mutation", () => {
    const samples = frames();
    const original = JSON.stringify(samples);
    const result = evaluatePostureCalibration(samples, 0, 5000);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.frameWidth).toBe(1280);
    expect(result.baseline.baselineNeckAngle).toBeCloseTo(1.25, 10);
    expect(result.baseline.baselineShoulderBalance).toBeCloseTo(98.75, 10);
    expect(result.baseline.baselineEyeDistancePx).toBeCloseTo(200, 10);
    expect(result.baseline.baselineDistanceCm).toBe(60);
    expect(JSON.stringify(samples)).toBe(original);
  });

  it.each([0, 1, 29, 35])(
    "rejects missing, sparse or incomplete capture with %s initial samples", count => {
      expect(evaluatePostureCalibration(frames().slice(0, count), 0, 5000)).toEqual({ ok: false, reason: "insufficient-data" });
    },
  );

  it("does not approve a dense short burst or a long interruption", () => {
    const burst = frames().map((frame, index) => ({ ...frame, timestampMs: index * 5 }));
    expect(evaluatePostureCalibration(burst, 0, 5000)).toEqual({ ok: false, reason: "insufficient-data" });
    const interrupted = frames().filter(frame => frame.timestampMs < 2000 || frame.timestampMs > 2700);
    expect(evaluatePostureCalibration(interrupted, 0, 5000)).toEqual({ ok: false, reason: "insufficient-data" });
    expect(evaluatePostureCalibration(frames().slice(15), 0, 5000)).toEqual({ ok: false, reason: "insufficient-data" });
  });

  it("allows a brief missed frame but requires the whole countdown to finish", () => {
    expect(evaluatePostureCalibration(frames().filter((_, index) => index !== 20), 0, 5000).ok).toBe(true);
    expect(evaluatePostureCalibration(frames(), 0, 4999).ok).toBe(false);
    expect(evaluatePostureCalibration(frames(), NaN, 5000).ok).toBe(false);
  });

  it("accepts the minimum sample count and exact coverage boundaries", () => {
    const samples = Array.from({ length: 30 }, (_, index) => ({ ...frames()[0], timestampMs: 500 + index * (4000 / 29) }));
    expect(evaluatePostureCalibration(samples, 0, 5000).ok).toBe(true);
  });

  it.each(["captureId", "frameWidth", "frameHeight"] as const)("rejects a change in %s", key => {
    const samples = frames();
    samples[30] = { ...samples[30], [key]: samples[30][key] + 1 };
    expect(evaluatePostureCalibration(samples, 0, 5000)).toEqual({ ok: false, reason: "capture-changed" });
  });

  it("rejects mixing iris and eye-corner IPD measurements", () => {
    const samples = frames();
    samples[30] = { ...samples[30], ipd: { source: "eye-corners", distancePx: 200 } };
    expect(evaluatePostureCalibration(samples, 0, 5000)).toEqual({ ok: false, reason: "capture-changed" });
  });

  it.each(["neckAngle", "shoulderAngle"] as const)("rejects raw %s motion even when filtering hides it", channel => {
    const samples = frames();
    samples[30] = { ...samples[30], rawAngles: { ...samples[30].rawAngles, [channel]: 10 } };
    expect(evaluatePostureCalibration(samples, 0, 5000)).toEqual({ ok: false, reason: "unstable-posture" });
  });

  it("rejects a changing IPD instead of accepting the midpoint as a neutral distance", () => {
    const samples = frames().map((frame, index) => ({ ...frame, ipd: { ...frame.ipd, distancePx: index < 27 ? 100 : 250 } }));
    expect(evaluatePostureCalibration(samples, 0, 5000)).toEqual({ ok: false, reason: "unstable-ipd" });
  });

  it("tolerates small sensor noise", () => {
    const samples = frames().map((frame, index) => ({ ...frame,
      rawAngles: { neckAngle: 1 + (index % 2), shoulderAngle: 0.2 + (index % 2) * 0.1 },
      ipd: { ...frame.ipd, distancePx: 200 + (index % 2) * 2 },
    }));
    expect(evaluatePostureCalibration(samples, 0, 5000).ok).toBe(true);
    expect(Object.isFrozen(POSTURE_CALIBRATION_LIMITS)).toBe(true);
  });

  it.each([NaN, Infinity, 0, -1])("rejects invalid measured IPD %s", distancePx => {
    const samples = frames(); samples[30] = { ...samples[30], ipd: { source: "iris", distancePx } };
    expect(evaluatePostureCalibration(samples, 0, 5000)).toEqual({ ok: false, reason: "invalid-frame" });
  });

  it("rejects duplicate or regressive timestamps and samples outside the capture window", () => {
    for (const timestampMs of [samplesTimestamp(29), samplesTimestamp(29) - 1, -1, 5001]) {
      const samples = frames(); samples[30] = { ...samples[30], timestampMs };
      expect(evaluatePostureCalibration(samples, 0, 5000)).toEqual({ ok: false, reason: "invalid-frame" });
    }
    function samplesTimestamp(index: number) { return frames()[index].timestampMs; }
  });
});
