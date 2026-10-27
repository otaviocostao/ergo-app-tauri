// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WorkspaceCalibrationModal from "./WorkspaceCalibrationModal";
import { poseDetector, POSE_LANDMARK_INDEX as INDEX, type LandmarkPoint, type VisionDetectionResult } from "../../services/vision";
import { workspaceService } from "../../services/workspaceService";
import { postureService } from "../../services/postureService";
import { FACE_EAR_INDEX } from "../../services/vision";

function faceMatrix(pitch: number) {
  const radians = (pitch * Math.PI) / 180;
  const c = Math.cos(radians), s = Math.sin(radians);
  return { rows: 4, columns: 4, data: [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, -50, 1] };
}

function upright(): LandmarkPoint[] {
  const points: LandmarkPoint[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0, presence: 0 }));
  for (const [index, x, y] of [
    [INDEX.NOSE, 0.5, 0.2],
    [INDEX.LEFT_EAR, 0.45, 0.3],
    [INDEX.RIGHT_EAR, 0.55, 0.3],
    [INDEX.LEFT_SHOULDER, 0.3, 0.6],
    [INDEX.RIGHT_SHOULDER, 0.7, 0.6],
  ]) {
    points[index] = { x, y, z: 0, visibility: 1, presence: 1 };
  }
  return points;
}

function ocularFace(ear = 0.3): LandmarkPoint[] {
  const points = Array.from({ length: 478 }, (): LandmarkPoint => ({ x: 0, y: 0, z: 0, visibility: 0 }));
  for (const [indices, offset] of [
    [FACE_EAR_INDEX.RIGHT_EYE, 300],
    [FACE_EAR_INDEX.LEFT_EYE, 500],
  ] as const) {
    for (const [i, [x, y]] of [
      [0, 0],
      [3, -5 * ear],
      [7, -5 * ear],
      [10, 0],
      [7, 5 * ear],
      [3, 5 * ear],
    ].entries()) {
      points[indices[i]] = { x: (offset + x) / 1280, y: (200 + y) / 720, z: 0, visibility: 1, presence: 1 };
    }
  }
  points[468] = { x: 300 / 1280, y: 200 / 720, z: 0, visibility: 1, presence: 1 };
  points[473] = { x: 500 / 1280, y: 200 / 720, z: 0, visibility: 1, presence: 1 };
  return points;
}

