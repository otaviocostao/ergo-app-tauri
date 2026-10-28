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

const view = vi.hoisted(() => ({
  feed: null as WebcamFeedProps | null,
  modal: null as WorkspaceCalibrationModalProps | null,
  logs: [] as LogEvent[],
  userId: 1,
}));
vi.mock("../auth/AuthContext", () => ({ useOptionalAuth: () => ({ session: { kind: "authenticated", user: { id: view.userId } } }) }));
vi.mock("../components/monitoring/WebcamFeed", () => ({ default: (props: WebcamFeedProps) => { view.feed = props; return null; } }));
vi.mock("../components/monitoring/WorkspaceCalibrationModal", () => ({ default: (props: WorkspaceCalibrationModalProps) => { view.modal = props; return null; } }));
vi.mock("../components/monitoring/KeyboardMonitorCard", () => ({ default: () => null }));
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
    view.feed = null; view.modal = null; view.logs = []; view.userId = 1;
    vi.spyOn(postureService, "getActiveCalibration").mockResolvedValue(baseline);
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks();
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
    expect(alerts()).toHaveLength(1);
    await publish(40_300, 40_300, { neckAngle: 35 });
    expect(alerts()).toHaveLength(2);
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
        obsolete(classifyPosture({ timestampMs, captureId: 1, neckAngle: 35, shoulderAngle: 2,
          distanceCm: 60, blinkRate: null }, baseline));
      }
    });
    expect(alerts()).toEqual([]);
    view.userId = 2;
    vi.mocked(postureService.getActiveCalibration).mockResolvedValue({ ...baseline, id: "user-2", userId: 2 });
    await render();
    await act(async () => view.feed!.onToggleMonitoring!());
    await act(async () => {
      for (let timestampMs = 30_100; timestampMs <= 60_000; timestampMs += 100) {
        obsolete(classifyPosture({ timestampMs, captureId: 1, neckAngle: 35, shoulderAngle: 2,
          distanceCm: 60, blinkRate: null }, baseline));
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
});
