import type { PostureStatus } from "../enums/postureStatus";

export type {
  LandmarkPoint,
  VisionDetectionResult,
  PoseDetectorConfig,
} from "../services/vision/poseDetector";
export {
  POSE_LANDMARK_INDEX,
  FACE_LANDMARK_INDEX,
} from "../services/vision/poseDetector";

export type UserPresenceState = "ACTIVE" | "ABSENT" | "PARTIALLY_OCCLUDED";

/**
 * Scalar measurements from one classified inference; never contains landmarks or video.
 * Null means the metric was unavailable in this inference.
 */
export interface ProcessedPostureFrame {
  /** Monotonic inference time (performance.now), in milliseconds. */
  timestampMs: number;
  /** Neck deviation from the active baseline, in degrees. */
  neckAngle: number | null;
  /** Calibrated shoulder balance (0–100), as shown on the monitoring card. */
  shoulderBalance: number | null;
  distanceCm: number | null;
  status: PostureStatus;
  /** Blink events since the previous frame, not a cumulative counter. */
  blinkCount?: number;
}

