// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Monitoring from "./Monitoring";
import { waitForRecordingWrites } from "../hooks/useMetricRecording";
import { poseDetector, POSE_LANDMARK_INDEX as INDEX, type LandmarkPoint } from "../services/vision";
import type { WorkspaceCalibrationModalProps } from "../components/monitoring/WorkspaceCalibrationModal";
import type { MonitoringSessionItem, EndSessionPayload } from "../types/monitoringSession";
import type { PostureAlert, CreateAlertPayload, ResolveAlertPayload } from "../types/postureAlert";
import type { CreateSnapshotPayload, PostureMetricSnapshot, PostureDominantStatus } from "../types/postureMetricSnapshot";
import type { PostureCalibrationDTO } from "../types/postureCalibration";
import type { SessionHistory } from "../types/sessionHistory";
import type { KeyboardMonitorCardProps } from "../components/monitoring/KeyboardMonitorCard";
import { PostureStatus } from "../enums/postureStatus";

const ipc = vi.hoisted(() => ({ invoke: vi.fn() }));
const view = vi.hoisted(() => ({ keyboard: null as KeyboardMonitorCardProps | null }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: ipc.invoke, isTauri: () => true }));
vi.mock("../auth/AuthContext", () => ({ useOptionalAuth: () => ({ session: { kind: "authenticated", user: { id: 1 } } }) }));
vi.mock("../components/monitoring/KeyboardMonitorCard", () => ({ default: (props: KeyboardMonitorCardProps) => { view.keyboard = props; return null; } }));
vi.mock("../components/monitoring/WorkspaceCalibrationModal", () => ({
  default: (props: WorkspaceCalibrationModalProps) => props.isOpen
    ? <button onClick={() => { props.onCalibrateSubmit(baseline); props.onClose(); }}>Concluir teste da calibração</button> : null
}));

const baseline: PostureCalibrationDTO = {
  id: "base", userId: 1, isActive: true, baselineNeckAngle: 0,
  baselineShoulderBalance: 100, baselineDistanceCm: 60, baselineEyeDistancePx: 200
};
const ABSENCE = "Usuário ausente do posto de trabalho";
const NECK_ALERT = "Desvio persistente do pescoço em relação à postura base.";
function body(): LandmarkPoint[] {
  const points = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0 }));
  for (const [index, x, y] of [[INDEX.NOSE, .5, .2], [INDEX.LEFT_EAR, .45, .3], [INDEX.RIGHT_EAR, .55, .3],
  [INDEX.LEFT_SHOULDER, .3, .6], [INDEX.RIGHT_SHOULDER, .7, .6]]) points[index] = { x, y, z: 0, visibility: 1 };
  return points;
}

