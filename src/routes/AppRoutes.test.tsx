// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Link, MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AppRoutes from "./AppRoutes";
import type { Session } from "../auth/authService";
import type { WebcamFeedProps } from "../components/monitoring/WebcamFeed";
import type { WorkspaceCalibrationModalProps } from "../components/monitoring/WorkspaceCalibrationModal";
import { postureService } from "../services/postureService";
import { classifyPosture } from "../services/vision/postureClassifier";
import { waitForRecordingWrites } from "../hooks/useMetricRecording";
import type { PostureCalibrationDTO } from "../types/postureCalibration";
import { settingsService, type ModuleSettings } from "../services/settingsService";
import { Module } from "../enums/module";

const ipc = vi.hoisted(() => ({ invoke: vi.fn() }));
const view = vi.hoisted(() => ({
  feed: null as WebcamFeedProps | null,
  modal: null as WorkspaceCalibrationModalProps | null,
  session: { kind: "anonymous" } as Session,
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: ipc.invoke, isTauri: () => true }));
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ session: view.session, loading: false }),
  useOptionalAuth: () => ({ session: view.session }),
}));
vi.mock("../theme/ThemeContext", () => ({ useTheme: () => ({ isInitializing: false }) }));
vi.mock("../theme/ThemeFeedback", () => ({ default: () => null }));
vi.mock("../components/Sidebar", () => ({ default: () => null }));
vi.mock("../pages/Dashboard", () => ({ default: () => <p>Início de teste</p> }));
vi.mock("../pages/Settings", () => ({ default: () => <p>Configurações de teste</p> }));
vi.mock("../pages/Reports", () => ({ default: () => null }));
vi.mock("../pages/Reminders", () => ({ default: () => null }));
vi.mock("../pages/Login", () => ({ default: () => <p>Login de teste</p> }));
vi.mock("../pages/Register", () => ({ default: () => null }));
vi.mock("../components/auth/AuthLayout", () => ({ default: () => <p>Área de acesso</p> }));
vi.mock("../components/monitoring/WebcamFeed", () => ({
  default: (props: WebcamFeedProps) => {
    view.feed = props;
    return <video data-testid="monitoring-camera" />;
  }
}));
vi.mock("../components/monitoring/WorkspaceCalibrationModal", () => ({
  default: (props: WorkspaceCalibrationModalProps) => {
    view.modal = props;
    return null;
  }
}));
vi.mock("../components/monitoring/KeyboardMonitorCard", () => ({ default: () => null }));

const baseline: PostureCalibrationDTO = {
  id: "base", userId: 1, isActive: true, baselineNeckAngle: 10,
  baselineShoulderBalance: 80, baselineDistanceCm: 60, baselineEyeDistancePx: 200,
};

