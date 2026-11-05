import { AlertTriangle, CheckCircle2, Info, Clock, Trash2 } from "lucide-react";
import { useState } from "react";
import { useSessionHistory } from "../../hooks/useSessionHistory";
import type { RecordingStatus } from "../../hooks/useMetricRecording";
import { POSTURE_STATUS_LABELS, PostureStatus } from "../../enums/postureStatus";

export interface LogEvent {
  id: string;
  timestamp: string;
  occurredAt?: string;
  scope?: "session" | "account";
  userId?: number | null;
  type: "success" | "warning" | "error" | "info";
  message: string;
  detail?: string;
}

export interface PostureHistoryLogProps {
  logs: LogEvent[];
  onClearLogs?: () => void;
  className?: string;
  userId?: number | null;
  recordingStatus?: RecordingStatus;
  isVisible?: boolean;
}

export default function PostureHistoryLog({
  logs,
  onClearLogs,
  className = "",
  userId = null,
  recordingStatus = "idle",
  isVisible = true,
}: PostureHistoryLogProps) {
  const { data: loadedData, session, loading, error, retry } = useSessionHistory(userId, recordingStatus, isVisible);
  const [hidden, setHidden] = useState<{ key: string; ids: Set<string> }>({ key: "", ids: new Set() });
  // A newly saved start must not display the previous session's alerts or hide new live notices.
  const data = loadedData?.session?.id === session?.id ? loadedData : null;
  const historyKey = `${userId}:${session?.id ?? "none"}`;
  const time = (value: string) => new Date(value).toLocaleTimeString("pt-BR");
  const savedLogs: LogEvent[] = (data?.alerts ?? []).map(alert => ({
    id: `stored:${alert.id}`, occurredAt: alert.timestamp, timestamp: time(alert.timestamp),
    type: alert.severity.toLowerCase() === "danger" ? "error" : "warning",
    message: alert.message,
    detail: `${alert.resolvedAt ? "Encerrado" : "Em andamento"} · Duração registrada: ${alert.durationSeconds} s.`,
  }));
  if (session) {
    savedLogs.push({ id: `session:${session.id}:start`, occurredAt: session.startedAt, timestamp: time(session.startedAt),
      type: "info", message: "Monitoramento iniciado", detail: "Sessão registrada para acompanhar sua postura." });
    if (session.endedAt) savedLogs.push({ id: `session:${session.id}:end`, occurredAt: session.endedAt,
      timestamp: time(session.endedAt), type: "success", message: "Monitoramento encerrado",
      detail: "Consulte abaixo os alertas registrados nesta sessão." });
  }
  // Stored episodes replace repeated cooldown notifications of the same posture condition.
  // Presence, hardware and interface notices remain actual events from this execution.
  // Saving calibration happens between recording sessions and belongs to its account.
  const runtimeLogs = logs.filter(log => userId !== null && !log.id.startsWith("posture:") &&
    (log.scope === "account" ? log.userId === userId
      : !session || (log.occurredAt && Date.parse(log.occurredAt) >= Date.parse(session.startedAt) &&
        (!session.endedAt || Date.parse(log.occurredAt) <= Date.parse(session.endedAt)))));
  const displayLogs = [...savedLogs, ...runtimeLogs]
    .filter(log => hidden.key !== historyKey || !hidden.ids.has(log.id))
    .sort((left, right) => Date.parse(right.occurredAt ?? "1970-01-01") - Date.parse(left.occurredAt ?? "1970-01-01"))
    .slice(0, 100);
  const timelineBlocks = data?.timeline ?? Array.from({ length: 15 }, () => null);
  const percentage = data?.adequateSummaryPercentage;
  const percentageLabel = percentage == null
    ? !session ? "Nenhum minuto registrado"
      : data?.timeline.some(minute => minute.state !== "pending") ? "Sem minutos avaliados" : "Aguardando primeiro minuto"
    : `${Math.round(percentage)}% dos minutos adequados`;

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
      aria-busy={loading}
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
                {session?.endedAt ? "Última sessão registrada" : "Eventos e qualidade durante o monitoramento"}
              </span>
            </div>
          </div>

          {displayLogs.length > 0 && (
            <button
              onClick={() => {
                setHidden({ key: historyKey, ids: new Set([...savedLogs, ...runtimeLogs].map(log => log.id)) });
                onClearLogs?.();
              }}
              className="p-1.5 text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 rounded-md transition-colors"
              title="Limpar lista de eventos"
              aria-label="Limpar lista de eventos"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>

        <div className="mb-4">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400 mb-1.5">
            <span title={data ? `${new Date(data.windowStart).toLocaleString("pt-BR")} – ${new Date(data.windowEnd).toLocaleString("pt-BR")}` : undefined}>
              {session?.endedAt ? "Últimos 15 minutos da sessão" : "Últimos 15 minutos"}
            </span>
            <span className="font-medium" title="Percentual dos minutos avaliados com postura predominante adequada. Ausência e falta de leitura não entram no cálculo.">
              {percentageLabel}
            </span>
          </div>
          <div className="flex gap-1 h-6 items-center" role="img" aria-label="Qualidade postural por minuto">
            {timelineBlocks.map((item, index) => {
              const state = item?.state ?? (item?.status ? "recorded" : "pending");
              const bgClass =
                state === "absent"
                  ? "bg-slate-400 dark:bg-slate-600"
                  : item?.status === PostureStatus.GOOD
                  ? "bg-emerald-500 hover:bg-emerald-600"
                  : item?.status === PostureStatus.WARNING
                    ? "bg-amber-500 hover:bg-amber-600"
                    : item?.status === PostureStatus.DANGER
                      ? "bg-rose-500 hover:bg-rose-600"
                      : state === "unavailable"
                        ? "border border-amber-500/60 bg-transparent"
                        : "border border-dashed border-slate-300 dark:border-slate-600 bg-transparent";
              const label = state === "absent" ? "Usuário ausente durante todo o minuto"
                : state === "unavailable" ? "Sem leituras válidas neste minuto"
                  : item?.status ? POSTURE_STATUS_LABELS[item.status]
                    : session?.endedAt ? "Minuto não concluído nesta sessão" : "Aguardando conclusão deste minuto";
              return (
                <div
                  key={index}
                  className={`flex-1 h-full rounded-sm transition-transform hover:scale-105 ${bgClass}`}
                  title={item ? `${time(item.startedAt)} – ${time(item.endedAt)}: ${label}. ${item.summariesCount} resumo(s), ${item.samplesCount} amostras.` : "Aguardando início do monitoramento"}
                />
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
            Cada quadrado representa um minuto completo. Cinza: ausente o minuto inteiro.
            {" "}Contorno: aguardando ou sem leitura válida.
          </p>
        </div>

        {error && <p role="alert" className="mb-3 text-xs text-amber-700 dark:text-amber-300">
          Não foi possível atualizar o histórico salvo. {data ? "Exibindo os últimos dados carregados. " : ""}
          <button type="button" onClick={retry} className="font-semibold underline">Tentar novamente</button>
        </p>}

        <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
          {displayLogs.length === 0 ? (
            <div className="text-center py-6 text-slate-400 dark:text-slate-500 text-xs">
              <Clock size={24} className="mx-auto mb-2 opacity-50" />
              {loading ? "Carregando histórico salvo…" : error && !data ? "Histórico indisponível." : !session ? "Nenhuma sessão de monitoramento registrada." : "Nenhum evento na lista."}
            </div>
          ) : (
            displayLogs.map((log) => (
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
