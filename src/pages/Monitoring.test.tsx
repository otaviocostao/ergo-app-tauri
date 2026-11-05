// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Monitoring from "./Monitoring";
import type { WebcamFeedProps } from "../components/monitoring/WebcamFeed";
import type { WorkspaceCalibrationModalProps } from "../components/monitoring/WorkspaceCalibrationModal";
import type { LogEvent } from "../components/monitoring/PostureHistoryLog";
import type { PostureCalibrationDTO } from "../types/postureCalibration";
import type { PostureObservation } from "../types/postureClassification";
import { postureService } from "../services/postureService";
import { classifyPosture } from "../services/vision/postureClassifier";
import type { OcularMetrics } from "../services/vision/ocularMetrics";
import type { KeyboardMonitorCardProps } from "../components/monitoring/KeyboardMonitorCard";
import { settingsService, type ModuleSettings } from "../services/settingsService";

// Browser previews have no IPC; one test enables a simulated desktop runtime.
const ipc = vi.hoisted(() => ({ invoke: vi.fn(), desktop: false }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: ipc.invoke, isTauri: () => ipc.desktop }));

const view = vi.hoisted(() => ({
  feed: null as WebcamFeedProps | null,
  modal: null as WorkspaceCalibrationModalProps | null,
  keyboard: null as KeyboardMonitorCardProps | null,
  logs: [] as LogEvent[],
  userId: 1,
}));
vi.mock("../auth/AuthContext", () => ({ useOptionalAuth: () => ({ session: { kind: "authenticated", user: { id: view.userId } } }) }));
vi.mock("../components/monitoring/WebcamFeed", () => ({ default: (props: WebcamFeedProps) => { view.feed = props; return null; } }));
vi.mock("../components/monitoring/WorkspaceCalibrationModal", () => ({ default: (props: WorkspaceCalibrationModalProps) => { view.modal = props; return null; } }));
vi.mock("../components/monitoring/KeyboardMonitorCard", () => ({ default: (props: KeyboardMonitorCardProps) => { view.keyboard = props; return null; } }));
vi.mock("../components/monitoring/PostureHistoryLog", () => ({ default: ({ logs }: { logs: LogEvent[] }) => { view.logs = logs; return null; } }));

const baseline: PostureCalibrationDTO = {
  id: "base", userId: 1, isActive: true, baselineNeckAngle: 10,
  baselineShoulderBalance: 80, baselineDistanceCm: 60, baselineEyeDistancePx: 200,
};

