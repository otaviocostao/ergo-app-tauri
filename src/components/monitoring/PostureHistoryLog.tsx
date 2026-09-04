import { AlertTriangle, CheckCircle2, Info, Clock, Trash2 } from "lucide-react";

export interface LogEvent {
  id: string;
  timestamp: string;
  type: "success" | "warning" | "error" | "info";
  message: string;
  detail?: string;
}

export interface PostureHistoryLogProps {
  logs: LogEvent[];
  onClearLogs?: () => void;
  className?: string;
}

export default function PostureHistoryLog({
  logs,
  onClearLogs,
  className = "",
}: PostureHistoryLogProps) {
  const timelineBlocks = [
    { status: "good", time: "11:22" },
    { status: "good", time: "11:23" },
    { status: "good", time: "11:24" },
    { status: "warning", time: "11:25" },
    { status: "warning", time: "11:26" },
    { status: "good", time: "11:27" },
    { status: "good", time: "11:28" },
    { status: "danger", time: "11:29" },
    { status: "good", time: "11:30" },
    { status: "good", time: "11:31" },
    { status: "good", time: "11:32" },
    { status: "good", time: "11:33" },
    { status: "warning", time: "11:34" },
    { status: "good", time: "11:35" },
    { status: "good", time: "11:36" },
  ];

  const getEventIcon = (type: LogEvent["type"]) => {
    switch (type) {
      case "success":
        return <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />;
      case "warning":
        return <AlertTriangle size={15} className="text-amber-500 shrink-0" />;
      case "error":
        return <AlertTriangle size={15} className="text-rose-500 shrink-0" />;
      case "info":
      default:
        return <Info size={15} className="text-sky-500 shrink-0" />;
    }
  };

  return (
    <div
      className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs flex flex-col justify-between ${className}`}
    >
      <div>
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div>
              <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-200">
                Histórico da Sessão
              </h3>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Eventos e qualidade em tempo real
              </span>
            </div>
          </div>

          {onClearLogs && logs.length > 0 && (
            <button
              onClick={onClearLogs}
              className="p-1.5 text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 rounded-md transition-colors"
              title="Limpar Histórico"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>

        <div className="mb-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1.5">
            <span>Últimos 15 minutos</span>
            <span className="font-medium text-emerald-600 dark:text-emerald-400">
              87% Ergonômico
            </span>
          </div>
          <div className="flex gap-1 h-6 items-center">
            {timelineBlocks.map((item, index) => {
              const bgClass =
                item.status === "good"
                  ? "bg-emerald-500 hover:bg-emerald-600"
                  : item.status === "warning"
                    ? "bg-amber-500 hover:bg-amber-600"
                    : "bg-rose-500 hover:bg-rose-600";
              return (
                <div
                  key={index}
                  className={`flex-1 h-full rounded-sm transition-transform hover:scale-105 cursor-pointer ${bgClass}`}
                  title={`${item.time} - Status: ${item.status}`}
                />
              );
            })}
          </div>
        </div>

        <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
          {logs.length === 0 ? (
            <div className="text-center py-6 text-slate-400 dark:text-slate-500 text-xs">
              <Clock size={24} className="mx-auto mb-2 opacity-50" />
              Nenhum alerta registrado na sessão atual.
            </div>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                className="flex items-start gap-2.5 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/80 text-xs"
              >
                {getEventIcon(log.type)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      {log.message}
                    </span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0 ml-2">
                      {log.timestamp}
                    </span>
                  </div>
                  {log.detail && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {log.detail}
                    </p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