describe("monitoring messages from real detection callbacks through recording and history", () => {
  let root: Root;
  let container: HTMLDivElement;
  let sessions: MonitoringSessionItem[];
  let alerts: PostureAlert[];
  let snapshots: PostureMetricSnapshot[];
  let posePresent: boolean;
  let facePresent: boolean;
  let pitch: number;
  let mediaDelay: number;
  let failNextCommand: string | null;
  let posturalEnabled: boolean;
  let activeCalibration: PostureCalibrationDTO | null;
  let tracks: { stop: ReturnType<typeof vi.fn>; onended: ((event: Event) => void) | null; onmute: unknown; onunmute: unknown }[];

  const count = (message: string) => [...container.querySelectorAll("span")].filter(item => item.textContent === message).length;
  async function advance(ms: number) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }
  async function click(label: string) {
    const button = [...container.querySelectorAll("button")].find(item => item.textContent?.trim() === label);
    expect(button, label).toBeDefined(); await act(async () => button!.click());
  }
  async function mountAndStart() {
    await act(async () => root.render(<Monitoring />));
    await click("Iniciar Monitoramento");
    expect(count("Monitoramento iniciado")).toBe(1);
  }
  function storedHistory(): SessionHistory {
    const session = sessions[sessions.length - 1] ?? null;
    const end = session?.endedAt ?? new Date().toISOString();
    const startedAt = Date.parse(session?.startedAt ?? end);
    const completed = Math.floor(Math.max(0, Date.parse(end) - startedAt) / 60_000);
    const first = Math.max(0, completed - 15);
    const timeline: SessionHistory["timeline"] = Array.from({ length: 15 }, (_, index) => {
      const minuteEnd = startedAt + (first + index + 1) * 60_000;
      const saved = snapshots.find(item => item.sessionId === session?.id && Date.parse(item.timestamp) === minuteEnd);
      let state: SessionHistory["timeline"][number]["state"] = minuteEnd > Date.parse(end) ? "pending" : "unavailable";
      let status: PostureStatus | null = null;
      if (saved?.dominantStatus === "absent") state = "absent";
      else if (saved && saved.dominantStatus !== "unavailable" && saved.samplesCount > 0) {
        state = "recorded"; status = saved.dominantStatus;
      }
      return {
        startedAt: new Date(minuteEnd - 60_000).toISOString(), endedAt: new Date(minuteEnd).toISOString(),
        status, state, samplesCount: saved?.samplesCount ?? 0, summariesCount: saved ? 1 : 0
      };
    });
    const evaluated = timeline.filter(item => item.state === "recorded");
    return {
      session, windowStart: new Date(startedAt + first * 60_000).toISOString(), windowEnd: end,
      timeline, adequateSummaryPercentage: evaluated.length ? evaluated.filter(item => item.status === PostureStatus.GOOD).length * 100 / evaluated.length : null,
      alerts: alerts.filter(alert => alert.sessionId === session?.id)
    };
  }

  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-05T15:00:00Z"));
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    sessions = []; alerts = []; snapshots = []; tracks = [];
    posePresent = false; facePresent = true; pitch = 0; mediaDelay = 0; failNextCommand = null; posturalEnabled = true;
    view.keyboard = null;
    activeCalibration = baseline;
    ipc.invoke.mockReset();
    ipc.invoke.mockImplementation(async (command: string, args?: { payload?: unknown }) => {
      if (command === failNextCommand) { failNextCommand = null; throw new Error("Test write failure"); }
      const now = new Date().toISOString();
      if (command === "get_settings" || command === "update_settings") return {
        id: "settings", userId: 1, posturalAnalysis: posturalEnabled,
      ocularAnalysis: true, typingAnalysis: posturalEnabled, webCam: "camera-1", ...(command === "update_settings" ? args?.payload as object : {}) };
  if (command === "get_active_calibration") return activeCalibration;
  if (command === "start_monitoring_session") {
    const session: MonitoringSessionItem = {
      id: `session-${sessions.length + 1}`, userId: 1,
      startedAt: now, endedAt: null, durationSeconds: 0, averageScore: 100,
      goodPosturePercentage: 100, warningPosturePercentage: 0, dangerPosturePercentage: 0, totalAlertsCount: 0
    };
    sessions.push(session); return structuredClone(session);
  }
  if (command === "end_monitoring_session") {
    const payload = args!.payload as EndSessionPayload;
    const index = sessions.findIndex(session => session.id === payload.id);
    sessions[index] = { ...sessions[index], ...payload, endedAt: payload.endedAt ?? now } as MonitoringSessionItem;
    return structuredClone(sessions[index]);
  }
  if (command === "record_posture_alert") {
    const payload = args!.payload as CreateAlertPayload;
    const alert: PostureAlert = {
      ...payload, id: `alert-${alerts.length + 1}`, timestamp: payload.timestamp ?? now,
      severity: payload.severity ?? "warning", durationSeconds: payload.durationSeconds ?? 0,
      persistentDurationSeconds: payload.persistentDurationSeconds ?? undefined, resolvedAt: null
    };
    alerts.push(alert); return structuredClone(alert);
  }
  if (command === "resolve_posture_alert") {
    const payload = args!.payload as ResolveAlertPayload;
    const index = alerts.findIndex(alert => alert.id === payload.id);
    alerts[index] = { ...alerts[index], ...payload, resolvedAt: payload.resolvedAt ?? now } as PostureAlert;
    return structuredClone(alerts[index]);
  }
  if (command === "record_metric_snapshot") {
    const payload = args!.payload as CreateSnapshotPayload;
    const snapshot: PostureMetricSnapshot = {
      ...payload, id: `snapshot-${snapshots.length + 1}`,
      timestamp: payload.timestamp ?? now, dominantStatus: payload.dominantStatus as PostureDominantStatus
    };
    snapshots.push(snapshot); return structuredClone(snapshot);
  }
  if (command === "get_session_history") return structuredClone(storedHistory());
  return null;
});
Object.defineProperty(navigator, "mediaDevices", {
  configurable: true, value: {
    getUserMedia: vi.fn(async () => {
      if (mediaDelay) await new Promise(resolve => setTimeout(resolve, mediaDelay));
      const track = { stop: vi.fn(), onended: null, onmute: null, onunmute: null };
      tracks.push(track);
      return { getTracks: () => [track], getVideoTracks: () => [track] };
    }),
    enumerateDevices: vi.fn(async () => ["camera-1", "camera-2"].map(deviceId => ({ kind: "videoinput", deviceId, label: deviceId }))),
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
  }
});
vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 16));
vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
vi.spyOn(HTMLMediaElement.prototype, "readyState", "get").mockImplementation(function (this: HTMLMediaElement) { return this.srcObject ? 4 : 0; });
vi.spyOn(HTMLVideoElement.prototype, "videoWidth", "get").mockReturnValue(1280);
vi.spyOn(HTMLVideoElement.prototype, "videoHeight", "get").mockReturnValue(720);
vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 800, 450));
const context = Object.fromEntries(["drawImage", "setTransform", "clearRect", "beginPath", "moveTo", "lineTo", "stroke", "arc", "fill", "setLineDash", "strokeRect"].map(name => [name, vi.fn()]));
Object.assign(context, { getImageData: () => ({ data: new Uint8ClampedArray([128, 128, 128, 255]) }) });
vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
vi.spyOn(poseDetector, "isReady").mockReturnValue(true);
vi.spyOn(poseDetector, "initialize").mockResolvedValue();
vi.spyOn(poseDetector, "detectFrame").mockImplementation(() => {
  const angle = pitch * Math.PI / 180; const c = Math.cos(angle), s = Math.sin(angle);
  return {
    hasPose: posePresent, poseLandmarks: posePresent ? body() : null,
    hasFace: posePresent && facePresent, faceLandmarks: null,
    faceTransformationMatrix: facePresent ? { rows: 4, columns: 4, data: [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, -50, 1] } : null,
    worldLandmarks: null, timestamp: performance.now()
  };
});
container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  });
afterEach(async () => {
  await act(async () => { root.unmount(); await waitForRecordingWrites(); });
  container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
});

