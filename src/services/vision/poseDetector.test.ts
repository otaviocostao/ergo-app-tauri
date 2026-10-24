import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calculateHeadPitch } from "./biomechanics";
import { FACE_EAR_INDEX, FACE_LANDMARK_INDEX, PoseDetectorService } from "./poseDetector";

const sdk = vi.hoisted(() => ({
  createFace: vi.fn(), createPose: vi.fn(), faceDetect: vi.fn(), poseDetect: vi.fn(),
  closeFace: vi.fn(), closePose: vi.fn(),
}));
vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: { forVisionTasks: vi.fn(async () => ({})) },
  FaceLandmarker: { createFromOptions: sdk.createFace },
  PoseLandmarker: { createFromOptions: sdk.createPose },
}));

const matrix = { rows: 4, columns: 4, data: [1, 0, 0, 0, 0, 0.5, Math.sqrt(3) / 2, 0, 0, -Math.sqrt(3) / 2, 0.5, 0, 3, 2, -50, 1] };
const video = { readyState: 4, videoWidth: 1280, videoHeight: 720 } as HTMLVideoElement;
const faceResult = () => ({ faceLandmarks: [[{ x: 0.5, y: 0.3, z: 0 }]], facialTransformationMatrixes: [matrix] });

describe("canonical face eye indices", () => {
  it("maps anatomical eyes to P1..P6 without changing legacy arrays", () => {
    expect(FACE_EAR_INDEX.RIGHT_EYE).toEqual([33, 160, 158, 133, 153, 144]);
    expect(FACE_EAR_INDEX.LEFT_EYE).toEqual([362, 385, 387, 263, 373, 380]);
    expect(FACE_LANDMARK_INDEX.LEFT_EYE.ALL).toEqual([33, 133, 160, 158, 144, 153]);
    expect(FACE_LANDMARK_INDEX.RIGHT_IRIS_CENTER).toBe(468);
    expect(FACE_LANDMARK_INDEX.LEFT_IRIS_CENTER).toBe(473);
  });
});

describe("face orientation in the detector pipeline", () => {
  let detector: PoseDetectorService;
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    sdk.faceDetect.mockImplementation(faceResult);
    sdk.poseDetect.mockReturnValue({ landmarks: [[{ x: 0.5, y: 0.6, z: 0 }]], worldLandmarks: [] });
    sdk.createFace.mockResolvedValue({ detectForVideo: sdk.faceDetect, detect: sdk.faceDetect, close: sdk.closeFace });
    sdk.createPose.mockResolvedValue({ detectForVideo: sdk.poseDetect, detect: sdk.poseDetect, close: sdk.closePose });
    detector = new PoseDetectorService();
  });
  afterEach(() => { detector.close(); vi.restoreAllMocks(); });

  it.each(["VIDEO", "IMAGE"] as const)("enables facial transforms and forwards their packed data in %s mode", async runningMode => {
    await detector.initialize({ runningMode });
    expect(sdk.createFace.mock.lastCall?.[1]).toMatchObject({ outputFacialTransformationMatrixes: true });
    const result = detector.detectFrame(video, 100);
    expect(result.hasFace).toBe(true);
    expect(result.faceTransformationMatrix).toEqual(matrix);
    expect(calculateHeadPitch(result.faceTransformationMatrix)).toBeCloseTo(60, 8);
  });

  it("does not retain an old orientation when the next frame loses the face or its matrix", async () => {
    await detector.initialize();
    expect(detector.detectFrame(video, 100).faceTransformationMatrix).toEqual(matrix);
    sdk.faceDetect.mockReturnValue({ faceLandmarks: [], facialTransformationMatrixes: [matrix] });
    expect(detector.detectFrame(video, 200)).toMatchObject({ hasPose: true, hasFace: false, faceTransformationMatrix: null });
    sdk.faceDetect.mockReturnValue({ ...faceResult(), facialTransformationMatrixes: [] });
    expect(detector.detectFrame(video, 300)).toMatchObject({ hasFace: true, faceTransformationMatrix: null });
  });

  it("keeps orientation unavailable after face inference fails even if body detection succeeds", async () => {
    await detector.initialize();
    sdk.faceDetect.mockImplementation(() => { throw new Error("Face inference failed"); });
    expect(detector.detectFrame(video, 100)).toMatchObject({ hasPose: true, hasFace: false, faceTransformationMatrix: null });
  });

  it("keeps orientation unavailable before initialization or when video is not ready", async () => {
    expect(detector.detectFrame(video).faceTransformationMatrix).toBeNull();
    await detector.initialize();
    expect(detector.detectFrame({ ...video, readyState: 0 } as HTMLVideoElement).faceTransformationMatrix).toBeNull();
    expect(sdk.faceDetect).not.toHaveBeenCalled();
  });
});
