export type TypingStatus = "good" | "warning" | "danger";

export interface TypingMetricSnapshotItem {
  id: string;
  sessionId: string;
  timestamp: string;
  windowDurationSeconds: number;
  keystrokesCount: number;
  cadenceCpm: number;
  peakCpm: number;
  activeTypingSeconds: number;
  microPausesCount: number;
  continuousTypingMinutes: number;
  dominantStatus: TypingStatus;
  createdAt?: string | null;
}

export type TypingMetricSnapshot = TypingMetricSnapshotItem;

export interface CreateTypingSnapshotPayload {
  sessionId: string;
  timestamp?: string | null;
  windowDurationSeconds?: number;
  keystrokesCount: number;
  cadenceCpm: number;
  peakCpm: number;
  activeTypingSeconds: number;
  microPausesCount: number;
  continuousTypingMinutes: number;
  dominantStatus: TypingStatus;
}

export interface TypingSnapshotHistoryFilter {
  sessionId?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  limit?: number | null;
}

export interface LiveTypingMetrics {
  sessionId: string | null;
  isMonitoringActive: boolean;
  isTyping: boolean;
  cpm: number;
  peakCpm: number;
  totalKeystrokes: number;
  continuousMinutes: number;
  dominantStatus: TypingStatus;
}

export const DEFAULT_LIVE_TYPING_METRICS: LiveTypingMetrics = {
  sessionId: null,
  isMonitoringActive: false,
  isTyping: false,
  cpm: 0,
  peakCpm: 0,
  totalKeystrokes: 0,
  continuousMinutes: 0,
  dominantStatus: "good",
};

