import { AlertTriangle } from "lucide-react";
import { MetricCard, Panel, ProgressBar } from "../components/dashboard/DashboardWidgets";
import { Comparison } from "../components/reports/ReportWidgets";
import { formatDate, type PostureReport } from "../data/reports";

export default function PreventiveAlerts({ report }: { report: PostureReport }) {
  const { summary, previous } = report;
  const alerts = report.days.flatMap(day => day.alerts).sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
  const groups = [
    { kind: "neck", label: "Pescoço projetado à frente" },
    { kind: "shoulders", label: "Desnível dos ombros" },
    { kind: "trunk", label: "Inclinação do tronco" },
  ].map(group => ({ ...group, count: alerts.filter(alert => alert.kind === group.kind).length })).sort((a, b) => b.count - a.count);
  return <div className="flex flex-col gap-5">
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <MetricCard title="Alertas registrados" value={summary.alerts} description="Ocorrências no período selecionado." />
      <MetricCard title="Frequência de alertas" value={`${summary.alertsPerHour?.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) ?? "—"}/h`} description="Alertas por hora de monitoramento." />
      <MetricCard title="Pausas realizadas" value={summary.breaks} description={`Média de ${(summary.breaks / summary.days).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} por dia monitorado.`} />
    </div>
    <div className="grid items-start gap-5 xl:grid-cols-[1fr_2fr]">
      <Panel title="Pontos de atenção" subtitle="Distribuição dos tipos de alerta no período.">
        <ul className="space-y-6">{groups.map(group => <li key={group.kind}><div className="mb-2 flex items-center justify-between gap-3 text-sm"><span>{group.label}</span><span className="font-semibold">{group.count}</span></div><ProgressBar label={group.label} value={summary.alerts ? group.count / summary.alerts * 100 : 0} /></li>)}</ul>
        <div className="mt-7 border-t border-slate-100 pt-5 dark:border-slate-800"><p className="mb-2 text-xs text-slate-500 dark:text-slate-400">Frequência em relação ao período anterior</p><Comparison change={summary.alertsPerHour === null || previous.alertsPerHour === null ? null : summary.alertsPerHour - previous.alertsPerHour} unit="/h" lowerIsBetter /></div>
      </Panel>
      <Panel title="Registro de alertas" subtitle={`${alerts.length} ocorrência(s), da mais recente à mais antiga.`}>
        {alerts.length === 0 ? <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">Nenhum alerta registrado neste período.</p> : <ul className="max-h-[520px] space-y-3 overflow-y-auto pr-1">{alerts.map((alert, index) => <li key={`${alert.date}-${alert.time}-${index}`} className="flex items-start gap-3 rounded-lg bg-slate-50 p-4 dark:bg-slate-800/50"><span className="mt-0.5 rounded-lg bg-amber-50 p-2 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400"><AlertTriangle size={16} aria-hidden="true" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap justify-between gap-2"><h3 className="text-sm font-semibold">{alert.title}</h3><time dateTime={`${alert.date}T${alert.time}`} className="text-xs text-slate-500 dark:text-slate-400">{formatDate(alert.date)} · {alert.time}</time></div><p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{alert.detail}</p></div></li>)}</ul>}
      </Panel>
    </div>
  </div>;
}
