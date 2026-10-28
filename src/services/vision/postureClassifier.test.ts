import { describe, expect, it } from "vitest";
import { PostureStatus } from "../../enums/postureStatus";
import { classifyBlinkFrequency, classifyNeckDeviation, classifyPosture, classifyScreenDistance, classifyShoulderDeviation, getPostureStatusLabel } from "./postureClassifier";
import { createPostureClassificationConfig } from "./postureClassificationConfig";
import { createBlinkRateState, updateBlinkRate, type BlinkRateMeasurement } from "./blinkRate";
import type { PostureObservation } from "../../types/postureClassification";

describe("neck deviation classification", () => {
  it.each([
    [0, PostureStatus.GOOD], [6, PostureStatus.GOOD], [11.999, PostureStatus.GOOD], [12, PostureStatus.GOOD],
    [12.001, PostureStatus.WARNING], [16, PostureStatus.WARNING], [19.999, PostureStatus.WARNING],
    [20, PostureStatus.WARNING], [20.001, PostureStatus.DANGER], [40, PostureStatus.DANGER],
  ])("classifies signed magnitudes around %s degrees as %s", (angle, expected) => {
    expect(classifyNeckDeviation(angle)).toBe(expected);
    expect(classifyNeckDeviation(-angle)).toBe(expected);
  });
});

describe("shoulder deviation classification", () => {
  it.each([
    [0, PostureStatus.GOOD], [1.5, PostureStatus.GOOD], [2.999, PostureStatus.GOOD], [3, PostureStatus.GOOD],
    [3.001, PostureStatus.WARNING], [4.5, PostureStatus.WARNING], [5.999, PostureStatus.WARNING],
    [6, PostureStatus.WARNING], [6.001, PostureStatus.DANGER], [15, PostureStatus.DANGER],
  ])("classifies signed magnitudes around %s degrees as %s", (angle, expected) => {
    expect(classifyShoulderDeviation(angle)).toBe(expected);
    expect(classifyShoulderDeviation(-angle)).toBe(expected);
  });
});

describe("angular classifier contracts", () => {
  it.each([null, undefined, NaN, Infinity, -Infinity])("keeps invalid input %s unavailable", value => {
    expect(classifyNeckDeviation(value)).toBeNull();
    expect(classifyShoulderDeviation(value)).toBeNull();
  });

  it("uses custom validated thresholds without changing defaults", () => {
    const config = createPostureClassificationConfig({
      neck: { goodMaxDegrees: 5, warningMaxDegrees: 10 },
      shoulders: { goodMaxDegrees: 1, warningMaxDegrees: 2 },
    });
    expect(classifyNeckDeviation(6, config)).toBe(PostureStatus.WARNING);
    expect(classifyShoulderDeviation(3, config)).toBe(PostureStatus.DANGER);
    expect(classifyNeckDeviation(6)).toBe(PostureStatus.GOOD);
    expect(classifyShoulderDeviation(3)).toBe(PostureStatus.GOOD);
  });
});

describe("screen distance classification in cm", () => {
  it.each([
    [20, PostureStatus.DANGER], [39.999, PostureStatus.DANGER], [40, PostureStatus.WARNING],
    [40.001, PostureStatus.WARNING], [45, PostureStatus.WARNING], [49.999, PostureStatus.WARNING],
    [50, PostureStatus.GOOD], [50.001, PostureStatus.GOOD], [60, PostureStatus.GOOD],
    [74.999, PostureStatus.GOOD], [75, PostureStatus.GOOD], [75.001, PostureStatus.WARNING],
    [80, PostureStatus.WARNING], [84.999, PostureStatus.WARNING], [85, PostureStatus.WARNING],
    [85.001, PostureStatus.DANGER], [100, PostureStatus.DANGER],
  ])("classifies %s cm as %s", (distance, expected) => {
    expect(classifyScreenDistance(distance)).toBe(expected);
  });

  it.each([null, undefined, 0, -1, NaN, Infinity, -Infinity])("keeps invalid distance %s unavailable", value => {
    expect(classifyScreenDistance(value)).toBeNull();
  });

  it("uses the configured distance boundaries", () => {
    const config = createPostureClassificationConfig({
      distance: { dangerBelowCm: 35, goodMinCm: 45, goodMaxCm: 70, dangerAboveCm: 80 },
    });
    expect(classifyScreenDistance(45, config)).toBe(PostureStatus.GOOD);
    expect(classifyScreenDistance(85, config)).toBe(PostureStatus.DANGER);
    expect(classifyScreenDistance(45)).toBe(PostureStatus.WARNING);
  });
});

