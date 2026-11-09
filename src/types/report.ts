import type { MonitoringSessionItem } from "./monitoringSession";
import type { PostureMetricSnapshot } from "./postureMetricSnapshot";
import type { TypingMetricSnapshot } from "./typingMetricSnapshot";
import type { PostureAlert } from "./postureAlert";

export interface ReportFilter {
  startTime: string;
  endTime: string;
}

export interface ReportData {
  sessions: MonitoringSessionItem[];
  postureSnapshots: PostureMetricSnapshot[];
  typingSnapshots: TypingMetricSnapshot[];
  alerts: PostureAlert[];
}
