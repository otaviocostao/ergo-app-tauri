import { MetricCard, Panel } from "../components/dashboard/DashboardWidgets";
import { PeriodComparison, ReportChart } from "../components/reports/ReportWidgets";
import { formatMinutes, formatPercent, type PostureReport } from "../data/reports";

export default function ErgonomicIndex({ report }: { report: PostureReport }) {
  const { summary } = report;
  const outsideMinutes = summary.monitoredMinutes - summary.goodMinutes;
  return <div className="flex flex-col gap-5">
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <MetricCard title="Tempo monitorado" value={formatMinutes(summary.monitoredMinutes)} description={`${summary.days} dia(s) com leituras no período selecionado.`} />
      <MetricCard title="Dentro da faixa ideal" value={formatMinutes(summary.goodMinutes)} description={`${formatPercent(summary.posturePercent)} do tempo registrado em boa postura.`} progress={summary.posturePercent ?? 0} />
      <MetricCard title="Fora da faixa ideal" value={formatMinutes(outsideMinutes)} description="Tempo monitorado com ajuste de postura indicado." progress={100 - (summary.posturePercent ?? 0)} danger />
    </div>
    <div className="grid items-start gap-5 xl:grid-cols-[2fr_1fr]"><ReportChart report={report} /><PeriodComparison report={report} /></div>
    <Panel title="Como o índice é calculado" subtitle="Tempo em boa postura ÷ tempo monitorado × 100.">
      <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">O índice resume a proporção de tempo dentro da faixa de referência. A média do período é ponderada pelo tempo monitorado: dias com mais leituras têm peso proporcional. Pausas e horários sem leituras ficam fora desse cálculo.</p>
    </Panel>
  </div>;
}
