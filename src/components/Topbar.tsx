import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { RecordingStatus } from "../enums/recordingStatus";

interface MonitoringBadgeState {
  isMonitoring: boolean;
  recordingStatus: RecordingStatus;
}

interface TopbarMonitoringContextValue {
  state: MonitoringBadgeState;
  setState: (state: MonitoringBadgeState) => void;
}

const DEFAULT_STATE: MonitoringBadgeState = {
  isMonitoring: false,
  recordingStatus: RecordingStatus.IDLE,
};

const TopbarMonitoringContext = createContext<TopbarMonitoringContextValue>({
  state: DEFAULT_STATE,
  setState: () => {},
});

export function TopbarMonitoringProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<MonitoringBadgeState>(DEFAULT_STATE);

  const value = useMemo<TopbarMonitoringContextValue>(() => ({
    state,
    setState,
  }), [state]);

  return (
    <TopbarMonitoringContext.Provider value={value}>
      {children}
    </TopbarMonitoringContext.Provider>
  );
}

export function useSyncTopbarMonitoring(
  isMonitoring: boolean,
  recordingStatus: RecordingStatus,
) {
  const { setState } = useContext(TopbarMonitoringContext);

  useEffect(() => {
    setState({ isMonitoring, recordingStatus });
  }, [isMonitoring, recordingStatus, setState]);

  useEffect(() => {
    return () => setState(DEFAULT_STATE);
  }, [setState]);
}

export default function Topbar() {
  const { state } = useContext(TopbarMonitoringContext);
  const isBusy =
    state.recordingStatus === RecordingStatus.STARTING ||
    state.recordingStatus === RecordingStatus.ENDING;
  const isError = state.recordingStatus === RecordingStatus.ERROR;
  const isActive = state.isMonitoring && !isBusy && !isError;

  return (
    <header className="h-14 bg-white/80 backdrop-blur-md border-b border-slate-200 flex items-center justify-end px-6 shrink-0 transition-colors dark:bg-slate-900/80 dark:border-slate-800">
      <Link
        to="/monitoring"
        viewTransition
        className={`inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full border text-xs font-semibold transition-all select-none focus:outline-none ${
          isActive
            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 hover:bg-emerald-500/20 dark:bg-slate-800/90 dark:border-emerald-500/40 dark:text-emerald-400 dark:hover:bg-slate-800"
            : "bg-slate-100 border-slate-200 text-slate-500 hover:bg-slate-200/70 hover:text-slate-800 dark:bg-slate-800/90 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        }`}
      >
        <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
          {isActive && (
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          )}
          <span
            className={`relative inline-flex rounded-full h-2.5 w-2.5 transition-colors ${
              isActive ? "bg-emerald-500" : "bg-slate-400 dark:bg-slate-600"
            }`}
          ></span>
        </span>
        <span>{isActive ? "Monitoramento ativo" : "Monitoramento inativo"}</span>
      </Link>
    </header>
  );
}
