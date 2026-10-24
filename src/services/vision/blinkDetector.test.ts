import { describe, expect, it } from "vitest";
import { createBlinkState, updateBlinkState, type BlinkUpdate } from "./blinkDetector";
import { DEFAULT_BLINK_CONFIG } from "./ocularConfig";

function sequence(samples: readonly (readonly [number | null, number])[]): BlinkUpdate[] {
  let state = createBlinkState();
  return samples.map(([ear, time]) => {
    const update = updateBlinkState(state, ear, time)!;
    state = update.state;
    return update;
  });
}

describe("timestamp-driven blink detector", () => {
  it.each([100, 150, 300])("counts one normal blink lasting %s ms", duration => {
    const updates = sequence([[0.3, 0], [0.1, 50], [0.1, 50 + duration / 2], [0.3, 50 + duration]]);
    expect(updates[3].event).toBe("blink");
    expect(updates.filter(update => update.event === "blink")).toHaveLength(1);
  });

  it("rejects noise shorter than 100ms", () => {
    expect(sequence([[0.3, 0], [0.1, 50], [0.3, 149]])[2].event).toBeNull();
  });

  it("holds closure through hysteresis jitter and uses strict closing/inclusive reopening", () => {
    const updates = sequence([[0.3, 0], [0.20, 20], [0.19, 50], [0.21, 100], [0.22, 150], [0.23, 200], [0.22, 220]]);
    expect(updates[1].state.phase).toBe("open");
    expect(updates[4].state.phase).toBe("closed");
    expect(updates[5].event).toBe("blink");
    expect(updates[6].event).toBeNull();
  });

  it("emits a prolonged closure once while closed, never as a normal blink", () => {
    const updates = sequence([[0.3, 0], [0.1, 50], [0.1, 250], [0.1, 351], [0.1, 450], [0.3, 500]]);
    expect(updates[3]).toMatchObject({ event: "prolonged-closure", closedDurationMs: 301 });
    expect(updates.filter(update => update.event !== null)).toHaveLength(1);
    expect(updates[5].state.phase).toBe("open");
  });

  it("detects prolonged closure first observed on reopening", () => {
    expect(sequence([[0.3, 0], [0.1, 50], [0.1, 200], [0.3, 400]])[3].event).toBe("prolonged-closure");
  });

  it.each([15, 30, 60])("counts the same blink at %s FPS", fps => {
    const samples: [number, number][] = [];
    for (let frame = 0; frame <= fps * 2; frame++) {
      const time = frame * 1000 / fps;
      samples.push([time >= 1000 && time < 1200 ? 0.1 : 0.3, time]);
    }
    expect(sequence(samples).filter(update => update.event === "blink")).toHaveLength(1);
  });

  it("handles variable FPS without depending on frame counts", () => {
    expect(sequence([[0.3, 0], [0.3, 33], [0.1, 50], [0.12, 67], [0.13, 133], [0.3, 200]])[5].event).toBe("blink");
  });

  it.each([null, NaN, Infinity, -0.1])("discards pending closure after missing/invalid EAR %s", invalid => {
    const updates = sequence([[0.3, 0], [0.1, 50], [invalid, 100], [0.1, 120], [0.3, 200]]);
    expect(updates.every(update => update.event === null)).toBe(true);
    expect(updates[3].state.phase).toBe("unknown");
  });

  it("discards gaps, duplicate/backward timestamps and startup with eyes closed", () => {
    for (const samples of [
      [[0.1, 0], [0.3, 150]],
      [[0.3, 0], [0.1, 50], [0.3, 500]],
      [[0.3, 0], [0.1, 50], [0.1, 50], [0.3, 200]],
      [[0.3, 0], [0.1, 50], [0.1, 40], [0.3, 200]],
      [[0.3, 0], [0.1, 50], [0.1, NaN], [0.3, 200]],
    ]) expect(sequence(samples as [number, number][]).every(update => update.event === null)).toBe(true);
  });

  it("supports configuration, rejects invalid thresholds and preserves frozen state", () => {
    const state = Object.freeze(createBlinkState());
    expect(updateBlinkState(state, 0.3, 0)?.state.phase).toBe("open");
    expect(updateBlinkState(state, 0.3, 0, { ...DEFAULT_BLINK_CONFIG, reopenThreshold: 0.1 })).toBeNull();
    expect(updateBlinkState(state, 0.3, 0, { ...DEFAULT_BLINK_CONFIG, maxGapMs: NaN })).toBeNull();
    const opened = updateBlinkState(state, 0.4, 0, { ...DEFAULT_BLINK_CONFIG, reopenThreshold: 0.35 })!;
    expect(opened.state.phase).toBe("open");
  });
});
