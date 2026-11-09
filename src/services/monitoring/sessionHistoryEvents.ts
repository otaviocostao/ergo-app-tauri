import type { MonitoringSessionItem } from "../../types/monitoringSession";

export const SESSION_HISTORY_UPDATED_EVENT = "ergo:session-history-updated";

export interface SessionHistoryUpdatedDetail {
  userId: string | null;
  sessionId: string;
  session?: MonitoringSessionItem;
}

/** Notify readers only after an IPC write succeeds; metadata comes from the saved row. */
export function notifySessionHistoryUpdated(detail: SessionHistoryUpdatedDetail): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<SessionHistoryUpdatedDetail>(SESSION_HISTORY_UPDATED_EVENT, { detail }));
  }
}
