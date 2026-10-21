// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WebcamFeed from "./WebcamFeed";
import { poseDetector, POSE_LANDMARK_INDEX as INDEX, type LandmarkPoint, type VisionDetectionResult } from "../../services/vision";
import * as biomechanics from "../../services/vision/biomechanics";
import WorkspaceCalibrationModal from "./WorkspaceCalibrationModal";
import Monitoring from "../../pages/Monitoring";
import { workspaceService } from "../../services/workspaceService";

function faceMatrix(pitch: number) {
  const radians = pitch * Math.PI / 180;
  const c = Math.cos(radians), s = Math.sin(radians);
  return { rows: 4, columns: 4, data: [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, -50, 1] };
}

function upright(): LandmarkPoint[] {
  const points = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0 }));
  for (const [index, x, y] of [
    [INDEX.NOSE, 0.5, 0.2], [INDEX.LEFT_EAR, 0.45, 0.3], [INDEX.RIGHT_EAR, 0.55, 0.3],
    [INDEX.LEFT_SHOULDER, 0.3, 0.6], [INDEX.RIGHT_SHOULDER, 0.7, 0.6],
  ]) points[index] = { x, y, z: 0, visibility: 1 };
  return points;
}

describe("WebcamFeed and deterministic biomechanics", () => {
  let root: Root;
  let mounted: boolean;
  let container: HTMLDivElement;
  let landmarks: LandmarkPoint[] | null;
  let faceTransformationMatrix: ReturnType<typeof faceMatrix> | null;
  let previewWidth: number;
  let previewHeight: number;
  let drawnFrames: { segments: number; points: number }[];
  let pointPositions: { x: number; y: number }[][];
  let streams: ReturnType<typeof makeStream>[];
  const update = vi.fn();
  const presence = vi.fn();
  const hardware = vi.fn();
  const getUserMedia = vi.fn<() => Promise<MediaStream>>();

  function makeStream() {
    const track = { stop: vi.fn(), onended: null, onmute: null };
    const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
    return { stream: stream as unknown as MediaStream, track };
  }

  async function render(monitoring = true) {
    await act(async () => {
      root.render(<WebcamFeed isMonitoring={monitoring} onToggleMonitoring={vi.fn()} onCalibrate={vi.fn()}
        onPostureUpdate={update} onPresenceChange={presence} onHardwareBusyChange={hardware} />);
    });
    mounted = true;
  }

  async function advance(milliseconds: number) {
    await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds); });
  }

  async function clickButton(label: string) {
    const button = [...document.querySelectorAll("button")].find(button => button.textContent?.trim() === label);
    expect(button, `Button ${label}`).toBeDefined();
    await act(async () => button!.click());
  }

  async function reachCalibrationCamera() {
    for (let step = 0; step < 6; step++) await clickButton("Próximo");
  }

  async function renderCalibration(open = true) {
    await act(async () => root.render(<WorkspaceCalibrationModal isOpen={open} onClose={vi.fn()} onCalibrateSubmit={vi.fn()} />));
    mounted = true;
  }

  async function unmount() {
    if (mounted) {
      await act(async () => root.unmount());
      mounted = false;
    }
  }

  beforeEach(() => {
    vi.useFakeTimers();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    landmarks = upright();
    faceTransformationMatrix = faceMatrix(0);
    previewWidth = 800;
    previewHeight = 450;
    drawnFrames = [];
    pointPositions = [];
    streams = [];
    update.mockReset(); presence.mockReset(); hardware.mockReset(); getUserMedia.mockReset();
    getUserMedia.mockImplementation(async () => {
      const item = makeStream(); streams.push(item); return item.stream;
    });
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: {
      getUserMedia,
      enumerateDevices: vi.fn(async () => [{ kind: "videoinput", deviceId: "camera-1", label: "Test camera" }]),
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
    } });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 16));
    vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, "readyState", "get").mockImplementation(function (this: HTMLMediaElement) {
      return this.srcObject ? 4 : 0;
    });
    vi.spyOn(HTMLVideoElement.prototype, "videoWidth", "get").mockReturnValue(1280);
    vi.spyOn(HTMLVideoElement.prototype, "videoHeight", "get").mockReturnValue(720);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => new DOMRect(0, 0, previewWidth, previewHeight));
    const context = Object.fromEntries(["clearRect", "beginPath", "moveTo", "lineTo", "stroke", "arc", "fill", "setLineDash", "strokeRect"].map(name => [name, vi.fn()]));
    context.clearRect.mockImplementation(() => { drawnFrames.push({ segments: 0, points: 0 }); pointPositions.push([]); });
    context.lineTo.mockImplementation(() => { drawnFrames[drawnFrames.length - 1].segments += 1; });
    context.arc.mockImplementation((x: number, y: number) => {
      drawnFrames[drawnFrames.length - 1].points += 1;
      pointPositions[pointPositions.length - 1].push({ x, y });
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
    vi.spyOn(poseDetector, "isReady").mockReturnValue(true);
    vi.spyOn(poseDetector, "initialize").mockResolvedValue();
    vi.spyOn(poseDetector, "detectFrame").mockImplementation((): VisionDetectionResult => ({
      hasPose: landmarks !== null, poseLandmarks: landmarks, hasFace: faceTransformationMatrix !== null,
      faceLandmarks: null, faceTransformationMatrix, worldLandmarks: null, timestamp: performance.now(),
    }));
    vi.spyOn(biomechanics, "calculateNeckAngle");
    vi.spyOn(biomechanics, "calculateShoulderBalance");
    vi.spyOn(workspaceService, "getAll").mockResolvedValue([]);
    container = document.createElement("div"); document.body.append(container);
    root = createRoot(container); mounted = false;
  });

  afterEach(async () => {
    await unmount(); container.remove();
    vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
  });

  it("passes video landmarks through both pure algorithms without demo values on the first frame", async () => {
    await render(); await advance(200);
    expect(biomechanics.calculateNeckAngle).toHaveBeenCalled();
    expect(biomechanics.calculateShoulderBalance).toHaveBeenCalled();
    expect(update.mock.calls[0][0]).toMatchObject({ neckAngle: 0, shoulderBalance: 100, presence: "ACTIVE" });
  });

  it("uses video dimensions for a known rotation regardless of preview layout", async () => {
    const dx = Math.tan(Math.PI / 6) * 0.35 * 720 / 1280;
    for (const index of [INDEX.NOSE, INDEX.LEFT_EAR, INDEX.RIGHT_EAR]) landmarks![index].x += dx;
    const dy = Math.tan(5 * Math.PI / 180) * 0.4 * 1280 / 720;
    landmarks![INDEX.LEFT_SHOULDER].y -= dy / 2;
    landmarks![INDEX.RIGHT_SHOULDER].y += dy / 2;
    await render(); await advance(200);
    expect(update.mock.lastCall?.[0]).toMatchObject({ neckAngle: 30, shoulderBalance: 50 });
    previewWidth = 200; previewHeight = 700;
    await advance(500);
    expect(update.mock.lastCall?.[0]).toMatchObject({ neckAngle: 30, shoulderBalance: 50 });
  });

  it.each([[800, 600, 400, 150, 613.3333333333, 360], [800, 300, 400, 37.5, 560, 195]])(
    "aligns overlay points with the mirrored cropped video in a %sx%s preview", async (width, height, headX, headY, shoulderX, shoulderY) => {
      previewWidth = width; previewHeight = height;
      await render(); await advance(200);
      const points = pointPositions[pointPositions.length - 1];
      expect(points[0].x).toBeCloseTo(headX, 6); expect(points[0].y).toBeCloseTo(headY, 6);
      expect(points[2].x).toBeCloseTo(shoulderX, 6); expect(points[2].y).toBeCloseTo(shoulderY, 6);
    });

  it("tracks actual body movement in the calibration step and releases its camera when closed", async () => {
    await renderCalibration();
    expect(getUserMedia).not.toHaveBeenCalled();
    await reachCalibrationCamera(); await advance(200);
    expect(poseDetector.detectFrame).toHaveBeenCalled();
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.textContent).not.toContain("Calibrar Postura Base");
    expect(dialog?.textContent).not.toContain("Pausar Monitoramento");
    const firstHead = pointPositions[pointPositions.length - 1][0];
    for (const point of landmarks!) point.x += 0.1;
    await advance(200);
    expect(pointPositions[pointPositions.length - 1][0].x).toBeCloseTo(firstHead.x - 80, 6);
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Pescoço: 0° | Ombros: 100%");
    await renderCalibration(false);
    expect(streams.every(item => item.track.stop.mock.calls.length === 1)).toBe(true);
  });

  it("shows no demo joints or captured angles in calibration without a valid detection", async () => {
    landmarks = null;
    await renderCalibration(); await reachCalibrationCamera(); await advance(200);
    expect(drawnFrames[drawnFrames.length - 1]?.points).toBe(0);
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Aguardando detecção confiável");
    landmarks = upright(); await advance(200);
    expect(drawnFrames[drawnFrames.length - 1]?.points).toBe(4);
    faceTransformationMatrix = null; await advance(350);
    expect(drawnFrames[drawnFrames.length - 1]?.points).toBe(0);
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Aguardando detecção confiável");
  });

  it("reopens calibration at the setup form without briefly restarting its previous camera step", async () => {
    await renderCalibration(); await reachCalibrationCamera(); await advance(200);
    await renderCalibration(false);
    const requests = getUserMedia.mock.calls.length;
    await renderCalibration(); await advance(200);
    expect(getUserMedia).toHaveBeenCalledTimes(requests);
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Qual seu dispositivo?");
    expect(streams.every(item => item.track.stop.mock.calls.length === 1)).toBe(true);
  });

  it("keeps calibration unavailable on camera denial until simulation is explicitly selected", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    getUserMedia.mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    await renderCalibration(); await reachCalibrationCamera(); await advance(200);
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain("Permissão de câmera negada");
    expect(dialog?.textContent).toContain("Aguardando detecção confiável");
    expect(dialog?.textContent).not.toContain("Detecção e Extração em Modo Simulado");
    await clickButton("Ativar Modo Simulado"); await advance(200);
    expect(dialog?.textContent).toContain("Detecção e Extração em Modo Simulado");
    expect(dialog?.textContent).toContain("Pescoço:");
  });

  it.each([true, false])("hands the camera to calibration and restores the previous monitoring state (%s)", async running => {
    await act(async () => root.render(<Monitoring />)); mounted = true;
    await advance(200);
    if (!running) await clickButton("Pausar Monitoramento");
    await clickButton("Calibrar Postura Base");
    expect(streams.filter(item => item.track.stop.mock.calls.length === 0)).toHaveLength(0);
    await reachCalibrationCamera(); await advance(200);
    expect(streams.filter(item => item.track.stop.mock.calls.length === 0)).toHaveLength(1);
    const calibrationTracks = streams.filter(item => item.track.stop.mock.calls.length === 0);
    await act(async () => (document.querySelector('[aria-label="Fechar modal"]') as HTMLButtonElement).click());
    await advance(200);
    expect(calibrationTracks.every(item => item.track.stop.mock.calls.length === 1)).toBe(true);
    expect(streams.filter(item => item.track.stop.mock.calls.length === 0)).toHaveLength(running ? 1 : 0);
  });

  it.each([-80, -45, 45, 80])("detects vertical head rotation of %s degrees even with a centered 2D neck vector", async (pitch) => {
    faceTransformationMatrix = faceMatrix(pitch);
    expect(biomechanics.calculateNeckAngle({ x: 0.5, y: 0.2 }, { x: 0.5, y: 0.3 }, { x: 0.5, y: 0.6 })).toBe(0);
    await render(); await advance(200);
    expect(update.mock.lastCall?.[0]).toMatchObject({ neckAngle: Math.abs(pitch), status: "danger", presence: "ACTIVE" });
  });

  it("does not cancel opposite vertical deviations during smoothing and recovers when facing forward", async () => {
    faceTransformationMatrix = faceMatrix(50);
    await render(); await advance(200);
    faceTransformationMatrix = faceMatrix(-50); await advance(500);
    expect(update.mock.lastCall?.[0]).toMatchObject({ neckAngle: 50, status: "danger" });
    faceTransformationMatrix = faceMatrix(0); await advance(3000);
    expect(update.mock.lastCall?.[0]).toMatchObject({ neckAngle: 0, status: "good" });
  });

  it.each(["missing face", "invalid matrix"])("pauses instead of reporting good posture with %s, then reacquires a tilted head", async (scenario) => {
    await render(); await advance(200); update.mockClear();
    faceTransformationMatrix = scenario === "missing face" ? null : { rows: 4, columns: 4, data: Array(16).fill(0) };
    await advance(5500);
    expect(update).not.toHaveBeenCalled();
    expect(presence.mock.lastCall?.[0]).toBe("PARTIALLY_OCCLUDED");
    faceTransformationMatrix = faceMatrix(60); await advance(100);
    expect(update.mock.lastCall?.[0]).toMatchObject({ neckAngle: 60, status: "danger", presence: "ACTIVE" });
  });

  it("limits inference to approximately eleven frames per second", async () => {
    await render(); await advance(1000);
    expect(poseDetector.detectFrame).toHaveBeenCalledTimes(11);
  });

  it("keeps overlay lines visible between inference frames without rerunning the detector", async () => {
    await render(); await advance(100);
    expect(drawnFrames[drawnFrames.length - 1]?.points).toBe(4);
    const firstFrame = drawnFrames.length;
    const detections = vi.mocked(poseDetector.detectFrame).mock.calls.length;
    const metrics = update.mock.calls.length;
    await advance(64);
    expect(poseDetector.detectFrame).toHaveBeenCalledTimes(detections);
    expect(update).toHaveBeenCalledTimes(metrics);
    const intermediateFrames = drawnFrames.slice(firstFrame);
    expect(intermediateFrames.length).toBeGreaterThan(1);
    for (const frame of intermediateFrames) expect(frame).toEqual({ segments: 4, points: 4 });
  });

  it("tolerates a brief missed detection and clears stale overlay points before tracking resumes", async () => {
    await render(); await advance(200); landmarks = null;
    await advance(100);
    expect(drawnFrames[drawnFrames.length - 1]?.points).toBe(4);
    await advance(250);
    expect(drawnFrames[drawnFrames.length - 1]?.points).toBe(0);
    landmarks = upright(); await advance(150);
    expect(drawnFrames[drawnFrames.length - 1]?.points).toBe(4);
  });

  it("does not continually reset the drawing buffer for fractional layout dimensions", async () => {
    previewWidth = 800.4; previewHeight = 450.7;
    const setWidth = vi.spyOn(HTMLCanvasElement.prototype, "width", "set");
    const setHeight = vi.spyOn(HTMLCanvasElement.prototype, "height", "set");
    await render(); await advance(500);
    expect(setWidth).toHaveBeenCalledOnce();
    expect(setHeight).toHaveBeenCalledOnce();
    const canvas = container.querySelector("canvas")!;
    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(451);
  });

  it("converges to exactly neutral displayed values instead of accumulating integer rounding error", async () => {
    for (const index of [INDEX.NOSE, INDEX.LEFT_EAR, INDEX.RIGHT_EAR]) landmarks![index].x += 0.1;
    landmarks![INDEX.RIGHT_SHOULDER].y += 0.02;
    await render(); await advance(200);
    expect(update.mock.lastCall?.[0].neckAngle).toBeGreaterThan(0);
    landmarks = upright(); await advance(3000);
    expect(update.mock.lastCall?.[0]).toMatchObject({ neckAngle: 0, shoulderBalance: 100 });
  });

  it("pauses angle output when neither ear is visible without classifying a visible user as absent", async () => {
    await render(); await advance(200); update.mockClear();
    landmarks![INDEX.LEFT_EAR].visibility = 0; landmarks![INDEX.RIGHT_EAR].visibility = 0;
    await advance(5500);
    expect(update).not.toHaveBeenCalled();
    expect(presence.mock.lastCall?.[0]).toBe("PARTIALLY_OCCLUDED");
  });

  it("marks absence after five seconds and resumes on a valid pose", async () => {
    await render(); await advance(200); landmarks = null;
    await advance(5200);
    expect(presence.mock.lastCall?.[0]).toBe("ABSENT");
    expect(update.mock.lastCall?.[0]).toMatchObject({ presence: "ABSENT", statusLabel: "Usuário Ausente (Pausado)" });
    landmarks = upright(); await advance(200);
    expect(presence.mock.lastCall?.[0]).toBe("ACTIVE");
    expect(update.mock.lastCall?.[0]).toMatchObject({ neckAngle: 0, shoulderBalance: 100, presence: "ACTIVE" });
  });

  it("releases all camera tracks and stops inference while paused, then resumes", async () => {
    await render(); await advance(200); await render(false);
    expect(streams.length).toBeGreaterThan(0);
    for (const item of streams) expect(item.track.stop).toHaveBeenCalledOnce();
    const count = vi.mocked(poseDetector.detectFrame).mock.calls.length;
    await advance(500);
    expect(poseDetector.detectFrame).toHaveBeenCalledTimes(count);
    await render(true); await advance(200);
    expect(vi.mocked(poseDetector.detectFrame).mock.calls.length).toBeGreaterThan(count);
    expect(update.mock.lastCall?.[0]).toMatchObject({ neckAngle: 0, shoulderBalance: 100 });
  });

  it("stops requests that resolve after unmount rather than leaking the camera", async () => {
    const resolvers: ((stream: MediaStream) => void)[] = [];
    getUserMedia.mockImplementation(() => new Promise(resolve => resolvers.push(resolve)));
    await render(); expect(resolvers.length).toBeGreaterThan(0); await unmount();
    await act(async () => {
      for (const resolve of resolvers) { const item = makeStream(); streams.push(item); resolve(item.stream); }
    });
    for (const item of streams) expect(item.track.stop).toHaveBeenCalledOnce();
    expect(update).not.toHaveBeenCalled();
  });

  it("recovers from busy hardware after an explicit retry", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    getUserMedia.mockRejectedValue(new DOMException("device in use", "NotReadableError"));
    await render(); await advance(200);
    expect(container.textContent).toContain("Câmera em Uso por Outro Aplicativo");
    expect(hardware).toHaveBeenCalledWith(true);
    expect(update).not.toHaveBeenCalled();
    getUserMedia.mockImplementation(async () => { const item = makeStream(); streams.push(item); return item.stream; });
    await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent?.includes("Retomar Monitoramento"))!.click());
    await advance(200);
    expect(hardware.mock.lastCall?.[0]).toBe(false);
    expect(update.mock.lastCall?.[0]).toMatchObject({ neckAngle: 0, shoulderBalance: 100, presence: "ACTIVE" });
  });

  it("handles permission denial and runs the explicit simulation through the same algorithms", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    getUserMedia.mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    await render(); await advance(200);
    expect(container.textContent).toContain("Permissão de câmera negada");
    expect(update).not.toHaveBeenCalled();
    await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent?.includes("Ativar Modo Simulado"))!.click());
    await advance(200);
    expect(biomechanics.calculateNeckAngle).toHaveBeenCalled();
    expect(update.mock.lastCall?.[0]).toMatchObject({ presence: "ACTIVE" });
    expect(update.mock.lastCall?.[0].neckAngle).toBeGreaterThanOrEqual(0);
    expect(update.mock.lastCall?.[0].shoulderBalance).toBeLessThanOrEqual(100);
    expect(container.textContent).toContain("Modo Simulado");
  });

  it("does not publish posture measurements before the detector is ready", async () => {
    vi.mocked(poseDetector.isReady).mockReturnValue(false);
    await render(); await advance(1000);
    expect(update).not.toHaveBeenCalled();
    vi.mocked(poseDetector.isReady).mockReturnValue(true); await advance(200);
    expect(update.mock.lastCall?.[0]).toMatchObject({ neckAngle: 0, shoulderBalance: 100 });
  });
});
