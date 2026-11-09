import { useEffect, useState } from "react";
import { reportService } from "../services/reportService";
import type { ReportData, ReportFilter } from "../types/report";
import { waitForRecordingWrites } from "./useMetricRecording";
import { SESSION_HISTORY_UPDATED_EVENT, type SessionHistoryUpdatedDetail } from "../services/monitoring/sessionHistoryEvents";

interface ReportState {
  key: string;
  data: ReportData | null;
  loading: boolean;
  error: string | null;
}

/** Invalidate in-flight reads on saves and account/range changes; never mix owners. */
export function useReportData(userId: string | null, filter: ReportFilter) {
  const { startTime, endTime } = filter;
  const key = JSON.stringify([userId, startTime, endTime]);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<ReportState>({ key, data: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    let dirty = false;
    let revision = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setState({ key, data: null, loading: userId !== null, error: userId === null ? "Entre na sua conta para consultar seus relatórios." : null });
    if (userId === null) return;

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
        const data = await reportService.getData({ startTime, endTime });
        if (!cancelled && requestedRevision === revision) setState({ key, data, loading: false, error: null });
      } catch (error) {
        if (!cancelled && requestedRevision === revision) {
          setState({ key, data: null, loading: false, error: error instanceof Error ? error.message : "Não foi possível carregar os relatórios salvos. Tente novamente." });
        }
      } finally {
        inFlight = false;
        if (!cancelled) {
          if (dirty || requestedRevision !== revision) void load();
          else timer = setTimeout(() => { if (document.hidden) schedule(); else void load(); }, 30_000);
        }
      }
    };
    const schedule = () => {
      if (!cancelled) timer = setTimeout(() => { if (document.hidden) schedule(); else void load(); }, 30_000);
    };
    const onUpdated = (event: Event) => {
      if ((event as CustomEvent<SessionHistoryUpdatedDetail>).detail?.userId !== userId) return;
      revision++;
      void load();
    };
    const onFocus = () => { if (!document.hidden) void load(); };
    window.addEventListener(SESSION_HISTORY_UPDATED_EVENT, onUpdated);
    window.addEventListener("focus", onFocus);
    void load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener(SESSION_HISTORY_UPDATED_EVENT, onUpdated);
      window.removeEventListener("focus", onFocus);
    };
  }, [key, userId, startTime, endTime, attempt]);

  const visible = state.key === key ? state : { key, data: null, loading: true, error: null };
  return { ...visible, retry: () => setAttempt(value => value + 1) };
}
