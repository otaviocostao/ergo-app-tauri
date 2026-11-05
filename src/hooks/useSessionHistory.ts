import { useEffect, useState } from "react";
import { sessionHistoryService } from "../services/sessionHistoryService";
import { waitForRecordingWrites, type RecordingStatus } from "./useMetricRecording";
import type { SessionHistory } from "../types/sessionHistory";

const REFRESH_MS = 5_000;
interface HistoryState {
  owner: number | null;
  data: SessionHistory | null;
  loading: boolean;
  error: string | null;
}

/** Read after session start/end, then poll without overlapping requests or leaking account data. */
export function useSessionHistory(userId: number | null, recordingStatus: RecordingStatus, isVisible: boolean) {
  const [retryKey, setRetryKey] = useState(0);
  const [state, setState] = useState<HistoryState>({ owner: userId, data: null, loading: userId !== null, error: null });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (userId === null) {
      setState({ owner: null, data: null, loading: false, error: null });
      return;
    }
    if (!isVisible) return;
    setState(previous => ({ owner: userId, data: previous.owner === userId ? previous.data : null, loading: true, error: null }));
    const load = async () => {
      try {
        await waitForRecordingWrites();
        if (cancelled) return;
        const data = await sessionHistoryService.get();
        if (!cancelled) setState({ owner: userId, data, loading: false, error: null });
      } catch (error) {
        if (!cancelled) setState(previous => ({ ...previous, loading: false,
          error: error instanceof Error ? error.message : "Não foi possível carregar o histórico salvo." }));
      } finally {
        // Refreshes also retry read failures; closed sessions keep a fixed historical window.
        if (!cancelled && recordingStatus !== "idle") timer = setTimeout(load, REFRESH_MS);
      }
    };
    void load();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [userId, recordingStatus, isVisible, retryKey]);

  const visibleState = state.owner === userId ? state : { owner: userId, data: null, loading: userId !== null, error: null };
  return { ...visibleState, retry: () => setRetryKey(key => key + 1) };
}