describe("WorkspaceCalibrationModal Posture Baseline Calibration", () => {
  let root: Root;
  let mounted = false;
  let container: HTMLDivElement;
  let landmarks: LandmarkPoint[] | null;
  let faceTransformationMatrix: ReturnType<typeof faceMatrix> | null;
  let faceLandmarks: LandmarkPoint[] | null;
  let streams: Array<{ track: { stop: ReturnType<typeof vi.fn> }; stream: MediaStream }>;
  const onCalibrateSubmit = vi.fn();
  const onClose = vi.fn();

  function makeStream() {
    const track = {
      stop: vi.fn(),
      muted: false,
      onended: null as MediaStreamTrack["onended"],
      onmute: null as MediaStreamTrack["onmute"],
      onunmute: null as MediaStreamTrack["onunmute"],
    };
    const stream = { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
    return { track, stream };
  }

  async function clickButton(label: string) {
    const button = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim().includes(label));
    expect(button, `Button with label ${label}`).toBeDefined();
    await act(async () => button!.click());
  }

  async function advance(milliseconds: number) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(milliseconds);
    });
  }

  async function reachCalibrationCamera() {
    for (let step = 0; step < 6; step++) {
      await clickButton("Próximo");
    }
  }

  async function renderModal(open = true) {
    await act(async () => {
      root.render(
        <WorkspaceCalibrationModal
          isOpen={open}
          onClose={onClose}
          onCalibrateSubmit={onCalibrateSubmit}
        />
      );
    });
    mounted = true;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    landmarks = upright();
    faceTransformationMatrix = faceMatrix(0);
    faceLandmarks = ocularFace();
    streams = [];
    onCalibrateSubmit.mockReset();
    onClose.mockReset();

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => {
          const item = makeStream();
          streams.push(item);
          return item.stream;
        }),
        enumerateDevices: vi.fn(async () => [{ kind: "videoinput", deviceId: "camera-1", label: "Webcam" }]),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });

    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
      setTimeout(() => cb(performance.now()), 16)
    );
    vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));

    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, "readyState", "get").mockImplementation(function (this: HTMLMediaElement) {
      return this.srcObject ? 4 : 0;
    });
    vi.spyOn(HTMLVideoElement.prototype, "videoWidth", "get").mockReturnValue(1280);
    vi.spyOn(HTMLVideoElement.prototype, "videoHeight", "get").mockReturnValue(720);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => new DOMRect(0, 0, 800, 450));

    const dummyContext = {
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      setLineDash: vi.fn(),
      strokeRect: vi.fn(),
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(dummyContext as unknown as CanvasRenderingContext2D);

    vi.spyOn(poseDetector, "isReady").mockReturnValue(true);
    vi.spyOn(poseDetector, "initialize").mockResolvedValue();
    vi.spyOn(poseDetector, "detectFrame").mockImplementation((): VisionDetectionResult => ({
      hasPose: landmarks !== null,
      poseLandmarks: landmarks,
      hasFace: faceLandmarks !== null,
      faceLandmarks,
      faceTransformationMatrix,
      worldLandmarks: null,
      timestamp: performance.now(),
    }));

    vi.spyOn(workspaceService, "getAll").mockResolvedValue([]);
    vi.spyOn(workspaceService, "create").mockResolvedValue({
      id: "ws-123",
      deviceType: "notebook",
      isWebcamFront: true,
      hasExternalKeyboard: true,
      hasExternalMouse: true,
      adjustableDesk: false,
      adjustableChair: true,
      adjustableMonitor: true,
    });
    vi.spyOn(postureService, "saveCalibration").mockResolvedValue({
      id: "calib-456",
      userId: null,
      baselineNeckAngle: 0,
      baselineShoulderBalance: 100,
      baselineDistanceCm: 60,
      baselineEyeDistancePx: 200,
      isActive: true,
    });

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    mounted = false;
  });

  afterEach(async () => {
    if (mounted) {
      await act(async () => root.unmount());
      mounted = false;
    }
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("guides the user through a 5-second countdown and collects stable averages", async () => {
    await renderModal();
    await reachCalibrationCamera();
    await advance(200);

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain("Calibração da Postura");
    expect(dialog?.textContent).toContain("Iniciar Calibração (5s)");

    // Start 5-second calibration
    await clickButton("Iniciar Calibração (5s)");
    expect(dialog?.textContent).toContain("Gravando postura de referência");
    expect(dialog?.textContent).toContain("5");

    // Advance 5 seconds (1000ms each)
    await advance(1000);
    expect(dialog?.textContent).toContain("4");
    await advance(1000);
    expect(dialog?.textContent).toContain("3");
    await advance(1000);
    expect(dialog?.textContent).toContain("2");
    await advance(1000);
    expect(dialog?.textContent).toContain("1");
    await advance(1000);

    // Calibration completed
    expect(dialog?.textContent).toContain("Postura Neutra (Baseline) Calibrada");
    expect(dialog?.textContent).toContain("Pescoço (θ_neck)");
    expect(dialog?.textContent).toContain("Ombros (Balance)");
    expect(dialog?.textContent).toContain("Distância (Base)");
    expect(dialog?.textContent).toContain("IPD (Pupilas)");
    expect(dialog?.textContent).toContain("60 cm");
    expect(dialog?.textContent).toContain("200 px");

    // Click "Salvar Calibração"
    await clickButton("Salvar Calibração");
    await advance(100);

    expect(postureService.saveCalibration).toHaveBeenCalledWith(
      expect.objectContaining({
        baselineNeckAngle: 0,
        baselineShoulderBalance: 100,
        baselineDistanceCm: 60,
        baselineEyeDistancePx: 200,
        isActive: true,
      })
    );
    expect(onCalibrateSubmit).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("allows cancelling an in-progress countdown", async () => {
    await renderModal();
    await reachCalibrationCamera();
    await advance(200);

    await clickButton("Iniciar Calibração (5s)");
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain("Gravando postura de referência");

    await clickButton("Cancelar");
    expect(dialog?.textContent).toContain("Iniciar Calibração (5s)");
    expect(dialog?.textContent).not.toContain("Gravando postura de referência");
  });

  it("allows recalibrating after a completed calibration", async () => {
    await renderModal();
    await reachCalibrationCamera();
    await advance(200);

    await clickButton("Iniciar Calibração (5s)");
    await advance(5100);

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain("Postura Neutra (Baseline) Calibrada");

    // Click Recalibrar
    await clickButton("Recalibrar");
    expect(dialog?.textContent).toContain("Gravando postura de referência");

    await advance(5100);
    expect(dialog?.textContent).toContain("Postura Neutra (Baseline) Calibrada");
  });

  it("automatically starts countdown and saves on completion when clicking Salvar Calibração directly", async () => {
    await renderModal();
    await reachCalibrationCamera();
    await advance(200);

    // Direct click on Salvar Calibração while idle
    await clickButton("Salvar Calibração");
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain("Gravando postura de referência");

    await advance(5100);

    expect(postureService.saveCalibration).toHaveBeenCalledWith(
      expect.objectContaining({
        baselineNeckAngle: 0,
        baselineShoulderBalance: 100,
        baselineDistanceCm: 60,
        baselineEyeDistancePx: 200,
        isActive: true,
      })
    );
    expect(onCalibrateSubmit).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
