import type { MonitoringSessionItem } from "./monitoringSession";
import type { PostureMetricSnapshot } from "./postureMetricSnapshot";
import type { PostureAlert } from "./postureAlert";
import type { TypingMetricSnapshot } from "./typingMetricSnapshot";

export interface DashboardFilter {
  startTime: string;
  endTime: string;
}

export interface DashboardData {
  sessions: MonitoringSessionItem[];
  snapshots: PostureMetricSnapshot[];
  alerts: PostureAlert[];
  typingSnapshots?: TypingMetricSnapshot[];
  dailyGoalMinutes?: number;
}
