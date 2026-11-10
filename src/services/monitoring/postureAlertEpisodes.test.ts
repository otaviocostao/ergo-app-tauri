import { afterEach, describe, expect, it, vi } from "vitest";
import { PostureStatus } from "../../enums/postureStatus";
import type { PostureCalibrationDTO } from "../../types/postureCalibration";
import type { PostureObservation } from "../../types/postureClassification";
import { classifyPosture } from "../vision/postureClassifier";
import { PostureHysteresis } from "../vision/postureHysteresis";
import { PostureAlertEpisodes } from "./postureAlertEpisodes";

const baseline: PostureCalibrationDTO = {
  cameraDeviceId: "camera-1",
  id: "base", userId: "00000000-0000-4000-8000-000000000001", isActive: true, baselineNeckAngle: 10,
  baselineShoulderBalance: 80, baselineDistanceCm: 60, baselineEyeDistancePx: 200,
};
// Baseline neck 10°: 25° is a 15° deviation (warning), 35° is 25° (danger).
const GOOD = { neckAngle: 10 }, WARNING = { neckAngle: 25 }, DANGER = { neckAngle: 35 };

function setup() {
  const onAlert = vi.fn(), onAlertResolved = vi.fn();
  const hysteresis = new PostureHysteresis();
  const episodes = new PostureAlertEpisodes({ sessionId: "session-1", onAlert, onAlertResolved });
  /** Publishes one classification every 100ms through the real classifier and hysteresis. */
  const publish = (from: number, through: number, changes: Partial<PostureObservation> = {}, captureId = 1) => {
    for (let timestampMs = from; timestampMs <= through; timestampMs += 100) {
      const classification = classifyPosture({
        timestampMs, captureId, neckAngle: 10, shoulderAngle: 2, distanceCm: 60, blinkRate: null, ...changes,
      }, baseline);
      episodes.update(classification, hysteresis.update(classification).alerts);
    }
  };
  return { onAlert, onAlertResolved, episodes, publish };
}

describe("PostureAlertEpisodes", () => {
  afterEach(() => vi.restoreAllMocks());

  it("records the alert when the hysteresis confirms it, stamped at the start of the episode", () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-31T12:00:20.100Z"));
    const { onAlert, publish } = setup();
    publish(0, 20_000, WARNING);
    expect(onAlert).not.toHaveBeenCalled();
    publish(20_100, 20_100, WARNING);
    expect(onAlert).toHaveBeenCalledExactlyOnceWith("neck", {
      sessionId: "session-1", timestamp: "2026-10-31T12:00:00.000Z", alertType: "neck_posture",
      severity: PostureStatus.WARNING, durationSeconds: 20, message: expect.any(String),
    });
  });

  it("keeps a warning→danger escalation as one episode and resolves it with the full duration on recovery", () => {
    const { onAlert, onAlertResolved, publish } = setup();
    publish(0, 30_000, WARNING);
    publish(30_100, 59_900, DANGER);
    expect(onAlert).toHaveBeenCalledOnce();
    expect(onAlertResolved).not.toHaveBeenCalled();
    publish(60_000, 60_000, GOOD);
    expect(onAlertResolved).toHaveBeenCalledExactlyOnceWith("neck", {
      resolvedAt: expect.any(String), durationSeconds: 60, severity: PostureStatus.DANGER,
    });
    publish(60_100, 90_000, GOOD);
    expect(onAlertResolved).toHaveBeenCalledOnce();
  });

  it("ends episodes at the last deviated sample on pause, a sample gap or a new capture", () => {
    const { onAlert, onAlertResolved, episodes, publish } = setup();
    publish(0, 25_000, WARNING);
    episodes.pause();
    expect(onAlertResolved.mock.lastCall).toEqual(["neck", expect.objectContaining({ durationSeconds: 25 })]);

    publish(100_000, 122_000, DANGER);
    publish(122_500, 122_500, DANGER);
    expect(onAlertResolved.mock.lastCall).toEqual(["neck", expect.objectContaining({ durationSeconds: 22, severity: PostureStatus.DANGER })]);

    publish(200_000, 221_000, WARNING, 1);
    publish(221_100, 221_100, WARNING, 2);
    expect(onAlertResolved).toHaveBeenCalledTimes(3);
    expect(onAlert).toHaveBeenCalledTimes(3);
  });

  it("tracks metrics independently and never resolves episodes that were not confirmed", () => {
    const { onAlert, onAlertResolved, episodes, publish } = setup();
    publish(0, 15_000, { ...DANGER, distanceCm: 30 });
    publish(15_100, 25_000, { distanceCm: 30 });
    expect(onAlert).toHaveBeenCalledExactlyOnceWith("distance", expect.objectContaining({
      alertType: "screen_distance", severity: PostureStatus.DANGER,
    }));
    episodes.pause();
    expect(onAlertResolved).toHaveBeenCalledExactlyOnceWith("distance", expect.objectContaining({ durationSeconds: 25 }));
  });

  it("treats an unavailable metric as the end of its episode", () => {
    const { onAlertResolved, publish } = setup();
    publish(0, 25_000, { distanceCm: 30 });
    publish(25_100, 25_100, { distanceCm: null });
    expect(onAlertResolved).toHaveBeenCalledExactlyOnceWith("distance", expect.objectContaining({ durationSeconds: 25 }));
  });
});