describe("blink frequency classification", () => {
  const measured = (blinksPerMinute: number | null): BlinkRateMeasurement => ({
    blinkCount: 4, observedMs: 30_000, blinksPerMinute, isWarmingUp: false,
  });

  it.each([
    [0, PostureStatus.WARNING], [4, PostureStatus.WARNING], [7.999, PostureStatus.WARNING],
    [8, PostureStatus.GOOD], [8.001, PostureStatus.GOOD], [20, PostureStatus.GOOD],
  ])("classifies %s blinks/min as %s", (rate, expected) => {
    expect(classifyBlinkFrequency(measured(rate))).toBe(expected);
  });

  it.each([null, NaN, Infinity, -Infinity, -1])("rejects unavailable or invalid rate %s", rate => {
    expect(classifyBlinkFrequency(measured(rate))).toBeNull();
  });

  it("requires enough valid observation even if a caller supplies a provisional rate", () => {
    expect(classifyBlinkFrequency(null)).toBeNull();
    expect(classifyBlinkFrequency(undefined)).toBeNull();
    expect(classifyBlinkFrequency({ ...measured(0), isWarmingUp: true })).toBeNull();
    expect(classifyBlinkFrequency({ ...measured(0), observedMs: 29_999 })).toBeNull();
    expect(classifyBlinkFrequency({ ...measured(0), observedMs: NaN })).toBeNull();
  });

  it("follows oscillations without latching a parallel fatigue state", () => {
    expect([7, 8, 7, 9].map(rate => classifyBlinkFrequency(measured(rate))))
      .toEqual([PostureStatus.WARNING, PostureStatus.GOOD, PostureStatus.WARNING, PostureStatus.GOOD]);
  });

  it("uses the existing timestamp-driven window and does not count warm-up as low-rate observation", () => {
    let state = createBlinkRateState();
    let firstLowAt: number | null = null;
    for (let timestamp = 0; timestamp <= 55_000; timestamp += 100) {
      const update = updateBlinkRate(state, timestamp, true, timestamp > 0 && timestamp % 10_000 === 0)!;
      state = update.state;
      const status = classifyBlinkFrequency(update.measurement);
      if (timestamp < 30_000) expect(status).toBeNull();
      else {
        expect(status).toBe(PostureStatus.WARNING);
        firstLowAt ??= timestamp;
      }
    }
    expect(firstLowAt).toBe(30_000);
    expect(55_000 - firstLowAt!).toBeGreaterThan(createPostureClassificationConfig().blinkPersistenceMs);
  });

  it("uses a configured low-frequency threshold", () => {
    const config = createPostureClassificationConfig({ blinkRate: { lowBelowPerMinute: 10 } });
    expect(classifyBlinkFrequency(measured(9), config)).toBe(PostureStatus.WARNING);
    expect(classifyBlinkFrequency(measured(9))).toBe(PostureStatus.GOOD);
  });
});

describe("per-frame calibrated posture classification", () => {
  const baseline = Object.freeze({ id: "base", isActive: true, baselineNeckAngle: 10, baselineShoulderBalance: 80,
    baselineDistanceCm: 60, baselineEyeDistancePx: 200 });
  const sample: PostureObservation = Object.freeze({ timestampMs: 100, captureId: 1,
    neckAngle: 22, shoulderAngle: 5, distanceCm: 60, blinkRate: null });

  it("classifies deviations using the active baseline without mutating observations", () => {
    const result = classifyPosture(sample, baseline);
    expect(result).toMatchObject({ baselineId: "base", timestampMs: 100, captureId: 1, postureStatus: PostureStatus.GOOD,
      metrics: { neck: { value: 12, status: "good" }, shoulders: { value: 3, status: "good" } } });
    expect(classifyPosture(sample, baseline)).toEqual(result);
    expect(sample.neckAngle).toBe(22);
    expect(baseline.baselineNeckAngle).toBe(10);
  });

  it("uses absolute deviations and preserves fractional values before classification", () => {
    expect(classifyPosture({ ...sample, neckAngle: 0 }, baseline).metrics.neck.value).toBe(10);
    expect(classifyPosture({ ...sample, neckAngle: 22.001 }, baseline).metrics.neck.status).toBe(PostureStatus.WARNING);
    expect(classifyPosture({ ...sample, shoulderAngle: 5.001 }, baseline).metrics.shoulders.status).toBe(PostureStatus.WARNING);
    expect(classifyPosture({ ...sample, shoulderAngle: 15 }, baseline).metrics.shoulders.value).toBe(13);
  });

  it("does not invent neutral angles without a usable baseline", () => {
    for (const invalid of [null, { ...baseline, isActive: false }, { ...baseline, id: "" }]) {
      const result = classifyPosture({ ...sample, distanceCm: null }, invalid);
      expect(result.metrics.neck.status).toBeNull();
      expect(result.metrics.shoulders.status).toBeNull();
      expect(result.postureStatus).toBeNull();
    }
    expect(classifyPosture(sample, { ...baseline, baselineShoulderBalance: 0 }).metrics.shoulders.status).toBeNull();
    expect(classifyPosture(sample, { ...baseline, baselineNeckAngle: NaN }).metrics.neck.status).toBeNull();
  });

  it("keeps invalid measurements unavailable per metric", () => {
    const result = classifyPosture({ ...sample, neckAngle: NaN, shoulderAngle: -1 }, baseline);
    expect(result.metrics.neck).toEqual({ value: null, status: null });
    expect(result.metrics.shoulders).toEqual({ value: null, status: null });
    expect(result.metrics.distance.status).toBe(PostureStatus.GOOD);
    expect(result.postureStatus).toBe(PostureStatus.GOOD);
  });

  it("does not turn low blink frequency into poor spinal posture", () => {
    const blinkRate = { blinkCount: 0, observedMs: 30_000, blinksPerMinute: 0, isWarmingUp: false };
    const result = classifyPosture({ ...sample, blinkRate }, baseline);
    expect(result.metrics["blink-rate"].status).toBe(PostureStatus.WARNING);
    expect(result.postureStatus).toBe(PostureStatus.GOOD);
  });

  it("uses the worst valid postural level and consistent labels", () => {
    const result = classifyPosture({ ...sample, neckAngle: 23, distanceCm: 90 }, baseline);
    expect(result.postureStatus).toBe(PostureStatus.DANGER);
    expect(getPostureStatusLabel(result)).toBe("Muito Distante da Tela");
    expect(getPostureStatusLabel(classifyPosture({ ...sample, distanceCm: 30 }, baseline))).toBe("Muito Próximo da Tela");
    expect(getPostureStatusLabel(classifyPosture({ ...sample, distanceCm: null }, null))).toContain("Aguardando calibração");
  });
});
