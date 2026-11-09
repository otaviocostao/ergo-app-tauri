import { useEffect, useState } from "react";
import { DashboardPage, MetricCard, Panel } from "../components/dashboard/DashboardWidgets";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import Button from "../components/Button";
import { dateKey, formatMinutes, formatPercent } from "../data/reports";
import { ReportChart } from "../components/reports/ReportWidgets";
import { useAuth } from "../auth/AuthContext";
import { dashboardService } from "../services/dashboardService";
import { buildDashboard, dashboardPeriod } from "../services/dashboardMetrics";
import type { DashboardData } from "../types/dashboard";
import { waitForRecordingWrites } from "../hooks/useMetricRecording";
import { SESSION_HISTORY_UPDATED_EVENT, type SessionHistoryUpdatedDetail } from "../services/monitoring/sessionHistoryEvents";
import { SETTINGS_UPDATED_EVENT, type SettingsUpdatedDetail } from "../services/settingsService";

type LoadState = { owner: string | null; day: string } & (
  | { kind: "loading" }
  | { kind: "ready"; data: DashboardData }
  | { kind: "error"; message: string }
);

export default function Dashboard() {
  const { session } = useAuth();
  const userId = session.kind === "authenticated" ? session.user.id : null;
  const [today, setToday] = useState(() => new Date());
  const key = dateKey(today);
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<LoadState>({ kind: "loading", owner: userId, day: key });

  useEffect(() => {
    const now = new Date();
    const timer = setTimeout(() => setToday(new Date()), dashboardPeriod(now).dayEnd.getTime() - now.getTime() + 50);
    const refreshDay = () => setToday(new Date());
    window.addEventListener("focus", refreshDay);
    return () => { clearTimeout(timer); window.removeEventListener("focus", refreshDay); };
  }, [key]);

  useEffect(() => {
    let active = true;
    let request = 0;
    const context = { owner: userId, day: key };
    setLoad({ ...context, kind: "loading" });
    if (userId === null) {
      setLoad({ ...context, kind: "error", message: "Entre na sua conta para consultar o histórico." });
      return;
    }
    const refresh = async () => {
      const current = ++request;
      try {
        await waitForRecordingWrites();
        if (!active || current !== request) return;
        const data = await dashboardService.getData(dashboardPeriod(today).filter);
        if (active && current === request) {
          setToday(new Date());
          setLoad({ ...context, kind: "ready", data });
        }
      } catch (error: unknown) {
        if (active && current === request) setLoad({ ...context, kind: "error", message: error instanceof Error ? error.message : "Não foi possível carregar o histórico. Tente novamente." });
      }
    };
    const onHistory = (event: Event) => {
      if ((event as CustomEvent<SessionHistoryUpdatedDetail>).detail?.userId === userId) void refresh();
    };
    const onSettings = (event: Event) => {
      if ((event as CustomEvent<SettingsUpdatedDetail>).detail?.settings.userId === userId) void refresh();
    };
    const onFocus = () => { void refresh(); };
    const timer = setInterval(() => { if (!document.hidden) void refresh(); }, 30_000);
    window.addEventListener(SESSION_HISTORY_UPDATED_EVENT, onHistory);
    window.addEventListener(SETTINGS_UPDATED_EVENT, onSettings);
    window.addEventListener("focus", onFocus);
    void refresh();
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener(SESSION_HISTORY_UPDATED_EVENT, onHistory);
      window.removeEventListener(SETTINGS_UPDATED_EVENT, onSettings);
      window.removeEventListener("focus", onFocus);
    };
  }, [userId, key, attempt]);

  if (load.owner !== userId || load.day !== key || load.kind === "loading") return <DashboardPage title="Início" subtitle="Seu histórico de ergonomia."><p role="status">Carregando seu histórico...</p></DashboardPage>;
  if (load.kind === "error") return <DashboardPage title="Início" subtitle="Seu histórico de ergonomia."><Panel title="Histórico indisponível"><p role="alert" className="mb-4 text-sm">{load.message}</p><Button onClick={() => setAttempt(value => value + 1)}>Tentar novamente</Button></Panel></DashboardPage>;

  const view = buildDashboard(load.data, today);
  const indexChange = view.posturePercent !== null && view.previousPosturePercent !== null ? Math.round(view.posturePercent - view.previousPosturePercent) : null;
  const dailyProgress = view.goodMinutes / view.dailyGoalMinutes * 100;
  return <DashboardPage title="Início" subtitle="Visão geral do seu bem-estar ergonômico hoje.">
    <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-slate-500 dark:text-slate-400">Dados salvos do seu monitoramento</span><Link to="/reports" viewTransition className="inline-flex items-center gap-2 text-sm font-medium text-primary-700 hover:underline dark:text-primary-400">Ver relatórios demonstrativos<ArrowRight size={16} /></Link></div>
    {!view.hasData && <Panel title="Nenhuma sessão registrada hoje" subtitle="Inicie o monitoramento para registrar suas primeiras leituras."><Link to="/monitoring" className="text-sm font-medium text-primary-700 hover:underline dark:text-primary-400">Abrir Monitoramento</Link></Panel>}
    <div className="grid grid-cols-1 gap-5 @min-[800px]:grid-cols-3 xl:gap-4">
      <MetricCard title="Índice ergonômico" value={formatPercent(view.posturePercent)} description="Boa postura nas sessões encerradas e nos resumos já salvos da sessão em andamento." badge={indexChange === null ? undefined : `${indexChange > 0 ? "+" : ""}${indexChange} p.p.`} progress={view.posturePercent ?? undefined} progressLabel="Tempo em boa postura" />
      <MetricCard title="Tempo em boa postura" value={formatMinutes(view.goodMinutes)} description={`Meta diária: ${formatMinutes(view.dailyGoalMinutes)} de boa postura.`} progress={dailyProgress} />
      <MetricCard title="Alertas preventivos" value={view.alerts} description="Episódios registrados hoje durante o monitoramento." />
    </div>
    <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[2fr_1fr]">
      {view.points.some(point => point.value !== null) ? <ReportChart metric="score" report={{ period: "day", start: key, end: key, points: view.points }} /> : <Panel title="Sem leituras por horário" subtitle="O gráfico aguarda os resumos de minutos completos de monitoramento."><p className="text-sm text-slate-500 dark:text-slate-400">Aguarde um minuto contínuo com leituras válidas.</p></Panel>}
      <Panel title="Resumo do monitoramento" subtitle="Dados do dia local, incluindo os resumos já salvos das sessões em andamento."><dl className="space-y-3">{[
        ["Tempo monitorado", formatMinutes(view.monitoredMinutes), "Tempo de monitoramento registrado"],
        ["Pausas feitas", String(view.pauses), "Micro-pausas detectadas na digitação"],
        ["Meta de boa postura", formatMinutes(view.dailyGoalMinutes), `${Math.round(Math.min(100, dailyProgress))}% da meta diária`],
      ].map(([label, value, detail]) => <div key={label} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 text-xs dark:border-slate-800 dark:bg-slate-800/40"><dt className="text-slate-500 dark:text-slate-400">{label}</dt><dd className="font-semibold">{value}</dd><dd className="text-primary-700 dark:text-primary-400">{detail}</dd></div>)}</dl><Link to="/settings?tab=modules" className="mt-3 inline-block text-xs text-primary-700 hover:underline dark:text-primary-400">Configurar meta diária</Link></Panel>
    </div>
  </DashboardPage>;
}
