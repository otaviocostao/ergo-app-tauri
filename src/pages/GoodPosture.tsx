import { ReportCoverage } from "../components/reports/ReportWidgets";
import { MetricCard, Panel } from "../components/dashboard/DashboardWidgets";
import { formatPercent, formatScore, formatTime, type PostureReport } from "../data/reports";

const measured = (value: number | null, unit: string) => value === null ? "—" : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}${unit}`;

export default function GoodPosture({ report }: { report: PostureReport }) {
  const { summary } = report;
  const observedHours = report.hours.filter(hour => hour.summaries > 0);
  const bestHours = report.hours.filter(hour => hour.averageScore !== null).sort((a, b) => b.averageScore! - a.averageScore!).slice(0, 3);
  const cards = [
    ["Desvio médio do pescoço", measured(summary.averageNeckDeviation, "°"), "Média dos desvios de referência salvos nos resumos."],
    ["Maior desvio do pescoço", measured(summary.maximumNeckDeviation, "°"), "Maior desvio registrado no período."],
    ["Alinhamento médio dos ombros", measured(summary.averageShoulderBalance, "/100"), "Média do indicador de alinhamento salvo nos resumos."],
    ["Menor alinhamento dos ombros", measured(summary.minimumShoulderBalance, "/100"), "Menor indicador de alinhamento registrado."],
    ["Distância média da tela", measured(summary.averageDistanceCm, " cm"), "Média das distâncias disponíveis nos resumos."],
    ["Piscadas registradas", summary.blinkCount > 0 || summary.averageDistanceCm !== null ? summary.blinkCount.toLocaleString("pt-BR") : "—", "Total de piscadas salvas nos resumos válidos."],
  ];
  return <div className="flex flex-col gap-5">
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{cards.map(([title, value, description]) => <MetricCard key={title} title={title} value={value} description={description} />)}</div>
    <div className="grid items-start gap-5 xl:grid-cols-[2fr_1fr]">
      <Panel title="Mapa de resumos adequados por horário" subtitle="Cada célula reúne os resumos salvos naquela faixa de 10 minutos, nos dias selecionados.">
        {observedHours.length === 0 ? <p className="py-8 text-sm text-slate-500 dark:text-slate-400">Nenhum resumo postural registrado neste período.</p> : <div className="max-h-[560px] overflow-auto pb-2" tabIndex={0} role="region" aria-label="Mapa de resumos posturais em intervalos de 10 minutos">
          <table className="w-full min-w-[480px] border-separate border-spacing-1.5 text-xs">
            <caption className="sr-only">Percentual de resumos válidos com classificação predominante adequada</caption>
            <thead><tr><th scope="col" className="text-left font-medium text-slate-500">Hora</th>{[0, 10, 20, 30, 40, 50].map(minute => <th scope="col" key={minute} className="pb-2 font-medium text-slate-500 dark:text-slate-400">:{String(minute).padStart(2, "0")}</th>)}</tr></thead>
            <tbody>{observedHours.map(({ hour, cells }) => <tr key={hour}><th scope="row" className="pr-3 text-left font-medium">{hour}h</th>{cells.map(({ minute, percent, summaries }) => <td key={minute} title={`${formatTime(hour * 60 + minute)} – ${formatTime(hour * 60 + minute + 10)}: ${percent === null ? "sem leituras válidas" : `${formatPercent(percent)} de resumos adequados`} (${summaries} resumos salvos)`} className={`h-10 rounded-md text-center font-semibold ${percent === null ? "bg-slate-50 text-slate-400 dark:bg-slate-800/40" : percent >= 90 ? "bg-primary-600 text-white" : percent >= 80 ? "bg-primary-400 text-primary-950" : percent >= 70 ? "bg-primary-100 text-primary-800" : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-200"}`}>{formatPercent(percent)}</td>)}</tr>)}</tbody>
          </table>
        </div>}
        <p className="mt-4 text-xs leading-relaxed text-slate-500 dark:text-slate-400">As faixas usam o horário local do registro. As médias de pescoço, ombros e distância consideram somente os resumos que têm a respectiva medida disponível.</p>
      </Panel>
      <div className="flex flex-col gap-5">
        <Panel title="Horários com maior score" subtitle="Média dos scores registrados, ponderada pelas amostras.">
          {bestHours.length === 0 ? <p className="text-sm text-slate-500 dark:text-slate-400">Ainda sem leituras válidas para comparar horários.</p> : <ol className="space-y-3">{bestHours.map((hour, index) => <li key={hour.hour} className="flex items-center gap-3 rounded-lg bg-primary-50/70 p-3 dark:bg-primary-950/30"><span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-500 text-xs font-semibold text-white">{index + 1}</span><span className="flex-1 text-sm font-medium">{hour.hour}h – {hour.hour + 1}h</span><span className="text-sm font-semibold text-primary-700 dark:text-primary-400">{formatScore(hour.averageScore)}</span></li>)}</ol>}
        </Panel>
        <ReportCoverage report={report} />
      </div>
    </div>
  </div>;
}
