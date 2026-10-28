import { describe, expect, it } from "vitest";
import { createPostureClassificationConfig, DEFAULT_POSTURE_CLASSIFICATION_CONFIG as DEFAULTS } from "./postureClassificationConfig";

describe("posture classification configuration", () => {
  it("defines the task thresholds and temporal defaults", () => {
    expect(createPostureClassificationConfig()).toEqual({
      neck: { goodMaxDegrees: 12, warningMaxDegrees: 20 },
      shoulders: { goodMaxDegrees: 3, warningMaxDegrees: 6 },
      distance: { dangerBelowCm: 40, goodMinCm: 50, goodMaxCm: 75, dangerAboveCm: 85 },
      blinkRate: { lowBelowPerMinute: 8 },
      persistenceMs: 20_000, blinkPersistenceMs: 20_000, cooldownMs: 180_000, maxSampleGapMs: 250,
    });
  });

  it.each([15_000, 30_000])("allows persistence at the task boundary %s", persistenceMs => {
    expect(createPostureClassificationConfig({ persistenceMs, blinkPersistenceMs: persistenceMs }).persistenceMs).toBe(persistenceMs);
  });
  it.each([120_000, 180_000])("allows cooldown at the task boundary %s", cooldownMs => {
    expect(createPostureClassificationConfig({ cooldownMs }).cooldownMs).toBe(cooldownMs);
  });

  for (const key of ["persistenceMs", "blinkPersistenceMs"] as const) {
    it.each([0, 14_999, 30_001, NaN, Infinity])(`rejects invalid ${key}: %s`, value => {
      expect(() => createPostureClassificationConfig({ [key]: value })).toThrow(RangeError);
    });
  }
  it.each([0, 119_999, 180_001, NaN, Infinity])("rejects invalid cooldown %s", cooldownMs => {
    expect(() => createPostureClassificationConfig({ cooldownMs })).toThrow(RangeError);
  });
  it.each([0, -1, NaN, Infinity, 20_000])("rejects invalid sample gap %s", maxSampleGapMs => {
    expect(() => createPostureClassificationConfig({ maxSampleGapMs })).toThrow(RangeError);
  });

  it("rejects unordered or invalid metric thresholds", () => {
    for (const limits of [{ goodMaxDegrees: -1, warningMaxDegrees: 20 }, { goodMaxDegrees: 12, warningMaxDegrees: 12 },
      { goodMaxDegrees: NaN, warningMaxDegrees: 20 }]) {
      expect(() => createPostureClassificationConfig({ neck: limits })).toThrow(RangeError);
      expect(() => createPostureClassificationConfig({ shoulders: limits })).toThrow(RangeError);
    }
    expect(() => createPostureClassificationConfig({ distance: { ...DEFAULTS.distance, goodMinCm: 80 } })).toThrow(RangeError);
    expect(() => createPostureClassificationConfig({ distance: { ...DEFAULTS.distance, dangerBelowCm: 0 } })).toThrow(RangeError);
    expect(() => createPostureClassificationConfig({ blinkRate: { lowBelowPerMinute: 0 } })).toThrow(RangeError);
    expect(() => createPostureClassificationConfig({ neck: undefined })).toThrow(RangeError);
    expect(() => createPostureClassificationConfig({ distance: undefined })).toThrow(RangeError);
  });

  it("copies and freezes custom configuration", () => {
    const neck = { goodMaxDegrees: 10, warningMaxDegrees: 18 };
    const config = createPostureClassificationConfig({ neck });
    neck.goodMaxDegrees = 1;
    expect(config.neck.goodMaxDegrees).toBe(10);
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.neck)).toBe(true);
    expect(DEFAULTS.neck.goodMaxDegrees).toBe(12);
  });
});
