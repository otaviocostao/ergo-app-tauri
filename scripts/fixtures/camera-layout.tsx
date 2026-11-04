// Browser-only regression fixture. It never accesses a physical camera or Tauri IPC.
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import MainLayout from "../../src/components/MainLayout";
import { AuthProvider } from "../../src/auth/AuthContext";
import { ThemeProvider } from "../../src/theme/ThemeContext";
import { poseDetector } from "../../src/services/vision";
import { workspaceService } from "../../src/services/workspaceService";

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
poseDetector.initialize = async () => {};
poseDetector.isReady = () => true;
// Keep input constant: continuous resizing must not depend on changing detection.
poseDetector.detectFrame = (_, timestamp) => ({
  timestamp, hasPose: false, hasFace: false, poseLandmarks: null,
  worldLandmarks: null, faceLandmarks: null, faceTransformationMatrix: null,
});
workspaceService.getAll = async () => [];

const sources = [[1280, 720], [640, 480]].map(([width, height]) => {
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  return canvas;
});
const paint = () => sources.forEach(canvas => {
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#777"; ctx.fillRect(0, 0, canvas.width, canvas.height);
});
paint();
const paintTimer = setInterval(paint, 100);
const streams: MediaStream[] = [];
Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: {
  getUserMedia: async (constraints: MediaStreamConstraints) => {
    const id = typeof constraints.video === "object" ? constraints.video.deviceId : null;
    const second = typeof id === "object" && id !== null && "exact" in id && id.exact === "second";
    const stream = sources[second ? 1 : 0].captureStream(30);
    streams.push(stream); return stream;
  },
  enumerateDevices: async () => [
    { kind: "videoinput", deviceId: "first", label: "Synthetic camera 16:9" },
    { kind: "videoinput", deviceId: "second", label: "Synthetic camera 4:3" },
  ],
  addEventListener() {}, removeEventListener() {},
} });

const root = createRoot(document.getElementById("root")!);
const click = async (label: string) => {
  const button = [...document.querySelectorAll("button")].find(item => item.textContent?.trim() === label);
  if (!button || button.disabled) throw new Error("Unavailable button: " + label);
  button.click(); await delay(150);
};
const rectangle = (element: Element) => {
  const rect = element.getBoundingClientRect();
  return [rect.x, rect.y, rect.width, rect.height];
};
const pressure = document.createElement("div");

const fixture = {
  ready: false,
  async openCalibration() {
    await click("Calibrar Postura Base");
    for (let step = 0; step < 6; step++) await click("Próximo");
    await delay(1000);
  },
  async closeCalibration() {
    (document.querySelector('[aria-label="Fechar modal"]') as HTMLButtonElement).click();
    await delay(200);
    await click("Iniciar Monitoramento");
  },
  async switchCamera() {
    const scope = document.querySelector('[role="dialog"]') ?? document.querySelector("main")!;
    const select = scope.querySelector("select")!;
    select.value = select.value === "second" ? "first" : "second";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await delay(300);
  },
  async sample() {
    const frames = [];
    for (let index = 0; index < 24; index++) {
      await new Promise(requestAnimationFrame);
      const scope = document.querySelector('[role="dialog"]') ?? document.querySelector("main")!;
      const video = scope.querySelector("video")!;
      frames.push({
        scope: rectangle(scope), video: rectangle(video), source: [video.videoWidth, video.videoHeight],
        hasOverflow: scope.scrollHeight > scope.clientHeight,
      });
    }
    return { frames, transitions: frames.slice(1).filter((frame, index) => JSON.stringify(frame) !== JSON.stringify(frames[index])).length };
  },
  async setScrollPressure(enabled: boolean) {
    if (enabled) {
      pressure.style.height = "2500px";
      document.querySelector("main")!.append(pressure);
    } else pressure.remove();
    await delay(250);
  },
  stop() {
    pressure.remove(); root.unmount(); clearInterval(paintTimer);
    streams.forEach(stream => stream.getTracks().forEach(track => track.stop()));
  },
};
Object.assign(window, { cameraLayoutFixture: fixture });
root.render(<MemoryRouter initialEntries={["/monitoring"]}><AuthProvider><ThemeProvider><MainLayout /></ThemeProvider></AuthProvider></MemoryRouter>);
await delay(700);
await fixture.openCalibration();
await document.fonts.ready;
fixture.ready = true;
