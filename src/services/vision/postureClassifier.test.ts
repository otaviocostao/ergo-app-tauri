import { describe, expect, it } from "vitest";
import { PostureStatus } from "../../enums/postureStatus";
import { classifyNeckDeviation, classifyShoulderDeviation } from "./postureClassifier";
import { createPostureClassificationConfig } from "./postureClassificationConfig";

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
