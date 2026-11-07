import type { MonitoringSessionItem } from "./monitoringSession";
import type { PostureAlert } from "./postureAlert";
import type { PostureStatus } from "../enums/postureStatus";

export interface HistoryMinute {
  startedAt: string;
  endedAt: string;
  status: PostureStatus | null;
  samplesCount: number;
  summariesCount: number;
  state: "pending" | "recorded" | "absent" | "unavailable";
}

export interface SessionHistory {
  session: MonitoringSessionItem | null;
  windowStart: string;
  windowEnd: string;
  timeline: HistoryMinute[];
  adequateSummaryPercentage: number | null;
  alerts: PostureAlert[];
}