it("shows start immediately, initial absence at exactly five seconds, and one return per confirmed absence", async () => {
  await mountAndStart(); await advance(4999); expect(count(ABSENCE)).toBe(0);
  await advance(1); expect(count(ABSENCE)).toBe(1);
  await advance(10_000); expect(count(ABSENCE)).toBe(1);
  posePresent = true; await advance(200); expect(count("Usuário presente")).toBe(1);
  for (let index = 0; index < 4; index++) {
    facePresent = false; await advance(200); facePresent = true; await advance(200);
  }
  expect(count("Usuário presente")).toBe(1); expect(count(ABSENCE)).toBe(1);
  posePresent = false; await advance(5200); expect(count(ABSENCE)).toBe(2);
  posePresent = true; await advance(200); expect(count("Usuário presente")).toBe(2);
  await click("Encerrar Monitoramento"); expect(count("Monitoramento encerrado")).toBe(1);
});

it("starts a fresh five-second absence after restart without requiring the user to return first", async () => {
  await mountAndStart(); await advance(5000); expect(count(ABSENCE)).toBe(1);
  await click("Encerrar Monitoramento"); await advance(10_000);
  await click("Iniciar Monitoramento"); await advance(4999); expect(count(ABSENCE)).toBe(0);
  await advance(1); expect(count(ABSENCE)).toBe(1);
  expect(sessions).toHaveLength(2);
});

