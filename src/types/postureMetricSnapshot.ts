import { PostureStatus } from "../enums/postureStatus";

export { PostureStatus };
export type PostureDominantStatus = PostureStatus;
export const PostureDominantStatus = PostureStatus;

export interface PostureMetricSnapshot {
  id: string;
  sessionId: string;
  timestamp: string;
  avgNeckAngle: number;
  maxNeckAngle: number;
  avgShoulderBalance: number;
  minShoulderBalance: number;
  avgDistanceCm: number;
  blinkCount: number;
  dominantStatus: PostureStatus;
  score: number;
  samplesCount: number;
  createdAt?: string | null;
}

export type PostureSnapshotDTO = PostureMetricSnapshot;

export interface CreateSnapshotPayload {
  sessionId: string;
  timestamp?: string | null;
  avgNeckAngle: number;
  maxNeckAngle: number;
  avgShoulderBalance: number;
  minShoulderBalance: number;
  avgDistanceCm: number;
  blinkCount: number;
  dominantStatus: PostureStatus | "good" | "warning" | "danger";
  score: number;
  samplesCount: number;
}

export interface SnapshotHistoryFilter {
  sessionId?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  limit?: number | null;
}
