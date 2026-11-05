import { AlertCircle, CheckCircle2, Clock, KeyboardOff, RotateCcw } from "lucide-react";
import type { LiveTypingMetrics } from "../../types/typingMetricSnapshot";

export interface KeyboardMonitorCardProps {
  /** False when the typing analysis module is disabled: no keys are counted. */
  enabled?: boolean;
  /** True when monitoring is paused by the user or while calibrating. */
  isPaused?: boolean;
  /** Real-time typing telemetry streamed from the Rust background service. */
  metrics?: LiveTypingMetrics | null;
  onPauseRequested?: () => void;
  className?: string;
}

export default function KeyboardMonitorCard({
  enabled = true,
  isPaused = false,
  metrics = null,
  onPauseRequested,
  className = "",
}: KeyboardMonitorCardProps) {
  if (!enabled) {
    return (
        <div
          data-module-inactive="true"
          className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs ${className}`}
        >
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-200">
                Atividade de Digitação
              </h3>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Monitoramento da cadência de teclas digitadas e tempo de uso contínuo.
              </span>
            </div>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Módulo inativo
            </span>
          </div>
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
            <KeyboardOff size={15} className="shrink-0 text-slate-400" />
            <span>
              Análise de digitação desativada em Configurações → Módulos. Nenhuma tecla está sendo
              contabilizada.
            </span>
          </div>
        </div>
        );
  }

        const cpm = metrics?.cpm ?? 0;
        const continuousMinutes = metrics?.continuousMinutes ?? 0;
        const totalKeystrokes = metrics?.totalKeystrokes ?? 0;
        const dominantStatus =
        metrics?.dominantStatus ??
    (continuousMinutes >= 25 ? "danger" : continuousMinutes >= 15 ? "warning" : "good");
  const isHighRisk = dominantStatus === "danger" || continuousMinutes >= 25;
        const isModerateRisk =
        !isHighRisk &&
    (dominantStatus === "warning" || (continuousMinutes >= 15 && continuousMinutes < 25));
        const isTyping = !isPaused && Boolean(metrics?.isTyping);

        const statusBadgeLabel = isPaused
        ? "Em pausa"
        : isTyping
        ? "Digitando"
        : "Pausa / Inativo";

        return (
        <div
          className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs flex flex-col justify-between ${className}`}
        >
          <div>
            {/* Header */}
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div>
                  <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-200">
                    Atividade de Digitação
                  </h3>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Monitoramento da cadência de teclas digitadas e tempo de uso contínuo.
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                    { isTyping && (
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    )}
                  <span
                    className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isTyping ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-700"
                      }`}
                  ></span>
                </span>
                <span
                  className={`text-xs font-medium ${isTyping
                      ? "text-emerald-600 dark:text-emerald-400 font-semibold"
                      : "text-slate-500 dark:text-slate-400"
                    }`}
                >
                  {statusBadgeLabel}
                </span>
                <button
                  onClick={() => onPauseRequested?.()}
                  title="Resetar métricas de digitação"
                  className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors rounded"
                >
                  <RotateCcw size={13} />
                </button>
              </div>
            </div>

            {/* Typing metrics grid */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mb-1">
                  <span>Velocidade</span>
                </div>
                <div className="text-xl font-bold text-slate-800 dark:text-slate-100">
                  {cpm} <span className="text-xs font-normal text-slate-500">CPM</span>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mb-1">
                  <span>Uso Contínuo</span>
                </div>
                <div
                  className={`text-xl font-bold ${isHighRisk
                      ? "text-rose-600 dark:text-rose-400"
                      : isModerateRisk
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-slate-800 dark:text-slate-100"
                    }`}
                >
                  {continuousMinutes}{" "}
                  <span className="text-xs font-normal text-slate-500">min</span>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mb-1">
                  <span>Teclas</span>
                </div>
                <div className="text-xl font-bold text-slate-800 dark:text-slate-100">
                  {totalKeystrokes}
                </div>
              </div>
            </div>

            {isHighRisk ? (
              <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300 mb-4">
                <AlertCircle size={16} className="shrink-0 text-rose-500 mt-0.5" />
                <div>
                  <p className="font-semibold">Recomendado Fazer uma Pausa!</p>
                  <p className="mt-0.5 text-rose-600 dark:text-rose-400">
                    Você está digitando há mais de 25 minutos seguidos. Faça uma pausa de 2 minutos
                    para alongar os pulsos.
                  </p>
                </div>
              </div>
            ) : isModerateRisk ? (
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 flex items-start gap-2.5 text-xs text-amber-700 dark:text-amber-300 mb-4">
                <Clock size={16} className="shrink-0 text-amber-500 mt-0.5" />
                <div>
                  <p className="font-semibold">Sessão Moderada de Digitação</p>
                  <p className="mt-0.5 text-amber-600 dark:text-amber-400">
                    Lembre-se de relaxar os ombros e apoiar bem os antebraços na mesa.
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40 flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300 mb-4">
                <CheckCircle2 size={15} className="shrink-0 text-emerald-500" />
                <span>Ritmo saudável de digitação com pausas regulares.</span>
              </div>
            )}
          </div>
        </div>
        );
}