it("does not add camera startup latency to the five seconds following the start message", async () => {
  mediaDelay = 3000; await mountAndStart(); await advance(4999); expect(count(ABSENCE)).toBe(0);
  await advance(1); expect(count(ABSENCE)).toBe(1);
});

it("shows an alert as soon as its confirmed episode is saved and updates its resolution without duplicate entries", async () => {
  posePresent = true; pitch = 35; await mountAndStart();
  await advance(20_000); expect(count(NECK_ALERT)).toBe(0);
  await advance(400); expect(alerts).toHaveLength(1); expect(count(NECK_ALERT)).toBe(1);
  pitch = 0; await advance(1500);
  expect(alerts[0].resolvedAt).not.toBeNull(); expect(count(NECK_ALERT)).toBe(1);
  expect(container.textContent).toContain("Encerrado · Duração registrada:");
  await advance(40_000); expect(snapshots).toHaveLength(1);
});

it("shows a recording failure rather than silently treating the unsaved alert as recorded", async () => {
  vi.spyOn(console, "error").mockImplementation(() => { });
  failNextCommand = "record_posture_alert"; posePresent = true; pitch = 35;
  await mountAndStart(); await advance(20_400);
  expect(alerts).toHaveLength(0); expect(count(NECK_ALERT)).toBe(0);
  expect(count("Não foi possível salvar o alerta de postura.")).toBe(1);
  pitch = 0; await advance(1500); pitch = 35; await advance(21_000);
  expect(alerts).toHaveLength(1); expect(count(NECK_ALERT)).toBe(1);
});

it("keeps the calibration success visible when the real recording lifecycle replaces the session", async () => {
  posePresent = true; await mountAndStart(); await advance(300);
  await click("Calibrar Postura Base"); await advance(6000);
  expect(count(ABSENCE)).toBe(0);
  await click("Concluir teste da calibração");
  expect(sessions).toHaveLength(2);
  expect(count("Ambiente de trabalho salvo com sucesso")).toBe(1);
  await advance(200); expect(count("Ambiente de trabalho salvo com sucesso")).toBe(1);
});

it("shows camera interruption once and starts the absence clock on the replacement capture", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => { });
  posePresent = true; await mountAndStart(); await advance(300);
  await act(async () => tracks[tracks.length - 1].onended?.(new Event("ended")));
  expect(count("Câmera solicitada por outro aplicativo")).toBe(1);
  await advance(10_000); expect(count(ABSENCE)).toBe(0);
  posePresent = false;
  const select = container.querySelector('[aria-label="Selecionar câmera"]') as HTMLSelectElement;
  await act(async () => { select.value = "camera-2"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  await advance(4999); expect(count(ABSENCE)).toBe(0);
  await advance(1); expect(count(ABSENCE)).toBe(1);
});

