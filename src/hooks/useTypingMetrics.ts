import { useCallback, useEffect, useState } from "react";
import { typingMonitorService } from "../services/typingMonitorService";
import {
  DEFAULT_LIVE_TYPING_METRICS,
  type LiveTypingMetrics,
} from "../types/typingMetricSnapshot";

export interface UseTypingMetricsOptions {
  enabled?: boolean;
  isPaused?: boolean;
}

export interface UseTypingMetricsResult {
  metrics: LiveTypingMetrics;
  resetMetrics: () => Promise<void>;
}

export function useTypingMetrics({
  enabled = true,
  isPaused = false,
}: UseTypingMetricsOptions = {}): UseTypingMetricsResult {
  const [metrics, setMetrics] = useState<LiveTypingMetrics>(() => ({
    ...DEFAULT_LIVE_TYPING_METRICS,
  }));

  useEffect(() => {
    if (!enabled) {
      setMetrics({ ...DEFAULT_LIVE_TYPING_METRICS });
      return;
    }

    let cancelled = false;
    let cleanupListener: (() => void) | null = null;

    const refreshSnapshot = async () => {
      try {
        const current = await typingMonitorService.getLiveMetrics();
        if (!cancelled) {
          setMetrics(current);
        }
      } catch (error) {
        console.error("Failed to fetch live typing metrics", error);
      }
    };

    const setup = async () => {
      const unlisten = await typingMonitorService.subscribe((updated) => {
        if (!cancelled) {
          setMetrics(updated);
        }
      });

      if (cancelled) {
        unlisten();
        return;
      }
      cleanupListener = unlisten;

      try {
        const synced = await typingMonitorService.setPaused(isPaused);
        if (!cancelled) {
          setMetrics(synced);
        }
      } catch (error) {
        console.error("Failed to synchronize typing monitor pause state", error);
      }

      await refreshSnapshot();
    };

    void setup();

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") {
        void refreshSnapshot();
      }
    };

    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
      if (cleanupListener) {
        cleanupListener();
      }
    };
  }, [enabled, isPaused]);

  const resetMetrics = useCallback(async () => {
    try {
      const reset = await typingMonitorService.resetSessionMetrics();
      setMetrics(reset);
    } catch (error) {
      console.error("Failed to reset typing session metrics", error);
    }
  }, []);

  return { metrics, resetMetrics };
}

