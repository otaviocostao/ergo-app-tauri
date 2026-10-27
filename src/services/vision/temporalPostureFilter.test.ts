import { describe, expect, it } from "vitest";
import {
  DEFAULT_TEMPORAL_POSTURE_FILTER_CONFIG,
  TemporalPostureFilter,
  type PostureAngles,
  type TemporalPostureFilterConfig,
} from "./temporalPostureFilter";

const neutral: PostureAngles = Object.freeze({ neckAngle: 0, shoulderAngle: 0 });

describe("TemporalPostureFilter", () => {
  it("starts with exact fractional measurements without mutating or retaining the input object", () => {
    const filter = new TemporalPostureFilter();
    const raw = Object.freeze({ neckAngle: 12.345, shoulderAngle: 24.678 });
    const first = filter.filter(raw, 0);
    expect(first).toEqual(raw);
    expect(first).not.toBe(raw);
    const second = filter.filter(raw, 90)!;
    expect(second.neckAngle).toBeCloseTo(raw.neckAngle, 12);
    expect(second.shoulderAngle).toBeCloseTo(raw.shoulderAngle, 12);
  });

  it("preserves a constant posture without accumulated rounding error", () => {
    const filter = new TemporalPostureFilter();
    for (let time = 0; time < 10_000; time += 90) {
      const result = filter.filter({ neckAngle: 12.25, shoulderAngle: 4.125 }, time)!;
      expect(result.neckAngle).toBeCloseTo(12.25, 12);
      expect(result.shoulderAngle).toBeCloseTo(4.125, 12);
    }
  });

  it("matches the authors' One Euro recurrence on a sustained 30-degree step at 90 ms", () => {
    const filter = new TemporalPostureFilter();
    filter.filter(neutral, 0);
    const expected = [19.75150053536231, 26.46671835551446, 28.629814336665994];
    expected.forEach((angle, index) => {
      const actual = filter.filter({ neckAngle: 30, shoulderAngle: 30 }, (index + 1) * 90)!;
      expect(actual.neckAngle).toBeCloseTo(angle, 10);
      expect(actual.shoulderAngle).toBeCloseTo(angle, 10);
    });
  });

  it("keeps independent histories for angles and for separate filter instances", () => {
    const movingNeck = new TemporalPostureFilter();
    const movingShoulder = new TemporalPostureFilter();
    for (const [index, angle] of [10, 11, 9, 30, 5, 0].entries()) {
      const neck = movingNeck.filter({ neckAngle: angle, shoulderAngle: 4 }, index * 90)!;
      const shoulder = movingShoulder.filter({ neckAngle: 4, shoulderAngle: angle }, index * 90)!;
      expect(neck.neckAngle).toBe(shoulder.shoulderAngle);
      expect(neck.shoulderAngle).toBeCloseTo(4, 12);
      expect(shoulder.neckAngle).toBeCloseTo(4, 12);
    }
  });

  it("uses actual sample intervals instead of a fixed per-frame weight", () => {
    const fastSampling = new TemporalPostureFilter();
    const slowSampling = new TemporalPostureFilter();
    fastSampling.filter(neutral, 0);
    slowSampling.filter(neutral, 0);
    const fast = fastSampling.filter({ neckAngle: 30, shoulderAngle: 5 }, 50)!;
    const slow = slowSampling.filter({ neckAngle: 30, shoulderAngle: 5 }, 200)!;
    expect(fast.neckAngle).toBeGreaterThan(0);
    expect(slow.neckAngle).toBeGreaterThan(fast.neckAngle);
    expect(slow.neckAngle).toBeLessThan(30);
    expect(slow.shoulderAngle).toBeGreaterThan(fast.shoulderAngle);
    for (const time of [280, 380, 470, 650]) {
      const result = slowSampling.filter({ neckAngle: 30, shoulderAngle: 5 }, time)!;
      expect(result.neckAngle).toBeGreaterThanOrEqual(slow.neckAngle);
      expect(result.neckAngle).toBeLessThanOrEqual(30);
    }
  });

  it("adapts to fast movement more quickly than the same cutoff with beta zero", () => {
    const adaptive = new TemporalPostureFilter();
    const fixed = new TemporalPostureFilter({ beta: 0 });
    adaptive.filter(neutral, 0);
    fixed.filter(neutral, 0);
    expect(adaptive.filter({ neckAngle: 30, shoulderAngle: 6 }, 90)!.neckAngle)
      .toBeGreaterThan(fixed.filter({ neckAngle: 30, shoulderAngle: 6 }, 90)!.neckAngle);
  });

  it("reduces RMS noise below half the raw error for 120 alternating samples", () => {
    const filter = new TemporalPostureFilter();
    const rawErrors: number[] = [];
    const filteredErrors: number[] = [];
    for (let index = 0; index < 120; index++) {
      const angle = index % 2 === 0 ? 9 : 11;
      const result = filter.filter({ neckAngle: angle, shoulderAngle: angle }, index * 90)!;
      if (index >= 20) {
        rawErrors.push((angle - 10) ** 2);
        filteredErrors.push((result.neckAngle - 10) ** 2);
        expect(result.shoulderAngle).toBe(result.neckAngle);
      }
    }
    const rms = (errors: number[]) => Math.sqrt(errors.reduce((sum, error) => sum + error, 0) / errors.length);
    expect(rms(filteredErrors)).toBeLessThan(rms(rawErrors) * 0.5);
  });

  it("reaches 90 percent of a 30-degree step within 500 ms", () => {
    const filter = new TemporalPostureFilter();
    for (let time = 0; time < 450; time += 90) filter.filter(neutral, time);
    const response: { elapsed: number; angle: number }[] = [];
    for (let elapsed = 0; elapsed <= 450; elapsed += 90) {
      response.push({ elapsed, angle: filter.filter({ neckAngle: 30, shoulderAngle: 0 }, 450 + elapsed)!.neckAngle });
    }
    const reached = response.find(sample => sample.angle >= 27);
    expect(reached).toBeDefined();
    expect(reached!.elapsed).toBeLessThanOrEqual(500);
    expect(response[0].angle).toBeLessThan(30);
  });

  it.each([1000, 1001])("only resets automatically for a gap strictly above 1000 ms (%s)", gap => {
    const filter = new TemporalPostureFilter();
    filter.filter(neutral, 0);
    const result = filter.filter({ neckAngle: 30, shoulderAngle: 15 }, gap)!;
    if (gap > 1000) {
      expect(result).toEqual({ neckAngle: 30, shoulderAngle: 15 });
      // Derivative history also starts fresh after the gap.
      const fresh = new TemporalPostureFilter();
      fresh.filter(result, gap);
      expect(filter.filter(neutral, gap + 90)).toEqual(fresh.filter(neutral, gap + 90));
    } else {
      expect(result.neckAngle).toBeLessThan(30);
      expect(result.shoulderAngle).toBeLessThan(15);
    }
  });

  it("honors a custom maximum gap", () => {
    const filter = new TemporalPostureFilter({ maxGapMs: 200 });
    filter.filter(neutral, 0);
    expect(filter.filter({ neckAngle: 50, shoulderAngle: 20 }, 201))
      .toEqual({ neckAngle: 50, shoulderAngle: 20 });
  });

  it("resets both channels, derivative histories and the clock", () => {
    const filter = new TemporalPostureFilter();
    filter.filter(neutral, 2000);
    filter.filter({ neckAngle: 40, shoulderAngle: 20 }, 2090);
    filter.reset();
    filter.reset();
    expect(filter.filter({ neckAngle: 1.25, shoulderAngle: 2.5 }, 0))
      .toEqual({ neckAngle: 1.25, shoulderAngle: 2.5 });
    const fresh = new TemporalPostureFilter();
    fresh.filter({ neckAngle: 1.25, shoulderAngle: 2.5 }, 0);
    expect(filter.filter(neutral, 90)).toEqual(fresh.filter(neutral, 90));
  });

  it.each([NaN, Infinity, -Infinity, -1, 90, 100])("ignores an invalid/non-increasing timestamp %s", timestamp => {
    const filter = new TemporalPostureFilter();
    const control = new TemporalPostureFilter();
    filter.filter(neutral, 100);
    control.filter(neutral, 100);
    expect(filter.filter({ neckAngle: 80, shoulderAngle: 50 }, timestamp)).toBeNull();
    expect(filter.filter({ neckAngle: 20, shoulderAngle: 5 }, 190))
      .toEqual(control.filter({ neckAngle: 20, shoulderAngle: 5 }, 190));
  });

  it.each([NaN, Infinity, -Infinity])("rejects a non-finite angle %s without advancing either channel", invalid => {
    for (const channel of ["neckAngle", "shoulderAngle"] as const) {
      const filter = new TemporalPostureFilter();
      const control = new TemporalPostureFilter();
      const bad = { neckAngle: 30, shoulderAngle: 6, [channel]: invalid };
      expect(filter.filter(bad, 0)).toBeNull();
      filter.filter(neutral, 0);
      control.filter(neutral, 0);
      expect(filter.filter(bad, 90)).toBeNull();
      expect(filter.filter({ neckAngle: 20, shoulderAngle: 4 }, 180))
        .toEqual(control.filter({ neckAngle: 20, shoulderAngle: 4 }, 180));
    }
  });

  it("does not partially commit the neck when the shoulder calculation overflows", () => {
    const filter = new TemporalPostureFilter();
    const control = new TemporalPostureFilter();
    filter.filter(neutral, 0);
    control.filter(neutral, 0);
    expect(filter.filter({ neckAngle: 10, shoulderAngle: Number.MAX_VALUE }, 90)).toBeNull();
    expect(filter.filter({ neckAngle: 10, shoulderAngle: 1 }, 180))
      .toEqual(control.filter({ neckAngle: 10, shoulderAngle: 1 }, 180));
  });

  it("copies configuration and returns values that cannot alter the internal history", () => {
    const config = { beta: 0.02 };
    const filter = new TemporalPostureFilter(config);
    const control = new TemporalPostureFilter();
    config.beta = 100;
    const first = filter.filter(neutral, 0)!;
    control.filter(neutral, 0);
    Object.assign(first, { neckAngle: 90, shoulderAngle: 60 });
    expect(filter.filter({ neckAngle: 20, shoulderAngle: 4 }, 90))
      .toEqual(control.filter({ neckAngle: 20, shoulderAngle: 4 }, 90));
    expect(Object.isFrozen(DEFAULT_TEMPORAL_POSTURE_FILTER_CONFIG)).toBe(true);
  });

  for (const field of ["minCutoff", "derivativeCutoff", "maxGapMs"] as const) {
    it.each([0, -1, NaN, Infinity, -Infinity])(`rejects invalid ${field} %s`, value => {
      expect(() => new TemporalPostureFilter({ [field]: value })).toThrow(RangeError);
    });
  }

  it.each([-1, NaN, Infinity, -Infinity])("rejects invalid beta %s", beta => {
    expect(() => new TemporalPostureFilter({ beta })).toThrow(RangeError);
  });

  it("accepts finite positive configuration and a zero speed coefficient", () => {
    const config: TemporalPostureFilterConfig = { minCutoff: 0.5, beta: 0, derivativeCutoff: 2, maxGapMs: 500 };
    expect(new TemporalPostureFilter(config).filter(neutral, 0)).toEqual(neutral);
  });
});
