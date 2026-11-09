import { useId } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Panel, ProgressBar } from "../dashboard/DashboardWidgets";
import { formatDate, formatDuration, formatPercent, formatScore, hasDayData, summarize, type PostureReport } from "../../data/reports";

export function Comparison({ change, unit = "p.p.", lowerIsBetter = false }: { change: number | null; unit?: string; lowerIsBetter?: boolean }) {
  if (change === null || !Number.isFinite(change)) return <span className="text-xs text-slate-500 dark:text-slate-400">Sem base anterior para comparar</span>;
  const rounded = Math.round(change * 10) / 10;
  const positive = lowerIsBetter ? rounded < 0 : rounded > 0;
  const Icon = rounded > 0 ? ArrowUpRight : rounded < 0 ? ArrowDownRight : Minus;
  return <span className={`inline-flex items-center gap-1 text-xs font-medium ${rounded === 0 ? "text-slate-500 dark:text-slate-400" : positive ? "text-primary-700 dark:text-primary-400" : "text-amber-700 dark:text-amber-400"}`}>
    <Icon size={14} aria-hidden="true" />
    {rounded === 0 ? "Sem alteração" : `${rounded > 0 ? "+" : ""}${rounded.toLocaleString("pt-BR")} ${unit}`}
    <span className="font-normal text-slate-500 dark:text-slate-400">vs. anterior</span>
  </span>;
}

export function scoreChange(report: PostureReport): number | null {
  return report.summary.averageScore === null || report.previous.averageScore === null
    ? null : report.summary.averageScore - report.previous.averageScore;
}

export function ReportChart({ report, metric = "score" }: { report: Pick<PostureReport, "points" | "period" | "start" | "end">; metric?: "posture" | "score" }) {
  const id = useId();
  const { points } = report;
  const chartWidth = 800;
  const chartHeight = 220;
  const plotWidth = chartWidth - 56;
  const step = plotWidth / Math.max(1, points.length);
  const labelEvery = points.length > 16 ? 5 : points.length > 10 ? 3 : 1;
  const score = metric === "score";
  const valueLabel = (value: number) => score ? `${value.toFixed(1)}/100` : formatPercent(value);
  return <Panel title={score ? report.period === "day" ? "Score registrado por horário" : "Score postural no período" : "Resumos adequados no período"}
    subtitle={score ? "Média do score salvo, ponderada pelas amostras. Horários sem leituras ficam sem pontuação." : "Proporção de resumos válidos com classificação predominante adequada."}
    action={<span className="inline-flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400"><span className="size-2 rounded-full bg-primary-500" />{score ? "Score salvo" : "Resumos adequados"}</span>}>
    <svg viewBox={`0 0 ${chartWidth} ${chartHeight + 35}`} className="block w-full min-w-0" role="img" aria-labelledby={id}>
      <title id={id}>{score ? "Score salvo" : "Percentual de resumos adequados"} de {formatDate(report.start)} a {formatDate(report.end)}. Valores disponíveis na tabela do gráfico.</title>
      {[0, 25, 50, 75, 100].map(value => <g key={value}>
        <line x1={40} x2={chartWidth - 8} y1={chartHeight - value * 2} y2={chartHeight - value * 2} stroke="currentColor" className="text-slate-100 dark:text-slate-800" strokeDasharray="4 4" />
        <text x={28} y={chartHeight - value * 2 + 4} textAnchor="end" fontSize={10} fill="currentColor" className="text-slate-400">{value}{score ? "" : "%"}</text>
      </g>)}
      {points.map((point, index) => {
        const x = 44 + index * step;
        const width = Math.min(38, step * 0.6);
        return <g key={point.label}>
          {point.value === null
            ? <circle cx={x + step / 2} cy={chartHeight} r={2} fill="currentColor" className="text-slate-300 dark:text-slate-600"><title>{point.label}: sem leituras</title></circle>
            : <rect x={x + (step - width) / 2} y={chartHeight - point.value * 2} width={width} height={point.value * 2} rx={4} fill="currentColor" className="text-primary-500"><title>{point.label}: {valueLabel(point.value)}{score ? " de score" : " de resumos adequados"}</title></rect>}
          {(index % labelEvery === 0 || index === points.length - 1) && <text x={x + step / 2} y={chartHeight + 23} textAnchor="middle" fontSize={10} fill="currentColor" className="text-slate-500 dark:text-slate-400">{point.label}</text>}
        </g>;
      })}
    </svg>
    <details className="mt-3 text-xs text-slate-500 dark:text-slate-400">
      <summary className="w-fit cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-primary-500">Ver valores do gráfico</summary>
      <div className="mt-3 max-h-48 overflow-auto"><table className="w-full text-left"><caption className="sr-only">Valores do gráfico de evolução postural</caption><thead><tr><th scope="col" className="p-2">{report.period === "day" ? "Horário" : "Data"}</th><th scope="col" className="p-2">{score ? "Score salvo" : "Resumos adequados"}</th></tr></thead><tbody>{points.map(point => <tr key={point.label} className="border-t border-slate-100 dark:border-slate-800"><th scope="row" className="p-2 font-normal">{point.label}</th><td className="p-2">{point.value === null ? "Sem leituras" : valueLabel(point.value)}</td></tr>)}</tbody></table></div>
    </details>
  </Panel>;
}

