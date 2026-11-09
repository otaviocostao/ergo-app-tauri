import { useEffect, useState } from "react";
import { sessionHistoryService } from "../services/sessionHistoryService";
import { waitForRecordingWrites } from "./useMetricRecording";
import { RecordingStatus } from "../enums/recordingStatus";
import type { SessionHistory } from "../types/sessionHistory";
import type { MonitoringSessionItem } from "../types/monitoringSession";
import { SESSION_HISTORY_UPDATED_EVENT, type SessionHistoryUpdatedDetail } from "../services/monitoring/sessionHistoryEvents";

const REFRESH_MS = 5_000;
interface HistoryState {
  owner: string | null;
  data: SessionHistory | null;
  session: MonitoringSessionItem | null;
  loading: boolean;
  error: string | null;
}

/** Read after session start/end, then poll without overlapping requests or leaking account data. */
export function useSessionHistory(userId: string | null, recordingStatus: RecordingStatus, isVisible: boolean) {
  const [retryKey, setRetryKey] = useState(0);
  const [state, setState] = useState<HistoryState>({ owner: userId, data: null, session: null, loading: userId !== null, error: null });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;
    let dirty = false;
    let revision = 0;
    if (userId === null) {
      setState({ owner: null, data: null, session: null, loading: false, error: null });
      return;
    }
    if (!isVisible) return;
    setState(previous => ({
      owner: userId, data: previous.owner === userId ? previous.data : null,
      session: previous.owner === userId ? previous.session : null, loading: true, error: null
    }));
    const load = async () => {
      if (cancelled) return;
      clearTimeout(timer);
      if (inFlight) { dirty = true; return; }
      inFlight = true;
      dirty = false;
      const requestedRevision = revision;
      try {
        await waitForRecordingWrites();
        if (cancelled) return;
        const data = await sessionHistoryService.get();
        if (!cancelled && requestedRevision === revision) {
          setState({ owner: userId, data, session: data?.session ?? null, loading: false, error: null });
        }
      } catch (error) {
        if (!cancelled && requestedRevision === revision) setState(previous => ({
          ...previous, loading: false,
          error: error instanceof Error ? error.message : "Não foi possível carregar o histórico salvo."
        }));
      } finally {
        inFlight = false;
        if (!cancelled) {
          // A save during a read invalidates that response and requests one fresh read.
          if (dirty || requestedRevision !== revision) void load();
          else if (recordingStatus !== RecordingStatus.IDLE) timer = setTimeout(load, REFRESH_MS);
        }
      }
    };
    const handleUpdated = (event: Event) => {
      const detail = (event as CustomEvent<SessionHistoryUpdatedDetail>).detail;
      if (detail.userId !== userId) return;
      revision++;
      if (detail.session?.startedAt) {
        setState(previous => ({ ...previous, owner: userId, session: detail.session!, loading: true, error: null }));
      }
      void load();
    };
    window.addEventListener(SESSION_HISTORY_UPDATED_EVENT, handleUpdated);
    void load();
    return () => { cancelled = true; clearTimeout(timer); window.removeEventListener(SESSION_HISTORY_UPDATED_EVENT, handleUpdated); };
  }, [userId, recordingStatus, isVisible, retryKey]);

  const visibleState = state.owner === userId ? state : { owner: userId, data: null, session: null, loading: userId !== null, error: null };
  return { ...visibleState, retry: () => setRetryKey(key => key + 1) };
}
