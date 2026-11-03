import { describe, expect, it } from "vitest";
import { Module } from "../../enums/module";
import { PostureStatus } from "../../enums/postureStatus";
import type { ModuleSettings } from "../settingsService";
import type { PostureClassification } from "../../types/postureClassification";
import { getInactiveModule, restrictClassificationToModules } from "./moduleClassification";

const settings = (changes: Partial<ModuleSettings> = {}): ModuleSettings => ({
  id: "settings-1", userId: 1, posturalAnalysis: true, ocularAnalysis: true, typingAnalysis: true,
  webCam: null, createdAt: "", updatedAt: "", ...changes,
});

const classification: PostureClassification = {
  timestampMs: 100, captureId: 1, baselineId: "base", postureStatus: PostureStatus.DANGER,
  metrics: {
    neck: { value: 30, status: PostureStatus.DANGER },
    shoulders: { value: 1, status: PostureStatus.GOOD },
    distance: { value: 40, status: PostureStatus.WARNING },
    "blink-rate": { value: 5, status: PostureStatus.WARNING },
  },
};

describe("restrictClassificationToModules", () => {
  it("keeps the classification when every module is enabled or settings are unknown", () => {
    expect(restrictClassificationToModules(classification, settings())).toBe(classification);
    expect(restrictClassificationToModules(classification, null)).toBe(classification);
  });

  it("removes posture metrics and status when the postural module is disabled", () => {
    const result = restrictClassificationToModules(classification, settings({ posturalAnalysis: false }));
    expect(result.metrics).toEqual({
      neck: { value: null, status: null },
      shoulders: { value: null, status: null },
      distance: { value: null, status: null },
      "blink-rate": { value: 5, status: PostureStatus.WARNING },
    });
    expect(result.postureStatus).toBeNull();
    expect(result).toMatchObject({ timestampMs: 100, captureId: 1, baselineId: "base" });
  });

  it("removes the blink rate and the distance when the ocular module is disabled", () => {
    const result = restrictClassificationToModules(classification, settings({ ocularAnalysis: false }));
    expect(result.metrics.neck).toEqual(classification.metrics.neck);
    expect(result.metrics.shoulders).toEqual(classification.metrics.shoulders);
    expect(result.metrics.distance).toEqual({ value: null, status: null });
    expect(result.metrics["blink-rate"]).toEqual({ value: null, status: null });
    expect(result.postureStatus).toBe(PostureStatus.DANGER);

    const onlyDistanceWarning = restrictClassificationToModules({
      ...classification,
      metrics: { ...classification.metrics, neck: { value: 1, status: PostureStatus.GOOD } },
    }, settings({ ocularAnalysis: false }));
    expect(onlyDistanceWarning.postureStatus).toBe(PostureStatus.GOOD);
  });

  it("ignores the typing module", () => {
    expect(restrictClassificationToModules(classification, settings({ typingAnalysis: false }))).toBe(classification);
  });

  it("reports which disabled module makes a metric unavailable", () => {
    expect(getInactiveModule("distance", settings({ posturalAnalysis: false, ocularAnalysis: false }))).toBe(Module.POSTURAL_ANALYSIS);
    expect(getInactiveModule("distance", settings({ ocularAnalysis: false }))).toBe(Module.OCULAR_ANALYSIS);
    expect(getInactiveModule("neck", settings({ ocularAnalysis: false }))).toBeNull();
    expect(getInactiveModule("blink-rate", null)).toBeNull();
  });
});