export function PeriodComparison({ report }: { report: PostureReport }) {
  const change = scoreChange(report);
  return <Panel title="Comparação entre períodos" subtitle={`Referência: ${formatDate(report.previousStart)} a ${formatDate(report.previousEnd)}.`}>
    <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">Variação do score postural médio</p>
    <Comparison change={change} unit="pontos" />
    <dl className="mt-5 space-y-4 text-sm">
      <div className="flex justify-between gap-3"><dt className="text-slate-500 dark:text-slate-400">Score anterior</dt><dd className="font-semibold">{formatScore(report.previous.averageScore)}</dd></div>
      <div className="flex justify-between gap-3"><dt className="text-slate-500 dark:text-slate-400">Score selecionado</dt><dd className="font-semibold text-primary-700 dark:text-primary-400">{formatScore(report.summary.averageScore)}</dd></div>
      <div className="flex justify-between gap-3 border-t border-slate-100 pt-4 dark:border-slate-800"><dt className="text-slate-500 dark:text-slate-400">Alertas: anterior / atual</dt><dd className="font-semibold">{report.previous.hasData ? report.previous.alerts : "—"} / {report.summary.alerts}</dd></div>
    </dl>
    <p className="mt-5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{report.partial ? "A comparação acompanha os dias decorridos e o horário local atual no período anterior. " : ""}Somente resumos com amostras válidas entram na média do score.</p>
  </Panel>;
}

export function ReportCoverage({ report }: { report: PostureReport }) {
  const summary = report.summary;
  const total = summary.validSummaries + summary.absentSummaries + summary.unavailableSummaries;
  return <Panel title="Cobertura das leituras" subtitle={`${total} resumos posturais salvos no período.`}>
    <dl className="space-y-4 text-sm">{[
      ["Com amostras válidas", summary.validSummaries],
      ["Ausência detectada", summary.absentSummaries],
      ["Sem medição disponível", summary.unavailableSummaries],
      ["Amostras usadas no score", summary.samplesCount.toLocaleString("pt-BR")],
    ].map(([label, value]) => <div key={label} className="flex justify-between gap-3"><dt className="text-slate-500 dark:text-slate-400">{label}</dt><dd className="font-semibold">{value}</dd></div>)}</dl>
    <div className="mt-5"><ProgressBar value={total ? summary.validSummaries / total * 100 : 0} label="Proporção de resumos com amostras válidas" /></div>
    <p className="mt-4 text-xs leading-relaxed text-slate-500 dark:text-slate-400">Ausência e medição indisponível ficam fora do score e da proporção de resumos adequados.</p>
  </Panel>;
}

export function ReportHistory({ report }: { report: PostureReport }) {
  return <Panel title="Histórico diário" subtitle="Duração gravada de sessões encerradas e resumos registrados em cada dia local.">
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Histórico diário do monitoramento">
      <table className="w-full min-w-[640px] text-left text-sm">
        <caption className="sr-only">Resumo diário dos dados salvos</caption>
        <thead className="text-xs text-slate-500 dark:text-slate-400"><tr>{["Data", "Tempo de sessão", "Score", "Resumos adequados", "Alertas", "Teclas"].map(label => <th key={label} scope="col" className="px-3 pb-3 font-medium first:pl-0">{label}</th>)}</tr></thead>
        <tbody>{[...report.days].reverse().map(day => {
          const summary = summarize([day]);
          const recorded = hasDayData(day);
          return <tr key={day.date} className="border-t border-slate-100 dark:border-slate-800">
            <th scope="row" className="py-4 pr-3 font-medium">{formatDate(day.date, { day: "2-digit", month: "2-digit", weekday: "short" })}</th>
            <td className="p-3">{recorded ? formatDuration(summary.sessionSeconds) : "—"}</td>
            <td className="p-3 font-semibold text-primary-700 dark:text-primary-400">{formatScore(summary.averageScore)}</td>
            <td className="p-3">{formatPercent(summary.adequateSummaryPercentage)}</td>
            <td className="p-3">{recorded ? summary.alerts : "—"}</td>
            <td className="p-3">{summary.typing.summaries ? summary.typing.keystrokes.toLocaleString("pt-BR") : "—"}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    <p className="mt-4 text-xs leading-relaxed text-slate-500 dark:text-slate-400">Sessões que cruzam a meia-noite têm sua duração distribuída proporcionalmente entre os dias. Sessões em andamento ainda não entram no total de duração.</p>
  </Panel>;
}
