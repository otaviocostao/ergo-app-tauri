import { DashboardPage, MetricCard, Panel } from "../components/dashboard/DashboardWidgets";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { buildReport, createReportPreview, dailyGoalMinutes, dateKey, formatMinutes, formatPercent } from "../data/reports";
import { ReportChart } from "../components/reports/ReportWidgets";

export default function Dashboard() {
  const report = buildReport(createReportPreview(), "day", dateKey(new Date()));
  const { summary, previous } = report;
  const indexChange = summary.posturePercent !== null && previous.posturePercent !== null ? Math.round(summary.posturePercent - previous.posturePercent) : null;
  const dailyProgress = summary.goodMinutes / dailyGoalMinutes * 100;
  return <DashboardPage title="Início" subtitle="Visão geral do seu bem-estar ergonômico hoje.">
    <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-slate-500 dark:text-slate-400">Dados demonstrativos de postura</span><Link to="/reports" viewTransition className="inline-flex items-center gap-2 text-sm font-medium text-primary-700 hover:underline dark:text-primary-400">Ver todos os relatórios<ArrowRight size={16} /></Link></div>
    <div className="grid grid-cols-1 gap-5 @min-[800px]:grid-cols-3 xl:gap-4">
      <MetricCard title="Índice ergonômico" value={formatPercent(summary.posturePercent)} description="Postura dentro da faixa ideal no período." badge={indexChange === null ? undefined : `${indexChange > 0 ? "+" : ""}${indexChange} p.p.`} progress={summary.posturePercent ?? 0} progressLabel="Tempo em boa postura" to="/reports?view=index&period=day" />
      <MetricCard title="Tempo em boa postura" value={formatMinutes(summary.goodMinutes)} description="Meta diária: 6h de alinhamento ativo." progress={dailyProgress} to="/reports?view=posture&period=day" />
      <MetricCard title="Alertas preventivos" value={summary.alerts} description="Ocorrências no período demonstrativo de hoje." to="/reports?view=alerts&period=day" />
    </div>
    <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[2fr_1fr]">
      {summary.monitoredMinutes > 0 ? <ReportChart report={report} /> : <Panel title="Nenhuma leitura hoje" subtitle="A demonstração possui registros em dias úteis."><Link to="/reports" className="text-sm font-medium text-primary-700 hover:underline dark:text-primary-400">Consultar outros períodos</Link></Panel>}
      <Panel title="Resumo do monitoramento" subtitle="Resumo do período demonstrativo de hoje."><dl className="space-y-3">{[
        ["Tempo monitorado", formatMinutes(summary.monitoredMinutes), "Leituras de exemplo"],
        ["Pausas feitas", String(summary.breaks), "No período demonstrativo"],
        ["Meta de boa postura", "6h", `${Math.round(Math.min(100, dailyProgress))}% concluído`],
      ].map(([label, value, detail]) => <div key={label} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 text-xs dark:border-slate-800 dark:bg-slate-800/40"><dt className="text-slate-500 dark:text-slate-400">{label}</dt><dd className="font-semibold">{value}</dd><dd className="text-primary-700 dark:text-primary-400">{detail}</dd></div>)}</dl></Panel>
    </div>
  </DashboardPage>;
}
