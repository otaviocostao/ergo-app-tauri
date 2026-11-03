import { describe, expect, it } from "vitest";
import { LightingFeedback } from "./lightingFeedback";

const gray = (value: number) => new Uint8ClampedArray([value, value, value, 255]);

describe("local lighting feedback", () => {
  it("requires sustained darkness and sustained recovery, with a dead band", () => {
    const light = new LightingFeedback();
    for (let time = 0; time < 2000; time += 500) expect(light.update(gray(20), time)).toBe(false);
    expect(light.update(gray(20), 2000)).toBe(true);
    expect(light.update(gray(50), 2500)).toBe(true);
    expect(light.update(gray(100), 3000)).toBe(true);
    expect(light.update(gray(100), 3500)).toBe(true);
    expect(light.update(gray(100), 4000)).toBe(false);
  });

  it("does not count interrupted observations and clears acquisition history on reset", () => {
    const light = new LightingFeedback();
    light.update(gray(20), 0);
    expect(light.update(gray(20), 3000)).toBe(false);
    light.update(gray(20), 3500);
    light.update(gray(40), 4000);
    expect(light.update(gray(20), 4500)).toBe(false);
    light.reset();
    expect(light.update(gray(20), 5000)).toBe(false);
  });
});
