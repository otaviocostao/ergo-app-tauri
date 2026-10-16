import { useId } from "react";
import { ArrowDownRight, ArrowUpRight, Minus, Target } from "lucide-react";
import { Panel, ProgressBar } from "../dashboard/DashboardWidgets";
import { dailyGoalMinutes, formatDate, formatMinutes, formatPercent, summarize, type PostureReport } from "../../data/reports";

export function Comparison({ change, unit = "p.p.", lowerIsBetter = false }: { change: number | null; unit?: string; lowerIsBetter?: boolean }) {
  if (change === null) return <span className="text-xs text-slate-500 dark:text-slate-400">Sem base anterior para comparar</span>;
  const rounded = Math.round(change * 10) / 10;
  const positive = lowerIsBetter ? rounded < 0 : rounded > 0;
  const Icon = rounded > 0 ? ArrowUpRight : rounded < 0 ? ArrowDownRight : Minus;
  return <span className={`inline-flex items-center gap-1 text-xs font-medium ${rounded === 0 ? "text-slate-500 dark:text-slate-400" : positive ? "text-primary-700 dark:text-primary-400" : "text-amber-700 dark:text-amber-400"}`}>
    <Icon size={14} aria-hidden="true" />
    {rounded === 0 ? "Sem alteração" : `${rounded > 0 ? "+" : ""}${rounded.toLocaleString("pt-BR")} ${unit}`}
    <span className="font-normal text-slate-500 dark:text-slate-400">vs. anterior</span>
  </span>;
}

export function postureChange(report: PostureReport): number | null {
  return report.summary.posturePercent === null || report.previous.posturePercent === null
    ? null : report.summary.posturePercent - report.previous.posturePercent;
}

export function ReportChart({ report }: { report: PostureReport }) {
  const id = useId();
  const { points } = report;
  const chartWidth = 800;
  const chartHeight = 220;
  const plotWidth = chartWidth - 56;
  const step = plotWidth / points.length;
  const labelEvery = points.length > 16 ? 5 : points.length > 10 ? 3 : 1;
  return <Panel title={report.period === "day" ? "Sua postura ao longo do dia" : "Evolução da postura no período"}
    subtitle="Percentual do tempo monitorado em boa postura. Períodos sem leituras ficam sem pontuação."
    action={<span className="inline-flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400"><span className="size-2 rounded-full bg-primary-500" />Boa postura</span>}>
    <svg viewBox={`0 0 ${chartWidth} ${chartHeight + 35}`} className="block w-full min-w-0" role="img" aria-labelledby={id}>
      <title id={id}>Percentual de boa postura de {formatDate(report.start)} a {formatDate(report.end)}. Valores disponíveis na tabela do gráfico.</title>
      {[0, 25, 50, 75, 100].map(value => <g key={value}>
        <line x1={40} x2={chartWidth - 8} y1={chartHeight - value * 2} y2={chartHeight - value * 2} stroke="currentColor" className="text-slate-100 dark:text-slate-800" strokeDasharray="4 4" />
        <text x={28} y={chartHeight - value * 2 + 4} textAnchor="end" fontSize={10} fill="currentColor" className="text-slate-400">{value}%</text>
      </g>)}
      {points.map((point, index) => {
        const x = 44 + index * step;
        const width = Math.min(38, step * 0.6);
        return <g key={point.label}>
          {point.value === null
            ? <circle cx={x + step / 2} cy={chartHeight} r={2} fill="currentColor" className="text-slate-300 dark:text-slate-600"><title>{point.label}: sem leituras</title></circle>
            : <rect x={x + (step - width) / 2} y={chartHeight - point.value * 2} width={width} height={point.value * 2} rx={4} fill="currentColor" className="text-primary-500"><title>{point.label}: {formatPercent(point.value)} em boa postura</title></rect>}
          {(index % labelEvery === 0 || index === points.length - 1) && <text x={x + step / 2} y={chartHeight + 23} textAnchor="middle" fontSize={10} fill="currentColor" className="text-slate-500 dark:text-slate-400">{point.label}</text>}
        </g>;
      })}
    </svg>
    <details className="mt-3 text-xs text-slate-500 dark:text-slate-400">
      <summary className="w-fit cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-primary-500">Ver valores do gráfico</summary>
      <div className="mt-3 max-h-48 overflow-auto"><table className="w-full text-left"><caption className="sr-only">Valores do gráfico de evolução postural</caption><thead><tr><th scope="col" className="p-2">{report.period === "day" ? "Horário" : "Data"}</th><th scope="col" className="p-2">Boa postura</th></tr></thead><tbody>{points.map(point => <tr key={point.label} className="border-t border-slate-100 dark:border-slate-800"><th scope="row" className="p-2 font-normal">{point.label}</th><td className="p-2">{point.value === null ? "Sem leituras" : formatPercent(point.value)}</td></tr>)}</tbody></table></div>
    </details>
  </Panel>;
}