it("shows camera preference failures even after the recorded session has ended", async () => {
  vi.spyOn(console, "error").mockImplementation(() => { });
  posePresent = true; await mountAndStart(); await advance(300); await click("Encerrar Monitoramento");
  await advance(100);
  failNextCommand = "update_settings";
  const select = container.querySelector('[aria-label="Selecionar câmera"]') as HTMLSelectElement;
  await act(async () => { select.value = "camera-2"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(count("Não foi possível salvar a câmera padrão.")).toBe(1);
});

it("does not hide live presence messages behind an old session when only ocular analysis is enabled", async () => {
  posturalEnabled = false;
  sessions.push({
    id: "old-posture", userId: 1, startedAt: new Date(Date.now() - 60_000).toISOString(),
    endedAt: new Date(Date.now() - 20_000).toISOString(), durationSeconds: 40, averageScore: 0,
    goodPosturePercentage: 0, warningPosturePercentage: 0, dangerPosturePercentage: 0, totalAlertsCount: 0
  });
  posePresent = true; await act(async () => root.render(<Monitoring />));
  await click("Iniciar Monitoramento"); await advance(200);
  expect(count("Usuário presente")).toBe(1);
  posePresent = false; await advance(5200); expect(count(ABSENCE)).toBe(1);
  expect(ipc.invoke.mock.calls.filter(([command]) => command === "start_monitoring_session")).toHaveLength(0);
});

it("paints the first square at 18:26:00 for a session started at 18:25:00", async () => {
  vi.setSystemTime(new Date("2026-11-05T18:25:00Z"));
  posePresent = true; await mountAndStart(); await advance(59_999);
  const blocks = () => container.querySelector('[aria-label="Qualidade postural por minuto"]')!.children;
  expect(snapshots).toHaveLength(0);
  expect(blocks()[0].className).toContain("border-dashed");
  await advance(1);
  expect(snapshots).toHaveLength(1);
  expect(snapshots[0].timestamp).toBe("2026-11-05T18:26:00.000Z");
  expect(blocks()[0].className).toContain("bg-emerald-500");
  expect(blocks()[1].className).toContain("border-dashed");
});

it("colors partial-presence minutes from their valid readings and paints gray only for a fully absent minute", async () => {
  posePresent = true; await mountAndStart(); await advance(60_000);
  await advance(20_000); posePresent = false; await advance(20_000);
  posePresent = true; await advance(19_999); posePresent = false; await advance(1);
  expect(snapshots).toHaveLength(2);
  expect(snapshots[1].dominantStatus).toBe(PostureStatus.GOOD);
  expect(snapshots[1].samplesCount).toBeGreaterThan(0);
  await advance(60_000);
  expect(snapshots).toHaveLength(3);
  expect(snapshots[2]).toMatchObject({ dominantStatus: "absent", samplesCount: 0, score: 0 });
  const blocks = container.querySelector('[aria-label="Qualidade postural por minuto"]')!.children;
  expect(blocks[0].className).toContain("bg-emerald-500");
  expect(blocks[1].className).toContain("bg-emerald-500");
  expect(blocks[2].className).toContain("bg-slate-400");
  expect(blocks[3].className).toContain("border-dashed");
});

it("does not paint gray when the person is present but no calibration provides valid posture measurements", async () => {
  activeCalibration = null; posePresent = true; await mountAndStart(); await advance(60_000);
  expect(snapshots).toHaveLength(1);
  expect(snapshots[0]).toMatchObject({ dominantStatus: "unavailable", samplesCount: 0 });
  const first = container.querySelector('[aria-label="Qualidade postural por minuto"]')!.children[0];
  expect(first.className).toContain("bg-transparent");
  expect(first.className).not.toContain("bg-slate-400");
  expect(first.getAttribute("title")).toContain("Sem leituras válidas");
});

it("does not invent a full-minute absence when camera permission is denied", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => { });
  vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(new DOMException("Denied", "NotAllowedError"));
  await mountAndStart(); await advance(60_000);
  expect(snapshots).toHaveLength(1);
  expect(snapshots[0].dominantStatus).toBe("unavailable");
  expect(container.querySelector('[aria-label="Qualidade postural por minuto"]')!.children[0].className).toContain("bg-transparent");
  expect(count(ABSENCE)).toBe(0);
});

it("keeps processing failures distinct from a full-minute absence", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => { });
  vi.mocked(poseDetector.detectFrame).mockImplementation(() => { throw new Error("Test detector failure"); });
  await mountAndStart(); await advance(60_000);
  expect(snapshots).toHaveLength(1);
  expect(snapshots[0].dominantStatus).toBe("unavailable");
  expect(container.querySelector('[aria-label="Qualidade postural por minuto"]')!.children[0].className).toContain("bg-transparent");
});
});
