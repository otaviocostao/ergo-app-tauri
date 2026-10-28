import { describe, expect, it } from "vitest";
import { PostureStatus as Status } from "../../enums/postureStatus";
import type { PostureClassification, PostureMetric } from "../../types/postureClassification";
import { createBlinkRateState, updateBlinkRate } from "./blinkRate";
import { classifyBlinkFrequency } from "./postureClassifier";
import { PostureHysteresis } from "./postureHysteresis";

function frame(timestampMs: number, levels: Partial<Record<PostureMetric, Status | null>> = {}, captureId = 1, baselineId: string | null = "base"): PostureClassification {
  const metric = (key: PostureMetric) => ({ value: levels[key] === null ? null : 1, status: levels[key] === undefined ? Status.GOOD : levels[key]! });
  return { timestampMs, captureId, baselineId,
    metrics: { neck: metric("neck"), shoulders: metric("shoulders"), distance: metric("distance"), "blink-rate": metric("blink-rate") },
    postureStatus: Status.GOOD,
  };
}

function feed(engine: PostureHysteresis, from: number, through: number, levels: Partial<Record<PostureMetric, Status | null>>) {
  const emitted = [];
  for (let timestamp = from; timestamp <= through; timestamp += 100) emitted.push(...engine.update(frame(timestamp, levels)).alerts);
  return emitted;
}

