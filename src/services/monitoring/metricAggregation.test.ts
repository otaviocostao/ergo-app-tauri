import { describe, expect, it, vi } from "vitest";
import { PostureStatus } from "../../enums/postureStatus";
import type { ProcessedPostureFrame } from "../../types/vision";
import type { PostureCalibrationDTO } from "../../types/postureCalibration";
import { classifyPosture } from "../vision/postureClassifier";
import { MetricAggregation, calculateErgoScore, frameFromClassification } from "./metricAggregation";
import { RingBuffer } from "./ringBuffer";

function frame(timestampMs: number, overrides: Partial<ProcessedPostureFrame> = {}): ProcessedPostureFrame {
  return { timestampMs, neckAngle: 5, shoulderBalance: 100, distanceCm: 60, status: PostureStatus.GOOD, ...overrides };
}

function setup() {
  const onSnapshot = vi.fn();
  const aggregation = new MetricAggregation({ sessionId: "session-1", onSnapshot });
  return { aggregation, onSnapshot };
}

const baseline: PostureCalibrationDTO = {
  id: "base", userId: 1, isActive: true, baselineNeckAngle: 10,
  baselineShoulderBalance: 80, baselineDistanceCm: 60, baselineEyeDistancePx: 200,
};

describe("RingBuffer", () => {
  it("keeps only the most recent items in chronological order after multiple wraps", () => {
    const buffer = new RingBuffer<number>(3);
    for (let index = 0; index < 10; index++) buffer.push(index);
    expect(buffer.size).toBe(3);
    expect(buffer.values()).toEqual([7, 8, 9]);
    buffer.clear();
    expect(buffer.values()).toEqual([]);
    expect(buffer.size).toBe(0);
    buffer.push(10);
    expect(buffer.values()).toEqual([10]);
  });

  it("rejects an invalid capacity", () => {
    for (const capacity of [0, -1, 1.5, NaN]) expect(() => new RingBuffer(capacity)).toThrow();
  });
});

describe("frameFromClassification", () => {
  it("uses baseline deviations, the card's shoulder balance and real distance without rounding", () => {
    const classification = classifyPosture({
      timestampMs: 1_000, captureId: 1, neckAngle: 25.5, shoulderAngle: 3.25, distanceCm: 47.4, blinkRate: null,
    }, baseline);
    expect(frameFromClassification(classification, 2)).toEqual({
      timestampMs: 1_000, neckAngle: 15.5, shoulderBalance: 87.5, distanceCm: 47.4,
      status: PostureStatus.WARNING, blinkCount: 2,
    });
  });

  it("keeps unavailable metrics as null and skips inferences without a posture status", () => {
    const noFace = classifyPosture({
      timestampMs: 1_000, captureId: 1, neckAngle: 10, shoulderAngle: 2, distanceCm: null, blinkRate: null,
    }, baseline);
    expect(frameFromClassification(noFace)).toMatchObject({ neckAngle: 0, shoulderBalance: 100, distanceCm: null });
    const noBaseline = classifyPosture({
      timestampMs: 1_000, captureId: 1, neckAngle: 10, shoulderAngle: 2, distanceCm: null, blinkRate: null,
    }, null);
    expect(frameFromClassification(noBaseline)).toBeNull();
  });
});

