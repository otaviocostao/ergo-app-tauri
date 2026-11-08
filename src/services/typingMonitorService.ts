import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  DEFAULT_LIVE_TYPING_METRICS,
  type LiveTypingMetrics,
  type TypingStatus,
} from "../types/typingMetricSnapshot";

export const TYPING_METRICS_UPDATED_EVENT = "typing-metrics-updated";

function isValidTypingStatus(value: unknown): value is TypingStatus {
  return value === "good" || value === "warning" || value === "danger";
}

export function normalizeLiveTypingMetrics(raw: unknown): LiveTypingMetrics {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_LIVE_TYPING_METRICS };
  }

  const candidate = raw as Partial<LiveTypingMetrics>;
  return {
    sessionId: typeof candidate.sessionId === "string" ? candidate.sessionId : null,
    isMonitoringActive: Boolean(candidate.isMonitoringActive),
    isTyping: Boolean(candidate.isTyping),
    cpm: typeof candidate.cpm === "number" && Number.isFinite(candidate.cpm) ? candidate.cpm : 0,
    peakCpm:
      typeof candidate.peakCpm === "number" && Number.isFinite(candidate.peakCpm)
        ? candidate.peakCpm
        : 0,
    totalKeystrokes:
      typeof candidate.totalKeystrokes === "number" && Number.isFinite(candidate.totalKeystrokes)
        ? candidate.totalKeystrokes
        : 0,
    continuousMinutes:
      typeof candidate.continuousMinutes === "number" &&
        Number.isFinite(candidate.continuousMinutes)
        ? candidate.continuousMinutes
        : 0,
    dominantStatus: isValidTypingStatus(candidate.dominantStatus)
      ? candidate.dominantStatus
      : "good",
  };
}

export const typingMonitorService = {
  async getLiveMetrics(): Promise<LiveTypingMetrics> {
    if (!isTauri()) {
      return { ...DEFAULT_LIVE_TYPING_METRICS };
    }
    const result = await invoke<LiveTypingMetrics>("get_live_typing_metrics");
    return normalizeLiveTypingMetrics(result);
  },

  async setPaused(paused: boolean): Promise<LiveTypingMetrics> {
    if (!isTauri()) {
      return { ...DEFAULT_LIVE_TYPING_METRICS };
    }
    const result = await invoke<LiveTypingMetrics>("set_typing_monitoring_paused", {
      paused,
    });
    return normalizeLiveTypingMetrics(result);
  },

  async subscribe(
    onUpdate: (metrics: LiveTypingMetrics) => void,
  ): Promise<() => void> {
    if (!isTauri()) {
      return () => { };
    }

    try {
      const unlisten = await listen<LiveTypingMetrics>(
        TYPING_METRICS_UPDATED_EVENT,
        (event) => {
          onUpdate(normalizeLiveTypingMetrics(event.payload));
        },
      );

      return () => {
        try {
          void Promise.resolve(unlisten()).catch(() => { });
        } catch {
          // Ignore teardown errors in simulated test environments without full event internals.
        }
      };
    } catch {
      // Gracefully degrade when @tauri-apps/api/core is partially mocked in unit tests.
      return () => { };
    }
  },
};