export function PeriodComparison({ report }: { report: PostureReport }) {
  const change = postureChange(report);
  const rounded = change === null ? null : Math.round(change * 10) / 10;
  const alertChange = report.summary.alertsPerHour === null || report.previous.alertsPerHour === null ? null : report.summary.alertsPerHour - report.previous.alertsPerHour;
  return <Panel title="O quanto você evoluiu" subtitle={`Comparação com ${formatDate(report.previousStart)}${report.previousStart !== report.previousEnd ? ` a ${formatDate(report.previousEnd, { day: "2-digit", month: "short", year: "numeric" })}` : ""}.`}>
    <div className="flex items-center gap-3">
      <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${rounded !== null && rounded < 0 ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400" : "bg-primary-50 text-primary-700 dark:bg-primary-950/40 dark:text-primary-400"}`}>
        {rounded === null || rounded === 0 ? <Minus size={23} /> : rounded > 0 ? <ArrowUpRight size={23} /> : <ArrowDownRight size={23} />}
      </span>
      <div><p className="text-3xl font-semibold tracking-tight">{rounded === null ? "—" : `${rounded > 0 ? "+" : ""}${rounded.toLocaleString("pt-BR")} p.p.`}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{rounded === null ? "Ainda sem base de comparação" : rounded > 0 ? "Mais tempo proporcional em boa postura" : rounded < 0 ? "Menos tempo proporcional em boa postura" : "Proporção de boa postura mantida"}</p></div>
    </div>
    <dl className="mt-6 space-y-4 text-sm">
      <div className="flex justify-between gap-3"><dt className="text-slate-500 dark:text-slate-400">Período anterior</dt><dd className="font-semibold">{formatPercent(report.previous.posturePercent)}</dd></div>
      <div className="flex justify-between gap-3"><dt className="text-slate-500 dark:text-slate-400">Período selecionado</dt><dd className="font-semibold text-primary-700 dark:text-primary-400">{formatPercent(report.summary.posturePercent)}</dd></div>
      <div className="border-t border-slate-100 pt-4 dark:border-slate-800"><dt className="mb-1 text-xs text-slate-500 dark:text-slate-400">Frequência de alertas</dt><dd><Comparison change={alertChange} unit="/h" lowerIsBetter /></dd></div>
    </dl>
    <p className="mt-5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{report.partial ? "Período em andamento: a comparação usa a mesma quantidade de dias decorridos no período anterior. " : ""}As proporções consideram apenas o tempo com leituras; dias sem monitoramento não contam como postura ruim.</p>
  </Panel>;
}

export function GoalProgress({ report }: { report: PostureReport }) {
  const average = report.summary.days ? report.summary.goodMinutes / report.summary.days : 0;
  const progress = average / dailyGoalMinutes * 100;
  return <Panel title="Sua meta de boa postura" subtitle={`Meta demonstrativa: ${formatMinutes(dailyGoalMinutes)} por dia monitorado.`} action={<Target className="text-primary-600 dark:text-primary-400" size={21} aria-hidden="true" />}>
    <p className="text-3xl font-semibold tracking-tight">{formatMinutes(average)} <span className="text-sm font-normal text-slate-500 dark:text-slate-400">/ {formatMinutes(dailyGoalMinutes)}{report.period !== "day" ? " por dia" : ""}</span></p>
    <div className="mt-5"><ProgressBar value={progress} label="Progresso médio da meta de boa postura" large /></div>
    <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs"><span className="font-semibold text-primary-700 dark:text-primary-400">{Math.round(Math.min(100, progress))}% da meta</span><span className="text-slate-500 dark:text-slate-400">{report.summary.goalDays} de {report.summary.days} {report.summary.days === 1 ? "dia com meta atingida" : "dias com meta atingida"}</span></div>
    <p className="mt-5 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{average >= dailyGoalMinutes ? "A média de boa postura atingiu a meta neste período." : `Faltam ${formatMinutes(dailyGoalMinutes - average)} ${report.period === "day" ? "para a meta do dia" : "na média por dia monitorado para alcançar a meta"}.`}</p>
  </Panel>;
}

export function ReportHistory({ report }: { report: PostureReport }) {
  return <Panel title="Histórico diário" subtitle="Confira o tempo registrado, a qualidade da postura e as pausas de cada dia.">
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Histórico diário de postura">
      <table className="w-full min-w-[620px] text-left text-sm">
        <caption className="sr-only">Resumo por dia do período selecionado</caption>
        <thead className="text-xs text-slate-500 dark:text-slate-400"><tr>{["Data", "Monitorado", "Boa postura", "Índice", "Alertas", "Pausas", "Meta de 6h"].map(label => <th key={label} scope="col" className="px-3 pb-3 font-medium first:pl-0 last:pr-0">{label}</th>)}</tr></thead>
        <tbody>{[...report.days].reverse().map(day => {
          const summary = summarize([day]);
          return <tr key={day.date} className="border-t border-slate-100 dark:border-slate-800"><th scope="row" className="py-4 pr-3 font-medium">{formatDate(day.date, { day: "2-digit", month: "2-digit", weekday: "short" })}</th><td className="p-3">{formatMinutes(summary.monitoredMinutes)}</td><td className="p-3">{formatMinutes(summary.goodMinutes)}</td><td className="p-3 font-semibold text-primary-700 dark:text-primary-400">{formatPercent(summary.posturePercent)}</td><td className="p-3">{summary.alerts}</td><td className="p-3">{summary.breaks}</td><td className="py-3 pl-3"><span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs ${summary.goalDays ? "bg-primary-50 text-primary-700 dark:bg-primary-950/40 dark:text-primary-400" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"}`}>{summary.goalDays ? "Atingida" : "Não atingida"}</span></td></tr>;
        })}</tbody>
      </table>
    </div>
  </Panel>;
}
