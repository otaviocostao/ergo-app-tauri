// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMetricRecording } from "./useMetricRecording";
import { classifyPosture } from "../services/vision/postureClassifier";
import { PostureHysteresis } from "../services/vision/postureHysteresis";
import type { PostureCalibrationDTO } from "../types/postureCalibration";

const ipc = vi.hoisted(() => ({ invoke: vi.fn(), desktop: true }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: ipc.invoke, isTauri: () => ipc.desktop }));

const baseline: PostureCalibrationDTO = {
  id: "base", userId: 7, isActive: true, baselineNeckAngle: 10,
  baselineShoulderBalance: 80, baselineDistanceCm: 60, baselineEyeDistancePx: 200,
};
// Neck angle for each status against the 10° baseline (deviation 0°, 15° and 25°).
const NECK_ANGLE = { good: 10, warning: 25, danger: 35 };

describe("useMetricRecording IPC lifecycle", () => {
  let root: Root;
  let container: HTMLDivElement;
  let recorder: ReturnType<typeof useMetricRecording>;
  let frameTimer: ReturnType<typeof setInterval> | undefined;
  const onEvent = vi.fn();
  let sessionNumber: number;

  function Harness({ enabled, userId }: { enabled: boolean; userId: number | null }) {
    recorder = useMetricRecording(enabled, userId, onEvent);
    return null;
  }

  async function render(enabled = true, strict = false, userId: number | null = 7) {
    await act(async () => root.render(strict
      ? <StrictMode><Harness enabled={enabled} userId={userId} /></StrictMode>
      : <Harness enabled={enabled} userId={userId} />));
  }

  /** Classifies a frame every 100ms through the real classifier and hysteresis, as the page does. */
  function feed(status: keyof typeof NECK_ANGLE = "good", blinksPerFrame = 0) {
    const hysteresis = new PostureHysteresis();
    const record = () => {
      const classification = classifyPosture({
        timestampMs: performance.now(), captureId: 1, neckAngle: NECK_ANGLE[status],
        shoulderAngle: 2, distanceCm: 60, blinkRate: null,
      }, baseline);
      recorder.recordClassification(classification, hysteresis.update(classification).alerts, blinksPerFrame);
    };
    record();
    frameTimer = setInterval(record, 100);
  }

  async function advance(milliseconds: number) {
    await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds); });
  }

  function commands() {
    return ipc.invoke.mock.calls.map(([command]) => command);
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-31T12:00:00Z"));
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    sessionNumber = 0;
    ipc.desktop = true;
    ipc.invoke.mockReset();
    onEvent.mockReset();
    ipc.invoke.mockImplementation(async (command: string, args?: { payload?: unknown }) => {
      if (command === "start_monitoring_session") return { id: `session-${++sessionNumber}` };
      if (command === "record_posture_alert") return { ...(args?.payload as object), id: "alert-1" };
      return args?.payload;
    });
    container = document.createElement("div"); document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    clearInterval(frameTimer);
    frameTimer = undefined;
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("creates an owned session and dispatches aggregate-only snapshots and persistent alerts", async () => {
    await render();
    expect(ipc.invoke).toHaveBeenCalledWith("start_monitoring_session", { payload: { userId: 7 } });
    feed("danger", 1);
    await advance(20_000);
    expect(commands()).not.toContain("record_posture_alert");
    await advance(100);
    expect(commands().filter(command => command === "record_posture_alert")).toHaveLength(1);
    expect(ipc.invoke).toHaveBeenCalledWith("record_posture_alert", { payload: expect.objectContaining({
      sessionId: "session-1", alertType: "neck_posture", severity: "danger", durationSeconds: 20,
    }) });
    await advance(39_800);
    expect(commands()).not.toContain("record_metric_snapshot");
    await advance(100);
    const snapshot = ipc.invoke.mock.calls.find(([command]) => command === "record_metric_snapshot")?.[1].payload;
    expect(snapshot).toMatchObject({
      sessionId: "session-1", samplesCount: 600, dominantStatus: "danger", score: 67.5,
      avgNeckAngle: 25, avgShoulderBalance: 100, avgDistanceCm: 60, blinkCount: 600,
    });
    expect(snapshot).not.toHaveProperty("frames");
    expect(snapshot).not.toHaveProperty("landmarks");
    // Alert notifications stay with the page's cooldown; the hook only reports failures.
    expect(onEvent).not.toHaveBeenCalled();
    expect(commands()).not.toContain("resolve_posture_alert");
    await render(false);
    expect(commands().slice(-2)).toEqual(["resolve_posture_alert", "end_monitoring_session"]);
    expect(ipc.invoke).toHaveBeenCalledWith("resolve_posture_alert", { payload: {
      id: "alert-1", resolvedAt: expect.any(String), durationSeconds: 60, severity: "danger",
    } });
    expect(ipc.invoke.mock.lastCall?.[1].payload).toMatchObject({
      id: "session-1", durationSeconds: 60, averageScore: 67.5, dangerPosturePercentage: 100,
    });
  });

  it("starts a new session owned by the new user when the account changes", async () => {
    await render(true, false, 7);
    await render(true, false, 9);
    await render(false, false, 9);
    const starts = ipc.invoke.mock.calls.filter(([command]) => command === "start_monitoring_session");
    expect(starts.map(([, args]) => args.payload.userId)).toEqual([7, 9]);
    expect(commands().filter(command => command === "end_monitoring_session")).toHaveLength(2);
  });

  it("discards partial data and timers on disable and starts a fresh session on resume", async () => {
    await render(); feed(); await advance(30_000);
    clearInterval(frameTimer);
    await render(false);
    await advance(120_000);
    expect(commands()).not.toContain("record_metric_snapshot");
    expect(vi.getTimerCount()).toBe(0);
    await render(true); feed(); await advance(60_000);
    const snapshots = ipc.invoke.mock.calls.filter(([command]) => command === "record_metric_snapshot");
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0][1].payload).toMatchObject({ sessionId: "session-2", samplesCount: 600 });
  });

  it("restarts the full window after a presence pause without restarting the session", async () => {
    await render(); feed("warning"); await advance(10_000);
    clearInterval(frameTimer);
    recorder.pause();
    await advance(50_000);
    feed(); await advance(60_000);
    expect(commands().filter(command => command === "start_monitoring_session")).toHaveLength(1);
    expect(commands().filter(command => command === "record_metric_snapshot")).toHaveLength(1);
    expect(commands()).not.toContain("record_posture_alert");
  });

  it("waits for in-flight writes before ending the session and starting another", async () => {
    let resolveWrite!: () => void;
    const deferred = new Promise<void>(resolve => { resolveWrite = resolve; });
    const implementation = ipc.invoke.getMockImplementation()!;
    ipc.invoke.mockImplementation((command: string, args?: { payload?: unknown }) =>
      command === "record_metric_snapshot" ? deferred : implementation(command, args));
    await render(); feed(); await advance(60_000);
    clearInterval(frameTimer);
    await render(false); await render(true);
    expect(commands()).not.toContain("end_monitoring_session");
    expect(sessionNumber).toBe(1);
    await act(async () => resolveWrite());
    expect(sessionNumber).toBe(2);
    const history = commands();
    expect(history.indexOf("end_monitoring_session")).toBeLessThan(history.lastIndexOf("start_monitoring_session"));
  });

  it("surfaces IPC failures, releases the failed window and continues with later snapshots", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const implementation = ipc.invoke.getMockImplementation()!;
    let failSnapshot = true;
    ipc.invoke.mockImplementation((command: string, args?: { payload?: unknown }) => {
      if (command === "record_metric_snapshot" && failSnapshot) {
        failSnapshot = false;
        return Promise.reject(new Error("database unavailable"));
      }
      return implementation(command, args);
    });
    await render(); feed(); await advance(120_000);
    expect(onEvent).toHaveBeenCalledWith({ type: "error", message: expect.stringContaining("salvar o resumo") });
    expect(commands().filter(command => command === "record_metric_snapshot")).toHaveLength(2);
    await render(false);
    expect(commands().slice(-1)[0]).toBe("end_monitoring_session");
  });

  it("closes a session whose creation resolves after cancellation before allowing a new start", async () => {
    let resolveStart!: (session: { id: string }) => void;
    const deferred = new Promise<{ id: string }>(resolve => { resolveStart = resolve; });
    const implementation = ipc.invoke.getMockImplementation()!;
    let first = true;
    ipc.invoke.mockImplementation((command: string, args?: { payload?: unknown }) => {
      if (command === "start_monitoring_session" && first) { first = false; return deferred; }
      return implementation(command, args);
    });
    await render(); await render(false); await render(true);
    expect(commands().filter(command => command === "start_monitoring_session")).toHaveLength(1);
    await act(async () => resolveStart({ id: "late-session" }));
    const history = commands();
    expect(history.filter(command => command === "start_monitoring_session")).toHaveLength(2);
    expect(history.indexOf("end_monitoring_session")).toBeLessThan(history.lastIndexOf("start_monitoring_session"));
    expect(ipc.invoke).toHaveBeenCalledWith("end_monitoring_session", { payload: expect.objectContaining({ id: "late-session" }) });
  });

  it("does not duplicate sessions, snapshots or timers under StrictMode", async () => {
    await render(true, true); feed(); await advance(60_000);
    expect(commands().filter(command => command === "start_monitoring_session")).toHaveLength(1);
    expect(commands().filter(command => command === "record_metric_snapshot")).toHaveLength(1);
    await render(false, true);
    clearInterval(frameTimer);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not fabricate persistence in browser previews", async () => {
    ipc.desktop = false;
    await render(); feed("danger"); await advance(120_000);
    expect(ipc.invoke).not.toHaveBeenCalled();
    expect(onEvent).not.toHaveBeenCalled();
    clearInterval(frameTimer);
    expect(vi.getTimerCount()).toBe(0);
  });
});