describe("monitoring across authenticated routes", () => {
  let root: Root;
  let container: HTMLDivElement;

  const calls = (command: string) => ipc.invoke.mock.calls.filter(([name]) => name === command);
  const camera = () => container.querySelector('[data-testid="monitoring-camera"]');
  const authenticate = (id: number) => {
    view.session = { kind: "authenticated", user: { id } } as Session;
  };
  async function render(initialEntry = "/") {
    await act(async () => root.render(
      <StrictMode><MemoryRouter initialEntries={[initialEntry]}>
        <nav><Link to="/">Início</Link><Link to="/monitoring">Monitorar</Link><Link to="/settings">Configurações</Link></nav>
        <AppRoutes />
      </MemoryRouter></StrictMode>,
    ));
  }
  async function navigate(label: string) {
    const link = [...container.querySelectorAll("nav a")].find(item => item.textContent === label)!;
    await act(async () => { link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 })); });
  }
  async function toggle() {
    const button = [...container.querySelectorAll("button")].find(item =>
      item.textContent?.includes("Monitoramento") || item.textContent?.includes("Tentar Novamente"))!;
    await act(async () => button.click());
  }
  async function publish(from: number, through: number) {
    await act(async () => {
      for (let timestampMs = from; timestampMs <= through; timestampMs += 100) {
        vi.mocked(performance.now).mockReturnValue(timestampMs);
        view.feed!.onClassificationUpdate!(classifyPosture({
          timestampMs, captureId: 1, neckAngle: 10, shoulderAngle: 2, distanceCm: 60, blinkRate: null,
        }, baseline));
      }
    });
  }

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.spyOn(performance, "now").mockReturnValue(0);
    authenticate(1);
    view.feed = null;
    ipc.invoke.mockImplementation(async (command: string, args?: { payload?: Record<string, unknown> }) => {
      if (command === "start_monitoring_session") return { id: `session-${calls(command).length}` };
      return args?.payload;
    });
    vi.spyOn(postureService, "getActiveCalibration").mockResolvedValue(baseline);
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => { root.unmount(); await waitForRecordingWrites(); });
    container.remove(); vi.restoreAllMocks(); ipc.invoke.mockReset();
  });

  it("keeps the same camera and recording session, including a snapshot spanning navigation", async () => {
    await render();
    expect(camera()).toBeNull();
    await navigate("Monitorar");
    const originalCamera = camera();
    expect(originalCamera).not.toBeNull();
    expect(container.querySelectorAll("video")).toHaveLength(1);
    expect(calls("start_monitoring_session")).toHaveLength(0);
    await toggle();
    expect(view.feed!.isMonitoring).toBe(true);
    const base = 0;
    await publish(base, base + 30_000);
    await navigate("Configurações");
    expect(container.textContent).toContain("Configurações de teste");
    expect(camera()).toBe(originalCamera);
    expect(camera()!.closest("[hidden]")).not.toBeNull();
    expect(view.feed!.isMonitoring).toBe(true);
    expect(calls("end_monitoring_session")).toHaveLength(0);
    await publish(base + 30_100, base + 60_000);
    expect(calls("record_metric_snapshot")).toEqual([["record_metric_snapshot", {
      payload: expect.objectContaining({ sessionId: "session-1", samplesCount: 600 }),
    }]]);
    await navigate("Início");
    await navigate("Monitorar");
    expect(camera()).toBe(originalCamera);
    expect(camera()!.closest("[hidden]")).toBeNull();
    expect(calls("start_monitoring_session")).toHaveLength(1);
    await toggle();
    expect(calls("end_monitoring_session")).toHaveLength(1);
    expect(calls("end_monitoring_session")[0][1].payload).toMatchObject({ id: "session-1", durationSeconds: 60 });
  });

  it("preserves an explicit stop when navigating away and returning", async () => {
    await render(); await navigate("Monitorar"); await toggle(); await toggle();
    await navigate("Início"); await navigate("Monitorar");
    expect(view.feed!.isMonitoring).toBe(false);
    expect(view.feed!.recordingStatus).toBe("idle");
    expect(calls("start_monitoring_session")).toHaveLength(1);
    expect(calls("end_monitoring_session")).toHaveLength(1);
  });

  it("applies module and webcam changes from Settings without remounting or restarting unchanged monitoring", async () => {
    let settings: ModuleSettings = {
      id: "settings-1", userId: 1, posturalAnalysis: true, ocularAnalysis: true, typingAnalysis: true,
      webCam: "camera-1", createdAt: "", updatedAt: "",
    };
    ipc.invoke.mockImplementation(async (command: string, args?: { payload?: Record<string, unknown> }) => {
      if (command === "get_settings") {
        return settings;
      }

      if (command === "set_module_enabled") {
        const field = args?.payload?.module === Module.POSTURAL_ANALYSIS
          ? "posturalAnalysis"
          : args?.payload?.module === Module.OCULAR_ANALYSIS
            ? "ocularAnalysis"
            : "typingAnalysis";
        settings = { ...settings, [field]: args?.payload?.enabled };
        return settings;
      }
      if (command === "update_settings") {
        settings = { ...settings, ...args?.payload }; return settings;
      }

      if (command === "start_monitoring_session") {
        return { id: `session-${calls(command).length}` };
      }

      return args?.payload;
    });
    await render(); await navigate("Monitorar"); await toggle();
    const originalCamera = camera();
    await navigate("Configurações");
    await act(async () => { await settingsService.setWebCam("camera-2"); });
    expect(view.feed!.preferredDeviceId).toBe("camera-2");
    expect(view.modal!.preferredDeviceId).toBe("camera-2");
    expect(calls("start_monitoring_session")).toHaveLength(1);
    expect(calls("end_monitoring_session")).toHaveLength(0);
    await act(async () => { await settingsService.setModuleEnabled(Module.POSTURAL_ANALYSIS, false); });
    expect(calls("end_monitoring_session")).toHaveLength(0);
    expect(view.feed!.isMonitoring).toBe(true);
    expect(view.feed!.moduleSettings?.posturalAnalysis).toBe(false);
    await act(async () => { await settingsService.setModuleEnabled(Module.OCULAR_ANALYSIS, false); });
    expect(view.feed!.isMonitoring).toBe(false);
    await act(async () => { await settingsService.setModuleEnabled(Module.TYPING_ANALYSIS, false); });
    expect(calls("end_monitoring_session")).toHaveLength(1);
    await act(async () => { await settingsService.setModuleEnabled(Module.POSTURAL_ANALYSIS, true); });
    expect(view.feed!.isMonitoring).toBe(true);
    expect(calls("start_monitoring_session")).toHaveLength(2);
    await navigate("Monitorar");
    expect(camera()).toBe(originalCamera);
    expect(view.feed!.preferredDeviceId).toBe("camera-2");
  });

  it.each(["/MONITORING", "/monitoring/"])("recognizes the monitoring route at %s", async path => {
    await render(path);
    expect(camera()).not.toBeNull();
    expect(camera()!.closest("[hidden]")).toBeNull();
    await toggle(); await navigate("Configurações"); await navigate("Monitorar");
    expect(view.feed!.isMonitoring).toBe(true);
    expect(calls("start_monitoring_session")).toHaveLength(1);
    expect(calls("end_monitoring_session")).toHaveLength(0);
  });

  it("closes calibration when leaving monitoring and returns to the monitoring view", async () => {
    await render(); await navigate("Monitorar"); await toggle();
    await act(async () => view.feed!.onCalibrate!());
    expect(view.modal!.isOpen).toBe(true);
    expect(view.feed!.isMonitoring).toBe(false);
    await navigate("Configurações");
    expect(view.modal!.isOpen).toBe(false);
    expect(view.feed!.isMonitoring).toBe(true);
    await navigate("Monitorar");
    expect(view.modal!.isOpen).toBe(false);
    expect(view.feed!.isMonitoring).toBe(true);
  });

  it("does not cancel a pending session start when changing routes", async () => {
    let finishStart!: (value: { id: string }) => void;
    ipc.invoke.mockImplementation((command: string) => command === "start_monitoring_session"
      ? new Promise(resolve => { finishStart = resolve; }) : Promise.resolve());
    await render(); await navigate("Monitorar"); await toggle();
    await navigate("Configurações");
    await act(async () => finishStart({ id: "pending" }));
    expect(view.feed!.isMonitoring).toBe(true);
    expect(calls("end_monitoring_session")).toHaveLength(0);
    await navigate("Monitorar");
    expect(calls("start_monitoring_session")).toHaveLength(1);
  });

  it("closes the previous account's session on account change and releases monitoring on logout", async () => {
    await render(); await navigate("Monitorar"); await toggle();
    const previousCamera = camera();
    authenticate(2); await render();
    expect(camera()).not.toBe(previousCamera);
    expect(view.feed!.isMonitoring).toBe(false);
    expect(calls("end_monitoring_session")).toHaveLength(1);
    await toggle();
    expect(calls("start_monitoring_session")[1][1].payload).toMatchObject({ userId: 2 });
    view.session = { kind: "anonymous" }; await render();
    expect(camera()).toBeNull();
    expect(calls("end_monitoring_session")).toHaveLength(2);
    expect(container.textContent).toContain("Área de acesso");
  });
});
