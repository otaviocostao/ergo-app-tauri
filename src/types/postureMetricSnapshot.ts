import { PostureStatus } from "../enums/postureStatus";

export { PostureStatus };
export type PostureDominantStatus = PostureStatus | "absent" | "unavailable";
export const PostureDominantStatus = { ...PostureStatus, ABSENT: "absent", UNAVAILABLE: "unavailable" } as const;

export interface PostureMetricSnapshot {
  id: string;
  sessionId: string;
  timestamp: string;
  avgNeckAngle: number | null;
  maxNeckAngle: number | null;
  avgShoulderBalance: number | null;
  minShoulderBalance: number | null;
  avgDistanceCm: number | null;
  blinkCount: number;
  dominantStatus: PostureDominantStatus;
  score: number;
  samplesCount: number;
  createdAt?: string | null;
}

export type PostureSnapshotDTO = PostureMetricSnapshot;

export interface CreateSnapshotPayload {
  sessionId: string;
  timestamp?: string | null;
  avgNeckAngle: number | null;
  maxNeckAngle: number | null;
  avgShoulderBalance: number | null;
  minShoulderBalance: number | null;
  avgDistanceCm: number | null;
  blinkCount: number;
  dominantStatus: PostureDominantStatus | "good" | "warning" | "danger";
  score: number;
  samplesCount: number;
}

export interface SnapshotHistoryFilter {
  sessionId?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  limit?: number | null;
}