describe("Monitoring classification and temporal alerts", () => {
  let root: Root;
  let container: HTMLDivElement;

  async function render(strict = false) {
    await act(async () => root.render(strict ? <StrictMode><Monitoring /></StrictMode> : <Monitoring />));
    if (view.feed!.recordingStatus === "idle" && !view.feed!.isMonitoring) await act(async () => view.feed!.onToggleMonitoring!());
    await act(async () => view.feed!.onPresenceChange!("ACTIVE"));
  }

  async function publish(from: number, through: number, changes: Partial<PostureObservation> = {}) {
    await act(async () => {
      for (let timestampMs = from; timestampMs <= through; timestampMs += 100) {
        const observation: PostureObservation = {
          timestampMs, captureId: 1, neckAngle: 10, shoulderAngle: 2, distanceCm: 60, blinkRate: null, ...changes,
        };
        view.feed!.onClassificationUpdate!(classifyPosture(observation, view.feed!.calibration ?? null));
      }
    });
  }

  const alerts = () => view.logs.filter(log => log.id.startsWith("posture:"));

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    view.feed = null; view.modal = null; view.keyboard = null; view.logs = []; view.userId = 1;
    vi.spyOn(postureService, "getActiveCalibration").mockResolvedValue(baseline);
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks();
    vi.useRealTimers();
    ipc.desktop = false; ipc.invoke.mockReset();
  });

  it("persists snapshots with real blinks and one alert per episode from the page's hysteresis", async () => {
    ipc.desktop = true;
    ipc.invoke.mockImplementation(async (command: string, args?: { payload?: Record<string, unknown> }) => {
      if (command === "start_monitoring_session") return { id: "session-1" };
      if (command === "record_posture_alert") return { ...args?.payload, id: "alert-1" };
      return args?.payload;
    });
    const calls = (command: string) => ipc.invoke.mock.calls.filter(([name]) => name === command).map(([, args]) => args.payload);
    // Far above performance.now(), so the page's 1s timer never mistakes the test clock for a gap.
    const base = 1e9;
    await render();
    expect(calls("start_monitoring_session")).toEqual([{ userId: 1 }]);
    const blink = { blinkEvent: "blink", distanceCm: 60, blinkRate: { blinkCount: 1, observedMs: 0, blinksPerMinute: null, isWarmingUp: true } };
    await act(async () => {
      for (let index = 0; index < 3; index++) view.feed!.onOcularUpdate!(blink as unknown as OcularMetrics);
    });
    await publish(base, base + 20_100, { neckAngle: 35 });
    expect(calls("record_posture_alert")).toEqual([expect.objectContaining({
      sessionId: "session-1", alertType: "neck_posture", severity: "danger", durationSeconds: 20,
    })]);
    await publish(base + 20_200, base + 60_000, { neckAngle: 35 });
    expect(calls("record_metric_snapshot")).toEqual([expect.objectContaining({
      sessionId: "session-1", samplesCount: 600, blinkCount: 3, dominantStatus: "danger", avgNeckAngle: 25,
    })]);
    await act(async () => view.feed!.onPresenceChange!("ABSENT"));
    expect(calls("resolve_posture_alert")).toEqual([expect.objectContaining({
      id: "alert-1", durationSeconds: 60, severity: "danger",
    })]);
  });

  it("starts only on request, ignores duplicate clicks and waits for end IPC", async () => {
    vi.spyOn(settingsService, "get").mockResolvedValue(null);
    ipc.desktop = true;
    let finishStart!: (value: { id: string }) => void;
    let finishEnd!: () => void;
    ipc.invoke.mockImplementation((command: string) => {
      if (command === "start_monitoring_session") return new Promise(resolve => { finishStart = resolve; });
      if (command === "end_monitoring_session") return new Promise<void>(resolve => { finishEnd = resolve; });
      return Promise.resolve();
    });
    await act(async () => root.render(<StrictMode><Monitoring /></StrictMode>));
    expect(ipc.invoke).not.toHaveBeenCalled();
    expect(view.feed!.isMonitoring).toBe(false);
    await act(async () => { view.feed!.onToggleMonitoring!(); view.feed!.onToggleMonitoring!(); });
    expect(view.feed!.recordingStatus).toBe("starting");
    expect(view.feed!.isMonitoring).toBe(false);
    expect(ipc.invoke).toHaveBeenCalledTimes(1);
    await act(async () => finishStart({ id: "one" }));
    expect(view.feed!.isMonitoring).toBe(true);
    await act(async () => { view.feed!.onToggleMonitoring!(); view.feed!.onToggleMonitoring!(); });
    expect(view.feed!.recordingStatus).toBe("ending");
    expect(view.feed!.isMonitoring).toBe(false);
    await act(async () => finishEnd());
    expect(view.feed!.recordingStatus).toBe("idle");
    expect(ipc.invoke.mock.calls.map(([command]) => command)).toEqual(["start_monitoring_session", "end_monitoring_session"]);
  });

  it("runs good posture, sustained danger, first alert, cooldown and a repeat through the existing history", async () => {
    await render(); await publish(0, 1000);
    expect(alerts()).toEqual([]);
    await publish(1100, 21_100, { neckAngle: 35 });
    expect(alerts()).toEqual([]);
    expect(container.textContent).toContain("Atenção: Pescoço Muito Inclinado!");
    await publish(21_200, 21_200, { neckAngle: 35 });
    expect(alerts()).toHaveLength(1);
    expect(alerts()[0]).toMatchObject({ type: "error", message: "Ajuste a posição do pescoço" });
    await publish(21_300, 201_100, { neckAngle: 35 });
    expect(alerts()).toHaveLength(1);
    await publish(201_200, 201_200, { neckAngle: 35 });
    expect(alerts()).toHaveLength(2);
  });

  it("announces the initial presence once and ignores brief occlusions until a confirmed absence", async () => {
    vi.useFakeTimers();
    await render();
    await act(async () => {
      for (let index = 0; index < 10; index++) {
        view.feed!.onPresenceChange!("PARTIALLY_OCCLUDED");
        view.feed!.onPresenceChange!("ACTIVE");
      }
    });
    expect(view.logs.filter(log => log.message === "Usuário presente")).toHaveLength(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    await act(async () => {
      view.feed!.onPresenceChange!("ABSENT"); view.feed!.onPresenceChange!("ABSENT");
      view.feed!.onPresenceChange!("PARTIALLY_OCCLUDED");
      view.feed!.onPresenceChange!("ACTIVE");
      view.feed!.onPresenceChange!("PARTIALLY_OCCLUDED");
      view.feed!.onPresenceChange!("ACTIVE");
    });
    expect(view.logs.filter(log => log.message === "Usuário ausente do posto de trabalho")).toHaveLength(1);
    expect(view.logs.filter(log => log.message === "Usuário presente")).toHaveLength(2);
    expect(view.logs.every(log => log.occurredAt && Number.isFinite(Date.parse(log.occurredAt)))).toBe(true);
  });

  it("defers the initial absence until fifteen seconds after starting, even without another detector callback", async () => {
    vi.useFakeTimers();
    await act(async () => root.render(<Monitoring />));
    await act(async () => view.feed!.onToggleMonitoring!());
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); view.feed!.onPresenceChange!("ABSENT"); });
    expect(view.logs.filter(log => log.message === "Usuário ausente do posto de trabalho")).toHaveLength(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(9_999); });
    expect(view.logs.filter(log => log.message === "Usuário ausente do posto de trabalho")).toHaveLength(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(view.logs.filter(log => log.message === "Usuário ausente do posto de trabalho")).toHaveLength(1);
    await act(async () => {
      view.feed!.onPresenceChange!("ABSENT"); view.feed!.onPresenceChange!("ACTIVE");
      await vi.advanceTimersByTimeAsync(5_000); view.feed!.onPresenceChange!("ABSENT");
    });
    expect(view.logs.filter(log => log.message === "Usuário ausente do posto de trabalho")).toHaveLength(2);
    expect(view.logs.filter(log => log.message === "Usuário presente")).toHaveLength(1);
  });

  it("cancels an initial absence notice on recovery and preserves the usual later absence rule", async () => {
    vi.useFakeTimers(); await render();
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); view.feed!.onPresenceChange!("ABSENT"); });
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); view.feed!.onPresenceChange!("ACTIVE"); });
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(view.logs.filter(log => log.message === "Usuário ausente do posto de trabalho")).toHaveLength(0);
    expect(view.logs.filter(log => log.message === "Usuário presente")).toHaveLength(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); view.feed!.onPresenceChange!("ABSENT"); });
    expect(view.logs.filter(log => log.message === "Usuário ausente do posto de trabalho")).toHaveLength(1);
  });

  it("cancels the pending startup notice on stop and grants a fresh window only on explicit restart", async () => {
    vi.useFakeTimers(); await render();
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); view.feed!.onPresenceChange!("ABSENT"); });
    await act(async () => view.feed!.onToggleMonitoring!());
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    expect(view.logs.filter(log => log.message === "Usuário ausente do posto de trabalho")).toHaveLength(0);
    await act(async () => view.feed!.onToggleMonitoring!());
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); view.feed!.onPresenceChange!("ABSENT"); });
    await act(async () => { await vi.advanceTimersByTimeAsync(9_999); });
    expect(view.logs.filter(log => log.message === "Usuário ausente do posto de trabalho")).toHaveLength(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(view.logs.filter(log => log.message === "Usuário ausente do posto de trabalho")).toHaveLength(1);
  });

  it("cancels startup notices during calibration without adding another grace period on resume", async () => {
    vi.useFakeTimers(); await render();
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); view.feed!.onPresenceChange!("ABSENT"); });
    await act(async () => view.feed!.onCalibrate!());
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(view.logs.filter(log => log.message === "Usuário ausente do posto de trabalho")).toHaveLength(0);
    await act(async () => view.modal!.onClose());
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); view.feed!.onPresenceChange!("ABSENT"); });
    expect(view.logs.filter(log => log.message === "Usuário ausente do posto de trabalho")).toHaveLength(1);
  });

  it("does not announce presence before starting or after stopping and announces it on the next explicit start", async () => {
    await act(async () => root.render(<Monitoring />));
    await act(async () => view.feed!.onPresenceChange!("ACTIVE"));
    expect(view.logs.filter(log => log.message === "Usuário presente")).toHaveLength(0);
    await act(async () => view.feed!.onToggleMonitoring!());
    await act(async () => view.feed!.onPresenceChange!("ACTIVE"));
    expect(view.logs.filter(log => log.message === "Usuário presente")).toHaveLength(1);
    await act(async () => view.feed!.onToggleMonitoring!());
    await act(async () => {
      view.feed!.onPresenceChange!("ABSENT");
      view.feed!.onPresenceChange!("ACTIVE");
    });
    expect(view.logs.filter(log => log.message === "Usuário ausente do posto de trabalho")).toHaveLength(0);
    expect(view.logs.filter(log => log.message === "Usuário presente")).toHaveLength(1);
    await act(async () => view.feed!.onToggleMonitoring!());
    await act(async () => view.feed!.onPresenceChange!("ACTIVE"));
    expect(view.logs.filter(log => log.message === "Usuário presente")).toHaveLength(2);
  });

  it("keeps the presence announcement across calibration and emits a success notice for its owner", async () => {
    await render();
    await act(async () => view.feed!.onCalibrate!());
    await act(async () => {
      view.feed!.onPresenceChange!("PARTIALLY_OCCLUDED");
      view.feed!.onPresenceChange!("ABSENT");
      view.modal!.onCalibrateSubmit({ ...baseline, id: "new" });
      view.modal!.onClose();
    });
    await act(async () => view.feed!.onPresenceChange!("ACTIVE"));
    expect(view.logs.filter(log => log.message === "Usuário presente")).toHaveLength(1);
    expect(view.logs.filter(log => log.message === "Usuário ausente do posto de trabalho")).toHaveLength(0);
    expect(view.logs.filter(log => log.message === "Ambiente de trabalho salvo com sucesso")).toEqual([
      expect.objectContaining({ scope: "account", userId: 1, type: "success" }),
    ]);
  });

  it("resets invalid or recovered channels without delaying independent metrics", async () => {
    await render(); await publish(0, 10_000, { neckAngle: 35, shoulderAngle: 10 });
    await publish(10_100, 10_100, { neckAngle: null, shoulderAngle: 10 });
    await publish(10_200, 20_100, { neckAngle: 35, shoulderAngle: 10 });
    expect(alerts()).toHaveLength(1);
    expect(alerts()[0].message).toBe("Ajuste o alinhamento dos ombros");
    await publish(20_200, 30_300, { neckAngle: 35 });
    expect(alerts()).toHaveLength(2);
    await publish(30_400, 30_400);
    await publish(30_500, 60_000);
    expect(alerts()).toHaveLength(2);
  });

  it("does not emit during pause and preserves cooldown on resume", async () => {
    await render(); await publish(0, 20_100, { neckAngle: 35 });
    expect(alerts()).toHaveLength(1);
    await act(async () => view.feed!.onToggleMonitoring!());
    await publish(20_200, 50_000, { neckAngle: 35 });
    expect(alerts()).toHaveLength(1);
    await act(async () => view.feed!.onToggleMonitoring!());
    await publish(50_100, 80_000, { neckAngle: 35 });
    expect(alerts()).toHaveLength(1);
  });

  it("suspends alerts during calibration and applies the newly saved baseline", async () => {
    await render(); await publish(0, 10_000, { neckAngle: 35 });
    await act(async () => view.feed!.onCalibrate!());
    expect(view.feed!.isMonitoring).toBe(false);
    await publish(10_100, 40_000, { neckAngle: 35 });
    expect(alerts()).toEqual([]);
    await act(async () => {
      view.modal!.onCalibrateSubmit({ ...baseline, id: "new", baselineNeckAngle: 35 });
      view.modal!.onClose();
    });
    await publish(40_100, 70_000, { neckAngle: 35 });
    expect(alerts()).toEqual([]);
    expect(container.textContent).toContain("Postura Excelente");
  });

  it("can alert on low blink frequency without a posture baseline, after valid warm-up", async () => {
    vi.mocked(postureService.getActiveCalibration).mockResolvedValue(null);
    await render();
    const warmUp = { blinkCount: 0, observedMs: 29_000, blinksPerMinute: null, isWarmingUp: true };
    await publish(0, 30_000, { blinkRate: warmUp });
    expect(alerts()).toEqual([]);
    const measured = { blinkCount: 0, observedMs: 30_000, blinksPerMinute: 0, isWarmingUp: false };
    await publish(30_100, 50_100, { blinkRate: measured });
    expect(alerts()).toEqual([]);
    await publish(50_200, 50_200, { blinkRate: measured });
    expect(alerts()).toHaveLength(1);
    expect(alerts()[0].message).toBe("Frequência de piscadas reduzida");
    expect(container.textContent).toContain("Aguardando calibração");
  });

  it("resets delivery history when the authenticated account changes", async () => {
    await render(); await publish(0, 20_100, { neckAngle: 35 });
    expect(alerts()).toHaveLength(1);
    view.userId = 2;
    vi.mocked(postureService.getActiveCalibration).mockResolvedValue({ ...baseline, id: "user-2", userId: 2 });
    await render(); await publish(20_200, 40_200, { neckAngle: 35 });
    expect(alerts()).toHaveLength(0);
    await publish(40_300, 40_300, { neckAngle: 35 });
    expect(alerts()).toHaveLength(1);
    expect(postureService.getActiveCalibration).toHaveBeenLastCalledWith(2);
  });

  it("does not duplicate notifications under StrictMode", async () => {
    await render(true); await publish(0, 30_000, { neckAngle: 35 });
    expect(alerts()).toHaveLength(1);
  });

  it("requests recalibration instead of inventing a saturated shoulder baseline", async () => {
    vi.mocked(postureService.getActiveCalibration).mockResolvedValue({ ...baseline, baselineShoulderBalance: 0 });
    await render(); await publish(0, 30_000, { shoulderAngle: 20 });
    expect(container.textContent).toContain("Recalibre a postura base");
    expect(alerts()).toEqual([]);
  });

  it("ignores obsolete callback closures after pausing or changing account", async () => {
    await render();
    const obsolete = view.feed!.onClassificationUpdate!;
    await act(async () => view.feed!.onToggleMonitoring!());
    await act(async () => {
      for (let timestampMs = 0; timestampMs <= 30_000; timestampMs += 100) {
        obsolete(classifyPosture({
          timestampMs, captureId: 1, neckAngle: 35, shoulderAngle: 2,
          distanceCm: 60, blinkRate: null
        }, baseline));
      }
    });
    expect(alerts()).toEqual([]);
    view.userId = 2;
    vi.mocked(postureService.getActiveCalibration).mockResolvedValue({ ...baseline, id: "user-2", userId: 2 });
    await render();
    await act(async () => view.feed!.onToggleMonitoring!());
    await act(async () => {
      for (let timestampMs = 30_100; timestampMs <= 60_000; timestampMs += 100) {
        obsolete(classifyPosture({
          timestampMs, captureId: 1, neckAngle: 35, shoulderAngle: 2,
          distanceCm: 60, blinkRate: null
        }, baseline));
      }
    });
    expect(alerts()).toEqual([]);
  });

  it("displays 100% shoulder balance when matching calibrated baseline with non-zero angle, and lowers on deviation", async () => {
    // baselineShoulderBalance: 80 corresponds to (100 - 80) / 10 = 2 degrees
    await render();
    await publish(0, 500, { shoulderAngle: 2 });
    expect(container.textContent).toContain("Alinhamento Ombros");
    expect(container.textContent).toContain("100%");

    // Deviating by 2 degrees (shoulderAngle: 4) lowers balance by 20% to 80%
    await publish(600, 1000, { shoulderAngle: 4 });
    expect(container.textContent).toContain("80%");
  });

  describe("default webcam", () => {
    const saved = (webCam: string | null): ModuleSettings => ({
      id: "settings-1", userId: 1, posturalAnalysis: true, ocularAnalysis: true, typingAnalysis: true,
      webCam, createdAt: "", updatedAt: "",
    });
    const updates = () => ipc.invoke.mock.calls.filter(([name]) => name === "update_settings").map(([, args]) => args);

    beforeEach(() => {
      ipc.desktop = true;
      ipc.invoke.mockImplementation(async (command: string, args?: { payload?: Record<string, unknown> }) => {
        if (command === "update_settings") return { ...saved(null), ...args?.payload };
        if (command === "start_monitoring_session") return { id: "session-1" };
        return args?.payload;
      });
    });

    it("hands the saved webcam to monitoring and calibration", async () => {
      vi.spyOn(settingsService, "get").mockResolvedValue(saved("camera-2"));
      await render();
      expect(view.feed!.preferredDeviceId).toBe("camera-2");
      expect(view.modal!.preferredDeviceId).toBe("camera-2");
    });

    it("saves the camera picked in the select as the new default", async () => {
      vi.spyOn(settingsService, "get").mockResolvedValue(saved("camera-1"));
      await render();
      await act(async () => view.feed!.onDeviceSelect!("camera-2"));
      expect(updates()).toEqual([{ payload: { webCam: "camera-2" } }]);
      expect(view.feed!.preferredDeviceId).toBe("camera-2");
      expect(view.modal!.preferredDeviceId).toBe("camera-2");

      await act(async () => view.modal!.onDeviceSelect!("camera-3"));
      expect(updates()).toEqual([{ payload: { webCam: "camera-2" } }, { payload: { webCam: "camera-3" } }]);
      expect(view.feed!.preferredDeviceId).toBe("camera-3");
    });

    it("keeps the chosen camera and reports when the default cannot be saved", async () => {
      vi.spyOn(settingsService, "get").mockResolvedValue(saved(null));
      vi.spyOn(console, "error").mockImplementation(() => { });
      await render();
      ipc.invoke.mockRejectedValueOnce("database locked");
      await act(async () => view.feed!.onDeviceSelect!("camera-2"));
      expect(updates()).toEqual([{ payload: { webCam: "camera-2" } }]);
      expect(view.feed!.preferredDeviceId).toBe("camera-2");
      expect(view.logs[0]).toMatchObject({ type: "error", message: "Não foi possível salvar a câmera padrão." });
    });

    it("does not save anything without account settings", async () => {
      vi.spyOn(settingsService, "get").mockResolvedValue(null);
      await render();
      expect(view.feed!.preferredDeviceId).toBeNull();
      await act(async () => view.feed!.onDeviceSelect!("camera-2"));
      expect(updates()).toEqual([]);
    });
  });

  describe("with disabled modules", () => {
    const modules = (changes: Partial<ModuleSettings>) => vi.spyOn(settingsService, "get").mockResolvedValue({
      id: "settings-1", userId: 1, posturalAnalysis: true, ocularAnalysis: true, typingAnalysis: true,
      webCam: null, createdAt: "", updatedAt: "", ...changes,
    });
    const inactiveCards = () => [...container.querySelectorAll("[data-module-inactive] h3")].map(title => title.textContent);
    const persisted = (command: string) => ipc.invoke.mock.calls.filter(([name]) => name === command);
    const lowBlinks = { blinkCount: 0, observedMs: 30_000, blinksPerMinute: 0, isWarmingUp: false };

    beforeEach(() => {
      ipc.desktop = true;
      ipc.invoke.mockImplementation(async (command: string, args?: { payload?: Record<string, unknown> }) => {
        if (command === "start_monitoring_session") return { id: "session-1" };
        if (command === "record_posture_alert") return { ...args?.payload, id: "alert-1" };
        return args?.payload;
      });
    });

    it("keeps every card active when the account has no saved settings", async () => {
      vi.spyOn(settingsService, "get").mockResolvedValue(null);
      await render();
      expect(inactiveCards()).toEqual([]);
      expect(view.keyboard!.enabled).toBe(true);
    });

    it("marks the posture cards inactive and neither alerts nor records posture", async () => {
      modules({ posturalAnalysis: false });
      await render();
      expect(inactiveCards()).toEqual(["Inclinação do Pescoço", "Alinhamento Ombros", "Distância da Tela", "Postura da Coluna"]);
      expect(container.textContent).toContain("Análise postural desativada em Configurações → Módulos.");
      expect(container.textContent).toContain("Análise postural inativa");

      await publish(1e9, 1e9 + 61_000, { neckAngle: 35, shoulderAngle: 10, distanceCm: 30 });
      expect(alerts()).toEqual([]);
      expect(persisted("record_posture_alert")).toEqual([]);
      expect(persisted("record_metric_snapshot")).toEqual([]);
      expect(view.keyboard!.enabled).toBe(true);
    });

    it("does not open an empty session while the postural module is disabled", async () => {
      modules({ posturalAnalysis: false });
      await render();
      expect(view.feed!.isMonitoring).toBe(true);
      await act(async () => view.feed!.onToggleMonitoring!());
      await act(async () => view.feed!.onToggleMonitoring!());
      await act(async () => root.unmount());
      root = createRoot(container);
      expect(persisted("start_monitoring_session")).toEqual([]);
      expect(persisted("end_monitoring_session")).toEqual([]);
    });

    it("waits for the settings before opening a session or turning the camera on", async () => {
      let resolve!: (settings: ModuleSettings | null) => void;
      vi.spyOn(settingsService, "get").mockReturnValue(new Promise(done => { resolve = done; }));
      await act(async () => root.render(<Monitoring />));
      expect(view.feed!.isMonitoring).toBe(false);
      expect(view.feed!.disabledMessage).toBeNull();
      expect(persisted("start_monitoring_session")).toEqual([]);
      await act(async () => view.feed!.onToggleMonitoring!());
      expect(view.feed!.isMonitoring).toBe(false);
      await act(async () => resolve(null));
      expect(view.feed!.isMonitoring).toBe(true);
      expect(persisted("start_monitoring_session")).toEqual([["start_monitoring_session", { payload: { userId: 1 } }]]);
    });

    it("turns the camera off when both camera modules are disabled", async () => {
      modules({ posturalAnalysis: false, ocularAnalysis: false });
      await act(async () => root.render(<Monitoring />));
      expect(view.feed!.isMonitoring).toBe(false);
      expect(view.feed!.disabledMessage).toContain("A câmera fica desligada");
      expect(persisted("start_monitoring_session")).toEqual([]);
      expect(view.keyboard!.enabled).toBe(true);
    });

    it("keeps the camera on for the ocular module alone", async () => {
      modules({ posturalAnalysis: false, typingAnalysis: false });
      await render();
      expect(view.feed!.isMonitoring).toBe(true);
      expect(view.feed!.disabledMessage).toBeNull();
    });

    it("keeps the blink rate alert while only the postural module is disabled", async () => {
      modules({ posturalAnalysis: false });
      await render();
      await publish(0, 20_200, { neckAngle: 35, blinkRate: lowBlinks });
      expect(alerts().map(alert => alert.message)).toEqual(["Frequência de piscadas reduzida"]);
    });

    it("marks the blink and distance cards inactive and stops ocular alerts", async () => {
      modules({ ocularAnalysis: false });
      await render();
      expect(inactiveCards()).toEqual(["Distância da Tela", "Taxa de Piscadas"]);
      expect(container.textContent).toContain("Análise ocular desativada em Configurações → Módulos.");

      await act(async () => view.feed!.onOcularUpdate!({
        blinkEvent: "blink", distanceCm: 60, blinkRate: { blinkCount: 1, observedMs: 0, blinksPerMinute: null, isWarmingUp: true },
      } as unknown as OcularMetrics));
      await publish(1e9, 1e9 + 61_000, { distanceCm: 30, blinkRate: lowBlinks });
      expect(alerts()).toEqual([]);
      expect(persisted("record_metric_snapshot")).toEqual([[
        "record_metric_snapshot",
        { payload: expect.objectContaining({ blinkCount: 0, avgDistanceCm: null, dominantStatus: "good" }) },
      ]]);

      await publish(1e9 + 61_100, 1e9 + 81_300, { neckAngle: 35 });
      expect(alerts().map(alert => alert.message)).toEqual(["Ajuste a posição do pescoço"]);
    });

    it("marks the typing card inactive without affecting the camera metrics", async () => {
      modules({ typingAnalysis: false });
      await render();
      expect(view.keyboard!.enabled).toBe(false);
      expect(inactiveCards()).toEqual([]);
    });
  });
});
