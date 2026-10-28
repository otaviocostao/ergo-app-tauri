import { describe, expect, it } from "vitest";
import { PostureStatus as Status } from "../../enums/postureStatus";
import type { PostureAlertCondition, PostureClassification } from "../../types/postureClassification";
import { PostureAlertCooldown } from "./postureAlertCooldown";
import { PostureHysteresis } from "./postureHysteresis";

const neck: PostureAlertCondition = { metric: "neck", level: Status.WARNING, startedAtMs: 0, durationMs: 20_001 };

describe("posture alert cooldown", () => {
  it("allows the first alert, blocks before 3 minutes and permits the exact boundary", () => {
    const cooldown = new PostureAlertCooldown();
    expect(cooldown.ready([neck], 20_001)).toEqual([neck]);
    cooldown.markNotified([neck], 20_001);
    expect(cooldown.ready([neck], 20_001)).toEqual([]);
    expect(cooldown.ready([neck], 200_000)).toEqual([]);
    expect(cooldown.ready([neck], 200_001)).toEqual([neck]);
    cooldown.markNotified([neck], 200_001);
    expect(cooldown.ready([neck], 200_002)).toEqual([]);
  });

  it("identifies duplicates by metric and level, independently of duration or direction", () => {
    const cooldown = new PostureAlertCooldown();
    cooldown.markNotified([neck], 20_001);
    const same = { ...neck, durationMs: 30_000 };
    const otherLevel: PostureAlertCondition = { ...neck, level: Status.DANGER };
    const otherMetric = { ...neck, metric: "shoulders" as const };
    expect(cooldown.ready([same, otherLevel, otherMetric], 20_100)).toEqual([otherLevel, otherMetric]);
  });

  it("does not consume cooldown for events that were not delivered", () => {
    const cooldown = new PostureAlertCooldown();
    expect(cooldown.ready([neck, neck], 20_001)).toEqual([neck]);
    expect(cooldown.ready([neck], 20_100)).toEqual([neck]);
  });

  it("uses a validated custom duration", () => {
    const cooldown = new PostureAlertCooldown({ cooldownMs: 120_000 });
    cooldown.markNotified([neck], 20_001);
    expect(cooldown.ready([neck], 140_000)).toEqual([]);
    expect(cooldown.ready([neck], 140_001)).toEqual([neck]);
  });

  it("ignores invalid or backward time without weakening an existing cooldown", () => {
    const cooldown = new PostureAlertCooldown();
    cooldown.markNotified([neck], 20_001);
    for (const timestamp of [NaN, Infinity, -1, 20_000]) {
      expect(cooldown.ready([neck], timestamp)).toEqual([]);
      cooldown.markNotified([neck], timestamp);
    }
    expect(cooldown.ready([neck], 20_100)).toEqual([]);
    expect(cooldown.ready([neck], 200_001)).toEqual([neck]);
  });

  it("does not retain another account's notification history", () => {
    const cooldown = new PostureAlertCooldown();
    cooldown.markNotified([neck], 20_001);
    cooldown.reset();
    expect(cooldown.ready([neck], 0)).toEqual([neck]);
  });

  it("repeats only after cooldown while hysteresis continues to observe the condition", () => {
    const hysteresis = new PostureHysteresis();
    const cooldown = new PostureAlertCooldown();
    const events: number[] = [];
    let transitionEvents = 0;
    for (let timestamp = 0; timestamp <= 200_200; timestamp += 100) {
      const classification: PostureClassification = {
        timestampMs: timestamp, captureId: 1, baselineId: "base", postureStatus: Status.WARNING,
        metrics: { neck: { value: 15, status: Status.WARNING }, shoulders: { value: 0, status: Status.GOOD },
          distance: { value: 60, status: Status.GOOD }, "blink-rate": { value: null, status: null } },
      };
      const result = hysteresis.update(classification);
      transitionEvents += result.alerts.length;
      const ready = cooldown.ready(result.sustained, timestamp);
      if (ready.length) {
        events.push(timestamp);
        cooldown.markNotified(ready, timestamp);
      }
    }
    expect(transitionEvents).toBe(1);
    expect(events).toEqual([20_100, 200_100]);
  });

  it("does not deliver a blocked condition later if it has recovered", () => {
    const cooldown = new PostureAlertCooldown();
    cooldown.markNotified([neck], 20_001);
    expect(cooldown.ready([neck], 30_000)).toEqual([]);
    expect(cooldown.ready([], 200_001)).toEqual([]);
  });
});
