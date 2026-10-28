// @vitest-environment jsdom
import { act, StrictMode } from "react";
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

function ocularFace(ear = 0.3, rightEyeX = 300, leftEyeX = 500): LandmarkPoint[] {
  const points = Array.from({ length: 478 }, (): LandmarkPoint => ({ x: 0, y: 0, z: 0, visibility: 0 }));
  for (const [indices, offset] of [
    [FACE_EAR_INDEX.RIGHT_EYE, rightEyeX],
    [FACE_EAR_INDEX.LEFT_EYE, leftEyeX],
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
  points[468] = { x: rightEyeX / 1280, y: 200 / 720, z: 0, visibility: 1, presence: 1 };
  points[473] = { x: leftEyeX / 1280, y: 200 / 720, z: 0, visibility: 1, presence: 1 };
  return points;
}

describe("WorkspaceCalibrationModal Posture Baseline Calibration", () => {
  let root: Root;
  let mounted = false;
  let container: HTMLDivElement;
  let landmarks: LandmarkPoint[] | null;
  let faceTransformationMatrix: ReturnType<typeof faceMatrix> | null;
  let faceLandmarks: LandmarkPoint[] | null;
  let streams: ReturnType<typeof makeStream>[];
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
    expect(dialog?.textContent).toContain("Postura Calibrada");
    expect(dialog?.textContent).toContain("Ângulo do Pescoço");
    expect(dialog?.textContent).toContain("Balanceamento dos Ombros");
    expect(dialog?.textContent).toContain("Distância de Referência");
    expect(dialog?.textContent).toContain("Distância de Olhos");
    expect(dialog?.textContent).toContain("60 cm");
    expect(dialog?.textContent).toContain("200 px");

    // Click "Salvar"
    await clickButton("Salvar");
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
    expect(dialog?.textContent).toContain("Postura Calibrada");

    // Click Recalibrar
    await clickButton("Recalibrar");
    expect(dialog?.textContent).toContain("Gravando postura de referência");

    await advance(5100);
    expect(dialog?.textContent).toContain("Postura Calibrada");
  });

  it("automatically starts countdown and saves on completion when clicking Salvar Calibração directly", async () => {
    await renderModal();
    await reachCalibrationCamera();
    await advance(200);

    // Direct click on Salvar while idle
    await clickButton("Salvar");
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

  it("warns when user is too close to screen and prevents accidental auto-saving", async () => {
    // 360px on 1280 (ratio: 0.281, > 20% -> too close)
    faceLandmarks = ocularFace(0.3, 200, 560);

    await renderModal();
    await reachCalibrationCamera();
    await advance(200);

    await clickButton("Iniciar Calibração (5s)");
    await advance(5100);

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain("Você parece estar muito próximo da tela:");
    expect(dialog?.textContent).toContain("Afaste-se para a distância de mais ou menos 60cm");
    expect(dialog?.textContent).toContain("Recalibrar (5s)");
    expect(dialog?.textContent).toContain("Desejo manter assim mesmo");

    // "Salvar" button is disabled until override is acknowledged
    const saveButton = [...document.querySelectorAll("button")].find((b) =>
      b.textContent?.trim() === "Salvar"
    );
    expect(saveButton).toBeDefined();
    expect(saveButton?.disabled).toBe(true);

    // Clicking "Desejo manter assim mesmo" enables saving
    await clickButton("Desejo manter assim mesmo");
    expect(saveButton?.disabled).toBe(false);

    // Now clicking save succeeds
    await clickButton("Salvar");
    await advance(100);

    expect(postureService.saveCalibration).toHaveBeenCalledWith(
      expect.objectContaining({
        baselineEyeDistancePx: 360,
      })
    );
    expect(onCalibrateSubmit).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("warns when user is too far from screen and allows recalibrating", async () => {
    // 30px on 1280 (ratio: 0.023, < 4% -> too far)
    faceLandmarks = ocularFace(0.3, 400, 430);

    await renderModal();
    await reachCalibrationCamera();
    await advance(200);

    await clickButton("Iniciar Calibração (5s)");
    await advance(5100);

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain("Você parece estar muito distante da tela:");

    // User steps closer and recalibrates (mock normal distance: 200px)
    faceLandmarks = ocularFace(0.3, 300, 500);
    await clickButton("Recalibrar (5s)");
    await advance(5100);

    expect(dialog?.textContent).toContain("Postura Confirmada:");
    expect(dialog?.textContent).toContain("faixa ideal (60 cm de distância do monitor)");
  });

  it("requires measured eye landmarks before starting or auto-saving", async () => {
    faceLandmarks = Array.from({ length: 478 }, () => ({ x: 0, y: 0, z: 0, visibility: 0, presence: 0 }));
    await renderModal(); await reachCalibrationCamera(); await advance(200);
    const start = [...document.querySelectorAll("button")].find(b => b.textContent?.includes("Iniciar Calibração"));
    expect(start?.disabled).toBe(true);
    await clickButton("Salvar"); await advance(5100);
    expect(document.body.textContent).toContain("Aguardando leitura válida");
    expect(document.body.textContent).not.toContain("Postura Calibrada");
    expect(postureService.saveCalibration).not.toHaveBeenCalled();
  });

  it("does not substitute 60px when eye measurements disappear during the countdown", async () => {
    await renderModal(); await reachCalibrationCamera(); await advance(200);
    await clickButton("Salvar");
    faceLandmarks = Array.from({ length: 478 }, () => ({ x: 0, y: 0, z: 0, visibility: 0, presence: 0 }));
    await advance(5100);
    expect(document.body.textContent).toContain("Não houve leituras válidas suficientes");
    expect(document.body.textContent).not.toContain("Postura Calibrada");
    expect(postureService.saveCalibration).not.toHaveBeenCalled();
  });

  it("rejects a short initial fragment followed by user absence", async () => {
    await renderModal(); await reachCalibrationCamera(); await advance(200);
    await clickButton("Salvar"); await advance(100);
    landmarks = null; faceLandmarks = null; await advance(5000);
    expect(document.body.textContent).toContain("Não houve leituras válidas suficientes");
    expect(postureService.saveCalibration).not.toHaveBeenCalled();
  });

  it("rejects head movement even though the angles pass through the temporal filter", async () => {
    await renderModal(); await reachCalibrationCamera(); await advance(200);
    await clickButton("Salvar"); await advance(2500);
    faceTransformationMatrix = faceMatrix(10); await advance(2600);
    expect(document.body.textContent).toContain("Sua postura variou durante a coleta");
    expect(postureService.saveCalibration).not.toHaveBeenCalled();
  });

  it("rejects changing distance instead of saving the mean of two positions", async () => {
    await renderModal(); await reachCalibrationCamera(); await advance(200);
    await clickButton("Salvar"); await advance(2500);
    faceLandmarks = ocularFace(0.3, 300, 550); await advance(2600);
    expect(document.body.textContent).toContain("A distância entre os olhos variou durante a coleta");
    expect(postureService.saveCalibration).not.toHaveBeenCalled();
  });

  it("requires frontal head pose throughout enough of the capture", async () => {
    await renderModal(); await reachCalibrationCamera(); await advance(200);
    await clickButton("Salvar"); faceTransformationMatrix = faceMatrix(40);
    await advance(5100);
    expect(document.body.textContent).toContain("Não houve leituras válidas suficientes");
    expect(postureService.saveCalibration).not.toHaveBeenCalled();
  });

  it("tolerates brief eye tracking loss without inventing samples", async () => {
    await renderModal(); await reachCalibrationCamera(); await advance(200);
    await clickButton("Salvar"); await advance(2000);
    faceLandmarks = null; await advance(200);
    faceLandmarks = ocularFace(); await advance(2900);
    expect(postureService.saveCalibration).toHaveBeenCalledWith(expect.objectContaining({ baselineEyeDistancePx: 200 }));
  });

  it("does not mix two camera resolutions within a calibration", async () => {
    await renderModal(); await reachCalibrationCamera(); await advance(200);
    await clickButton("Salvar"); await advance(2500);
    vi.spyOn(HTMLVideoElement.prototype, "videoWidth", "get").mockReturnValue(640);
    vi.spyOn(HTMLVideoElement.prototype, "videoHeight", "get").mockReturnValue(360);
    await advance(2600);
    expect(document.body.textContent).toContain("A câmera, a resolução ou a medição dos olhos mudou");
    expect(postureService.saveCalibration).not.toHaveBeenCalled();
  });

  it("cannot bypass a distance warning by recalibrating and cancelling", async () => {
    faceLandmarks = ocularFace(0.3, 200, 560);
    await renderModal(); await reachCalibrationCamera(); await advance(200);
    await clickButton("Iniciar Calibração"); await advance(5100);
    const save = () => [...document.querySelectorAll("button")].find(b => b.textContent?.trim() === "Salvar")!;
    expect(save().disabled).toBe(true);
    await clickButton("Recalibrar"); await advance(100); await clickButton("Cancelar");
    await clickButton("Salvar");
    expect(document.body.textContent).toContain("Gravando postura de referência");
    expect(postureService.saveCalibration).not.toHaveBeenCalled();
    await advance(5100);
    expect(save().disabled).toBe(true);
    expect(postureService.saveCalibration).not.toHaveBeenCalled();
    await clickButton("Desejo manter assim mesmo"); await clickButton("Salvar");
    expect(postureService.saveCalibration).toHaveBeenCalledWith(expect.objectContaining({ baselineEyeDistancePx: 360 }));
  });

  it("discards the previous completed result when recalibration fails", async () => {
    await renderModal(); await reachCalibrationCamera(); await advance(200);
    await clickButton("Iniciar Calibração"); await advance(5100);
    await clickButton("Recalibrar"); faceLandmarks = null; await advance(5100);
    expect(document.body.textContent).not.toContain("Postura Calibrada");
    await clickButton("Salvar");
    expect(postureService.saveCalibration).not.toHaveBeenCalled();
  });

  it("does not carry manual distance confirmation into a new calibration", async () => {
    faceLandmarks = ocularFace(0.3, 200, 560);
    await renderModal(); await reachCalibrationCamera(); await advance(200);
    await clickButton("Iniciar Calibração"); await advance(5100);
    await clickButton("Desejo manter assim mesmo");
    await clickButton("Recalibrar"); await advance(5100);
    const save = [...document.querySelectorAll("button")].find(b => b.textContent?.trim() === "Salvar");
    expect(save?.disabled).toBe(true);
    expect(document.body.textContent).toContain("Desejo manter assim mesmo");
    expect(postureService.saveCalibration).not.toHaveBeenCalled();
  });

  it("stops automatic saving when its countdown is cancelled", async () => {
    await renderModal(); await reachCalibrationCamera(); await advance(200);
    await clickButton("Salvar"); await advance(2500); await clickButton("Cancelar");
    await advance(5100);
    expect(document.body.textContent).not.toContain("Postura Calibrada");
    expect(postureService.saveCalibration).not.toHaveBeenCalled();
    await clickButton("Salvar"); await advance(5100);
    expect(postureService.saveCalibration).toHaveBeenCalledOnce();
  });

  it("saves exactly once in StrictMode after the complete countdown", async () => {
    await act(async () => root.render(<StrictMode><WorkspaceCalibrationModal isOpen onClose={onClose} onCalibrateSubmit={onCalibrateSubmit} /></StrictMode>));
    mounted = true;
    await reachCalibrationCamera(); await advance(200);
    await clickButton("Salvar"); await advance(4900);
    expect(postureService.saveCalibration).not.toHaveBeenCalled();
    await advance(200);
    expect(postureService.saveCalibration).toHaveBeenCalledOnce();
    expect(onCalibrateSubmit).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("includes userId in the payload when provided", async () => {
    await act(async () => {
      root.render(
        <WorkspaceCalibrationModal
          isOpen={true}
          onClose={onClose}
          onCalibrateSubmit={onCalibrateSubmit}
          userId={42}
        />
      );
    });
    mounted = true;
    await reachCalibrationCamera();
    await advance(200);

    await clickButton("Iniciar Calibração (5s)");
    await advance(5100);

    await clickButton("Salvar");
    await advance(100);

    expect(postureService.saveCalibration).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 42,
        baselineNeckAngle: 0,
        baselineShoulderBalance: 100,
        baselineDistanceCm: 60,
        baselineEyeDistancePx: 200,
        isActive: true,
      })
    );
  });
});
