import { describe, expect, it } from "vitest";
import { classifyBlinkRate, createBlinkRateState, updateBlinkRate, type BlinkRateConfig, type BlinkRateUpdate } from "./blinkRate";

const config: BlinkRateConfig = { windowMs: 60_000, minObservedMs: 30_000, maxGapMs: 250 };

function observe(
  endMs: number,
  blinkTimes: readonly number[] = [],
  available: (time: number) => boolean = () => true,
  options = config,
): BlinkRateUpdate[] {
  let state = createBlinkRateState();
  const updates: BlinkRateUpdate[] = [];
  for (let time = 0; time <= endMs; time += 100) {
    const update = updateBlinkRate(state, time, available(time), blinkTimes.includes(time), options)!;
    state = update.state; updates.push(update);
  }
  return updates;
}

describe("sliding blink rate", () => {
  it("reports insufficient data before warm-up and normalizes by observed time afterwards", () => {
    const updates = observe(30_000, [1000, 2000, 3000]);
    expect(updates[0].measurement).toMatchObject({ observedMs: 0, blinksPerMinute: null, isWarmingUp: true });
    expect(updates[299].measurement.blinksPerMinute).toBeNull();
    expect(updates[300].measurement).toEqual({ observedMs: 30_000, blinkCount: 3, blinksPerMinute: 6, isWarmingUp: false });
  });

  it("slides, expires old blinks at the exact boundary and clips observation intervals", () => {
    const updates = observe(90_000, [1000, 30_000, 60_000]);
    expect(updates[600].measurement).toMatchObject({ observedMs: 60_000, blinkCount: 3, blinksPerMinute: 3 });
    expect(updates[610].measurement.blinkCount).toBe(2);
    expect(updates[900].measurement).toMatchObject({ observedMs: 60_000, blinkCount: 1, blinksPerMinute: 1 });
    expect(updates[900].state.intervals).toEqual([{ startMs: 30_000, endMs: 90_000 }]);
  });

  it("excludes lost-face time and never counts blink flags during missing detection", () => {
    const options = { ...config, windowMs: 90_000 };
    const updates = observe(60_000, [10_000, 20_000, 50_000], time => time < 15_000 || time >= 45_000, options);
    expect(updates[600].measurement).toMatchObject({ observedMs: 29_900, blinkCount: 2, blinksPerMinute: null });
    const next = updateBlinkRate(updates[600].state, 60_100, true, false, options)!;
    expect(next.measurement).toMatchObject({ observedMs: 30_000, blinksPerMinute: 4 });
  });

  it("does not bridge long gaps and eventually expires all unobserved history", () => {
    const beforeGap = observe(30_000, [1000])[300];
    const afterGap = updateBlinkRate(beforeGap.state, 90_001, true, true)!;
    expect(afterGap.measurement).toMatchObject({ observedMs: 0, blinkCount: 0, blinksPerMinute: null });
  });

  it("supports a custom window/warm-up and does not mutate frozen input", () => {
    const custom = observe(2000, [500, 1500], undefined, { windowMs: 1000, minObservedMs: 500, maxGapMs: 200 });
    expect(custom[20].measurement).toMatchObject({ blinkCount: 1, observedMs: 1000, blinksPerMinute: 60 });
    const state = Object.freeze(createBlinkRateState());
    Object.freeze(state.intervals); Object.freeze(state.blinkTimestampsMs);
    expect(updateBlinkRate(state, 0, true, false)?.measurement.observedMs).toBe(0);
  });

  it("rejects invalid time, non-increasing samples and invalid configuration", () => {
    const state = updateBlinkRate(createBlinkRateState(), 100, true, false)!.state;
    for (const time of [100, 99, -1, NaN, Infinity]) expect(updateBlinkRate(state, time, true, true)).toBeNull();
    for (const invalid of [
      { ...config, windowMs: 0 }, { ...config, minObservedMs: 0 }, { ...config, maxGapMs: NaN },
      { ...config, minObservedMs: 60_001 },
    ]) expect(updateBlinkRate(state, 200, true, false, invalid)).toBeNull();
  });
});

describe("classifyBlinkRate", () => {
  it.each([
    [0, "high-risk"], [4.999, "high-risk"], [5, "attention"], [7.999, "attention"],
    [8, "normal"], [15, "normal"], [20, "normal"],
  ])("classifies %s blinks/min as %s at exact threshold boundaries", (rate, expected) => {
    expect(classifyBlinkRate(rate as number)).toBe(expected);
  });

  it("supports configurable thresholds and preserves insufficient-data status", () => {
    expect(classifyBlinkRate(9, { highRiskBelow: 10, attentionBelow: 15 })).toBe("high-risk");
    expect(classifyBlinkRate(10, { highRiskBelow: 10, attentionBelow: 15 })).toBe("attention");
    for (const invalid of [null, NaN, Infinity, -1]) expect(classifyBlinkRate(invalid)).toBeNull();
    expect(classifyBlinkRate(12, { highRiskBelow: 8, attentionBelow: 8 })).toBeNull();
    expect(classifyBlinkRate(12, { highRiskBelow: NaN, attentionBelow: 15 })).toBeNull();
  });
});
