import { describe, expect, it } from "vitest";
import { createOcularMetricsState, isScreenDistancePoseUsable, updateOcularMetrics, type ScreenDistanceReference } from "./ocularMetrics";
import { FACE_EAR_INDEX, type LandmarkPoint } from "./poseDetector";

const reference: ScreenDistanceReference = {
  baselineDistanceCm: 60, baselineEyeDistancePx: 200, frameWidth: 1280, frameHeight: 720, source: "iris",
};
const matrix = { rows: 4, columns: 4, data: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -50, 1] };

function detection(timestamp: number, ear = 0.3, ipd = 200) {
  const points = Array.from({ length: 478 }, (): LandmarkPoint => ({ x: 0, y: 0, z: 0, visibility: 0 }));
  for (const [indices, offset] of [[FACE_EAR_INDEX.RIGHT_EYE, 300], [FACE_EAR_INDEX.LEFT_EYE, 500]] as const) {
    for (const [i, [x, y]] of [[0, 0], [3, -5 * ear], [7, -5 * ear], [10, 0], [7, 5 * ear], [3, 5 * ear]].entries()) {
      points[indices[i]] = { x: (offset + x) / 1280, y: (200 + y) / 720, z: 0 };
    }
  }
  points[468] = { x: 300 / 1280, y: 200 / 720, z: 0 };
  points[473] = { x: (300 + ipd) / 1280, y: 200 / 720, z: 0 };
  return { hasFace: true, faceLandmarks: points, faceTransformationMatrix: matrix, timestamp };
}

describe("per-frame ocular metrics", () => {
  it("calculates distance only with a valid reference and exposes raw/clamped/smoothed values", () => {
    const initial = createOcularMetricsState();
    expect(updateOcularMetrics(initial, detection(0), 1280, 720)?.metrics.distanceCm).toBeNull();
    const first = updateOcularMetrics(initial, detection(0), 1280, 720, reference)!;
    expect(first.metrics).toMatchObject({ available: true, ear: 0.3, rawDistanceCm: 60, distanceCm: 60, visualFatigue: null });
    const second = updateOcularMetrics(first.state, detection(100, 0.3, 100), 1280, 720, reference)!;
    expect(second.metrics.rawDistanceCm).toBe(120);
    expect(second.metrics.distanceCm).toBeCloseTo(78, 10);
    const far = updateOcularMetrics(initial, detection(0, 0.3, 20), 1280, 720, reference)!;
    expect(far.metrics).toMatchObject({ rawDistanceCm: 600, distanceCm: 150 });
  });

  it("rejects mismatched resolution/method and never silently switches calibrated IPD", () => {
    const sample = detection(0); sample.faceLandmarks[468].visibility = 0;
    expect(updateOcularMetrics(createOcularMetricsState(), sample, 1280, 720, reference)?.metrics.distanceCm).toBeNull();
    expect(updateOcularMetrics(createOcularMetricsState(), sample, 1280, 720, { ...reference, source: "eye-corners" })?.metrics.distanceCm).toBe(60);
    expect(updateOcularMetrics(createOcularMetricsState(), detection(0), 640, 480, reference)?.metrics.distanceCm).toBeNull();
  });

  it("resets distance filtering after face loss, time gaps and reference changes", () => {
    const first = updateOcularMetrics(createOcularMetricsState(), detection(0), 1280, 720, reference)!;
    const missing = updateOcularMetrics(first.state, { ...detection(100), hasFace: false }, 1280, 720, reference)!;
    expect(missing.metrics).toMatchObject({ available: false, ear: null, distanceCm: null, blinkEvent: null });
    expect(updateOcularMetrics(missing.state, detection(200, 0.3, 100), 1280, 720, reference)?.metrics.distanceCm).toBe(120);
    expect(updateOcularMetrics(first.state, detection(1000, 0.3, 100), 1280, 720, reference)?.metrics.distanceCm).toBe(120);
    expect(updateOcularMetrics(first.state, detection(100), 1280, 720, { ...reference, baselineDistanceCm: 90 })?.metrics.distanceCm).toBe(90);
  });

  it("counts blinks and classifies only after enough observed time", () => {
    let state = createOcularMetricsState();
    let result;
    for (let time = 0; time <= 30_000; time += 50) {
      result = updateOcularMetrics(state, detection(time, time >= 1000 && time < 1150 ? 0.1 : 0.3), 1280, 720)!;
      state = result.state;
    }
    expect(result?.metrics).toMatchObject({ blinkRate: { blinkCount: 1, blinksPerMinute: 2 }, visualFatigue: "high-risk" });
    expect(updateOcularMetrics(state, detection(30_000), 1280, 720)).toBeNull();
    const missing = updateOcularMetrics(state, { ...detection(30_050), hasFace: false }, 1280, 720)!;
    expect(missing.metrics.visualFatigue).toBeNull();
  });

  it("does not complete a blink across face loss", () => {
    const first = updateOcularMetrics(createOcularMetricsState(), detection(0), 1280, 720)!;
    const closed = updateOcularMetrics(first.state, detection(50, 0.1), 1280, 720)!;
    const lost = updateOcularMetrics(closed.state, { ...detection(100), hasFace: false }, 1280, 720)!;
    const recovered = updateOcularMetrics(lost.state, detection(200), 1280, 720)!;
    expect(recovered.metrics.blinkEvent).toBeNull();
    expect(recovered.metrics.blinkRate.blinkCount).toBe(0);
  });
});

describe("screen distance head-pose gate", () => {
  it("reuses pitch validation and rejects missing orientation", () => {
    expect(isScreenDistancePoseUsable(matrix)).toBe(true);
    expect(isScreenDistancePoseUsable(null)).toBe(false);
    expect(isScreenDistancePoseUsable(matrix, NaN)).toBe(false);
  });

  it.each([-40, 40])("invalidates a %s degree pitch or yaw without suppressing eye tracking", degrees => {
    const angle = degrees * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
    for (const data of [
      [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, -50, 1],
      [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, -50, 1],
    ]) {
      const sample = { ...detection(0), faceTransformationMatrix: { ...matrix, data } };
      expect(isScreenDistancePoseUsable(sample.faceTransformationMatrix)).toBe(false);
      expect(isScreenDistancePoseUsable(sample.faceTransformationMatrix, 45)).toBe(true);
      expect(updateOcularMetrics(createOcularMetricsState(), sample, 1280, 720, reference)?.metrics)
        .toMatchObject({ available: true, distanceCm: null });
    }
  });
});