describe("posture temporal hysteresis", () => {
  it.each(["neck", "shoulders", "distance", "blink-rate"] as const)("requires strictly more than 20s for %s, emitting only once", metric => {
    const engine = new PostureHysteresis();
    expect(feed(engine, 0, 20_000, { [metric]: Status.WARNING })).toEqual([]);
    expect(engine.update(frame(20_001, { [metric]: Status.WARNING })).alerts).toEqual([
      { metric, level: Status.WARNING, startedAtMs: 0, durationMs: 20_001 },
    ]);
    const next = engine.update(frame(20_100, { [metric]: Status.WARNING }));
    expect(next.alerts).toEqual([]);
    expect(next.sustained).toHaveLength(1);
    expect(feed(engine, 20_200, 30_000, { [metric]: Status.WARNING })).toEqual([]);
  });

  it.each([Status.GOOD, null])("immediately resets a timer when its reading becomes %s", recovered => {
    const engine = new PostureHysteresis();
    feed(engine, 0, 10_000, { neck: Status.DANGER });
    engine.update(frame(10_100, { neck: recovered }));
    expect(feed(engine, 10_200, 30_200, { neck: Status.DANGER })).toEqual([]);
    expect(engine.update(frame(30_201, { neck: Status.DANGER })).alerts[0]?.startedAtMs).toBe(10_200);
  });

  it.each([[Status.WARNING, Status.DANGER], [Status.DANGER, Status.WARNING]])("starts a new timer when %s changes to %s", (before, after) => {
    const engine = new PostureHysteresis();
    feed(engine, 0, 10_000, { shoulders: before });
    expect(feed(engine, 10_100, 30_100, { shoulders: after })).toEqual([]);
    expect(engine.update(frame(30_101, { shoulders: after })).alerts[0]).toMatchObject({ level: after, startedAtMs: 10_100 });
  });

  it("tracks simultaneous metrics without cross-resetting their timers", () => {
    const engine = new PostureHysteresis();
    feed(engine, 0, 4900, { neck: Status.WARNING });
    feed(engine, 5000, 20_000, { neck: Status.WARNING, distance: Status.DANGER });
    expect(engine.update(frame(20_001, { neck: Status.WARNING, distance: Status.DANGER })).alerts.map(a => a.metric)).toEqual(["neck"]);
    feed(engine, 20_100, 25_000, { neck: Status.WARNING, distance: Status.DANGER });
    expect(engine.update(frame(25_001, { neck: Status.WARNING, distance: Status.DANGER })).alerts.map(a => a.metric)).toEqual(["distance"]);
  });

  it("does not count suspended processing as observed poor posture", () => {
    const engine = new PostureHysteresis();
    feed(engine, 0, 10_000, { neck: Status.DANGER });
    expect(engine.update(frame(40_000, { neck: Status.DANGER })).alerts).toEqual([]);
    expect(feed(engine, 40_100, 60_000, { neck: Status.DANGER })).toEqual([]);
    expect(engine.update(frame(60_001, { neck: Status.DANGER })).alerts[0]?.startedAtMs).toBe(40_000);
  });

  it("accepts the configured maximum gap exactly and resets above it", () => {
    const engine = new PostureHysteresis();
    for (let timestamp = 0; timestamp <= 20_000; timestamp += 250) engine.update(frame(timestamp, { neck: Status.WARNING }));
    expect(engine.update(frame(20_250, { neck: Status.WARNING })).alerts).toHaveLength(1);
    expect(engine.update(frame(20_501, { neck: Status.WARNING })).sustained).toEqual([]);
  });

  it.each(["capture", "baseline", "pause"])("does not inherit a timer after changing %s", change => {
    const engine = new PostureHysteresis();
    feed(engine, 0, 20_000, { neck: Status.DANGER });
    if (change === "pause") engine.resetContinuity();
    expect(engine.update(frame(20_100, { neck: Status.DANGER }, change === "capture" ? 2 : 1, change === "baseline" ? "new" : "base")).alerts).toEqual([]);
  });

  it("does not advance on invalid, duplicate or regressive timestamps", () => {
    const engine = new PostureHysteresis();
    feed(engine, 0, 20_000, { neck: Status.DANGER });
    for (const timestamp of [NaN, Infinity, -1, 20_000, 19_999]) expect(engine.update(frame(timestamp, { neck: Status.DANGER })).alerts).toEqual([]);
    expect(engine.update(frame(20_001, { neck: Status.DANGER })).alerts).toHaveLength(1);
  });

  it("treats invalid metric values as unavailable", () => {
    const engine = new PostureHysteresis();
    feed(engine, 0, 20_000, { neck: Status.DANGER });
    const invalid = frame(20_001, { neck: Status.DANGER });
    engine.update({ ...invalid, metrics: { ...invalid.metrics, neck: { status: Status.DANGER, value: NaN } } });
    expect(engine.update(frame(20_100, { neck: Status.DANGER })).alerts).toEqual([]);
  });

  it("uses configurable persistence independently for blink fatigue", () => {
    const engine = new PostureHysteresis({ persistenceMs: 15_000, blinkPersistenceMs: 30_000 });
    expect(feed(engine, 0, 15_000, { neck: Status.WARNING, "blink-rate": Status.WARNING })).toEqual([]);
    expect(engine.update(frame(15_001, { neck: Status.WARNING, "blink-rate": Status.WARNING })).alerts.map(a => a.metric)).toEqual(["neck"]);
    feed(engine, 15_100, 30_000, { neck: Status.WARNING, "blink-rate": Status.WARNING });
    expect(engine.update(frame(30_001, { neck: Status.WARNING, "blink-rate": Status.WARNING })).alerts.map(a => a.metric)).toEqual(["blink-rate"]);
  });

  it("starts blink persistence only after the existing window has warmed up", () => {
    const engine = new PostureHysteresis();
    let rateState = createBlinkRateState();
    const alerts = [];
    for (let timestamp = 0; timestamp <= 50_100; timestamp += 100) {
      const rate = updateBlinkRate(rateState, timestamp, true, timestamp > 0 && timestamp % 10_000 === 0)!;
      rateState = rate.state;
      alerts.push(...engine.update(frame(timestamp, { "blink-rate": classifyBlinkFrequency(rate.measurement) })).alerts);
    }
    expect(alerts).toEqual([{ metric: "blink-rate", level: Status.WARNING, startedAtMs: 30_000, durationMs: 20_100 }]);
  });
});
