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