describe("MetricAggregation", () => {
  it("closes at 60 seconds with means, peaks, per-frame weighted scores and a deterministic dominant status", () => {
    const { aggregation, onSnapshot } = setup();
    for (let index = 0; index < 600; index++) {
      aggregation.recordFrame(frame(index * 100, {
        ...(index >= 300 ? { neckAngle: 30, shoulderBalance: 80, distanceCm: 40, status: PostureStatus.DANGER } : {}),
        blinkCount: index % 60 === 0 ? 1 : 0,
      }));
    }
    aggregation.tick(59_999);
    expect(onSnapshot).not.toHaveBeenCalled();
    aggregation.tick(60_000);
    expect(onSnapshot).toHaveBeenCalledExactlyOnceWith({
      sessionId: "session-1", timestamp: expect.any(String),
      avgNeckAngle: 17.5, maxNeckAngle: 30,
      avgShoulderBalance: 90, minShoulderBalance: 80,
      avgDistanceCm: 50, blinkCount: 10,
      dominantStatus: PostureStatus.DANGER, score: 67.5, samplesCount: 600,
    });
    expect(aggregation.samplesCount).toBe(0);
    aggregation.tick(60_000);
    expect(onSnapshot).toHaveBeenCalledTimes(1);
    for (let index = 600; index < 1200; index++) aggregation.recordFrame(frame(index * 100));
    aggregation.tick(120_000);
    expect(onSnapshot).toHaveBeenCalledTimes(2);
    expect(onSnapshot.mock.lastCall?.[0]).toMatchObject({ maxNeckAngle: 5, score: 100, blinkCount: 0, samplesCount: 600 });
  });

  it("averages only available values and persists null for a metric missing the whole window", () => {
    const { aggregation, onSnapshot } = setup();
    for (let index = 0; index < 600; index++) {
      aggregation.recordFrame(frame(index * 100, { distanceCm: null, neckAngle: index % 2 ? null : 8 }));
    }
    aggregation.tick(60_000);
    expect(onSnapshot.mock.lastCall?.[0]).toMatchObject({
      avgNeckAngle: 8, maxNeckAngle: 8, avgDistanceCm: null, samplesCount: 600, score: 100,
    });
  });

  it("covers the full minute at the ~11 FPS inference rate", () => {
    const { aggregation, onSnapshot } = setup();
    for (let index = 0; index < 667; index++) {
      aggregation.recordFrame(frame(index * 90, { neckAngle: index === 0 ? 80 : 20 }));
    }
    aggregation.tick(60_000);
    expect(onSnapshot.mock.lastCall?.[0]).toMatchObject({ samplesCount: 667, maxNeckAngle: 80 });
  });

  it("never flushes just because capacity is reached, and keeps the latest 720 frames above 12 FPS", () => {
    const { aggregation, onSnapshot } = setup();
    for (let index = 0; index < 1200; index++) {
      aggregation.recordFrame(frame(index * 50, { neckAngle: index < 480 ? 80 : 20 }));
      expect(aggregation.samplesCount).toBeLessThanOrEqual(720);
    }
    expect(onSnapshot).not.toHaveBeenCalled();
    aggregation.tick(60_000);
    expect(onSnapshot.mock.lastCall?.[0]).toMatchObject({ samplesCount: 720, avgNeckAngle: 20, maxNeckAngle: 20 });
  });

  it("persists the actual sample count at lower FPS", () => {
    const { aggregation, onSnapshot } = setup();
    for (let index = 0; index < 300; index++) aggregation.recordFrame(frame(index * 200));
    aggregation.tick(60_000);
    expect(onSnapshot.mock.lastCall?.[0].samplesCount).toBe(300);
  });

  it("places a frame on the minute boundary in the next window and releases raw data before dispatch", () => {
    let samplesAtDispatch = -1;
    const aggregation = new MetricAggregation({
      sessionId: "session-1",
      onSnapshot: () => { samplesAtDispatch = aggregation.samplesCount; },
    });
    for (let index = 0; index <= 600; index++) aggregation.recordFrame(frame(index * 100));
    expect(samplesAtDispatch).toBe(0);
    expect(aggregation.samplesCount).toBe(1);
  });

  it("keeps valid readings across a pause and closes the original session minute", () => {
    const { aggregation, onSnapshot } = setup();
    for (let index = 0; index < 100; index++) aggregation.recordFrame(frame(index * 100, { status: PostureStatus.WARNING, neckAngle: 18 }));
    aggregation.pause();
    expect(aggregation.samplesCount).toBe(100);
    aggregation.tick(30_000);
    expect(onSnapshot).not.toHaveBeenCalled();
    for (let index = 300; index < 600; index++) aggregation.recordFrame(frame(index * 100));
    aggregation.tick(60_000);
    expect(onSnapshot.mock.lastCall?.[0]).toMatchObject({ samplesCount: 400, maxNeckAngle: 18, dominantStatus: PostureStatus.GOOD });
  });

  it("does not count missing frames as capture time", () => {
    const { aggregation, onSnapshot } = setup();
    for (let index = 0; index < 200; index++) aggregation.recordFrame(frame(index * 100, { status: PostureStatus.WARNING }));
    aggregation.tick(60_000);
    expect(aggregation.samplesCount).toBe(0);
    aggregation.recordFrame(frame(90_000, { status: PostureStatus.DANGER }));
    expect(onSnapshot).toHaveBeenCalledTimes(1);
    expect(onSnapshot.mock.lastCall?.[0]).toMatchObject({ samplesCount: 200, dominantStatus: PostureStatus.WARNING });
    expect(aggregation.sessionSummary().durationSeconds).toBe(19);
  });

  it("skips invalid measurements without discarding the window, and ignores duplicate or out-of-order timestamps", () => {
    const { aggregation, onSnapshot } = setup();
    aggregation.recordFrame(frame(100));
    aggregation.recordFrame(frame(100));
    aggregation.recordFrame(frame(90));
    expect(aggregation.samplesCount).toBe(1);
    for (const invalid of [
      { neckAngle: NaN }, { distanceCm: Infinity }, { distanceCm: 0 },
      { shoulderBalance: 101 }, { timestampMs: -1 }, { blinkCount: -1 },
      { status: "unknown" as PostureStatus },
    ]) {
      aggregation.recordFrame(frame(200, invalid));
      expect(aggregation.samplesCount).toBe(1);
    }
    for (let index = 2; index < 600; index++) aggregation.recordFrame(frame(index * 100));
    aggregation.tick(60_100);
    expect(onSnapshot.mock.lastCall?.[0].samplesCount).toBe(599);
  });

  it("retains immutable scalar copies and session totals after raw data is discarded", () => {
    const { aggregation, onSnapshot } = setup();
    const measurement = frame(0);
    aggregation.recordFrame(measurement);
    measurement.neckAngle = 100;
    for (let index = 1; index < 600; index++) aggregation.recordFrame(frame(index * 100));
    aggregation.tick(60_000);
    aggregation.pause();
    expect(onSnapshot.mock.lastCall?.[0].maxNeckAngle).toBe(5);
    expect(aggregation.sessionSummary()).toMatchObject({
      averageScore: 100, goodPosturePercentage: 100, warningPosturePercentage: 0, dangerPosturePercentage: 0,
    });
  });

  it("penalises only the excess beyond each good range and clamps the heuristic score to 0–100", () => {
    expect(calculateErgoScore({ neckAngle: 12, shoulderBalance: 70, distanceCm: 75 })).toBe(100);
    expect(calculateErgoScore({ neckAngle: null, shoulderBalance: null, distanceCm: null })).toBe(100);
    expect(calculateErgoScore({ neckAngle: 20, shoulderBalance: 40, distanceCm: 85 })).toBe(100 - 20 - 15 - 20);
    expect(calculateErgoScore({ neckAngle: 180, shoulderBalance: 0, distanceCm: 10 })).toBe(0);
  });

  it("closes at 18:26:00 when the session began at 18:25:00, even when the first reading arrives late", () => {
    const onSnapshot = vi.fn();
    const aggregation = new MetricAggregation({ sessionId: "fixed", onSnapshot, startedAtMs: 42,
      startedAtEpochMs: Date.parse("2026-11-05T18:25:00Z") });
    for (let time = 10_042; time < 60_042; time += 100) aggregation.recordFrame(frame(time));
    aggregation.tick(60_041); expect(onSnapshot).not.toHaveBeenCalled();
    aggregation.tick(60_042);
    expect(onSnapshot).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      timestamp: "2026-11-05T18:26:00.000Z", samplesCount: 500, dominantStatus: PostureStatus.GOOD,
    }));
  });

  it("keeps exact UTC minute timestamps with a fractional monotonic start", () => {
    const onSnapshot = vi.fn(); const start = 42.123456;
    const aggregation = new MetricAggregation({ sessionId: "fractional", onSnapshot,
      startedAtMs: start, startedAtEpochMs: Date.parse("2026-11-05T18:25:00Z") });
    aggregation.recordFrame(frame(start + 1000)); aggregation.tick(start + 60_000);
    expect(onSnapshot.mock.lastCall?.[0].timestamp).toBe("2026-11-05T18:26:00.000Z");
  });

  it("marks only a fully observed absent minute as absent and keeps missing calibration distinct", () => {
    const { aggregation, onSnapshot } = setup();
    for (let time = 0; time < 60_000; time += 100) aggregation.observePresence({ timestampMs: time, hasBody: false });
    aggregation.tick(60_000);
    expect(onSnapshot.mock.lastCall?.[0]).toMatchObject({ dominantStatus: "absent", samplesCount: 0,
      avgNeckAngle: null, avgDistanceCm: null, score: 0 });
    for (let time = 60_000; time < 120_000; time += 100) aggregation.observePresence({ timestampMs: time, hasBody: true });
    aggregation.tick(120_000);
    expect(onSnapshot.mock.lastCall?.[0]).toMatchObject({ dominantStatus: "unavailable", samplesCount: 0 });
  });

  it("colors a mixed minute from its valid readings instead of classifying the whole minute as absent", () => {
    const { aggregation, onSnapshot } = setup();
    for (let time = 0; time < 60_000; time += 100) {
      const present = time < 20_000 || time >= 40_000;
      aggregation.observePresence({ timestampMs: time, hasBody: present });
      if (present) aggregation.recordFrame(frame(time, { status: PostureStatus.WARNING, neckAngle: 18 }));
      else aggregation.pause();
    }
    aggregation.tick(60_000);
    expect(onSnapshot.mock.lastCall?.[0]).toMatchObject({ dominantStatus: PostureStatus.WARNING, samplesCount: 400, avgNeckAngle: 18 });
  });

  it("does not turn a camera interruption into a confirmed full-minute absence", () => {
    const { aggregation, onSnapshot } = setup();
    for (let time = 0; time < 20_000; time += 100) aggregation.observePresence({ timestampMs: time, hasBody: false });
    aggregation.pause(); aggregation.tick(60_000);
    expect(onSnapshot.mock.lastCall?.[0]).toMatchObject({ dominantStatus: "unavailable", samplesCount: 0 });
  });

  it("catches up missed minute deadlines without repeating stale absence or posture evidence", () => {
    const { aggregation, onSnapshot } = setup();
    for (let time = 0; time < 60_000; time += 100) aggregation.observePresence({ timestampMs: time, hasBody: false });
    aggregation.tick(180_000);
    expect(onSnapshot.mock.calls.map(([payload]) => payload.dominantStatus)).toEqual(["absent", "unavailable", "unavailable"]);
    expect(new Set(onSnapshot.mock.calls.map(([payload]) => payload.timestamp)).size).toBe(3);
  });

  it("assigns a presence observation and reading exactly at the boundary to the next minute", () => {
    const { aggregation, onSnapshot } = setup();
    for (let time = 0; time < 60_000; time += 100) aggregation.observePresence({ timestampMs: time, hasBody: false });
    aggregation.observePresence({ timestampMs: 60_000, hasBody: true });
    aggregation.recordFrame(frame(60_000));
    expect(onSnapshot.mock.lastCall?.[0].dominantStatus).toBe("absent");
    aggregation.tick(120_000);
    expect(onSnapshot.mock.lastCall?.[0]).toMatchObject({ dominantStatus: PostureStatus.GOOD, samplesCount: 1 });
  });
});
