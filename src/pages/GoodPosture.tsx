import { DashboardPage, DailyGoal, MetricCard, Panel } from "../components/dashboard/DashboardWidgets";
import { bestPostureIntervals, dashboardPreview, postureHeatmap } from "../data/dashboard";
import legendLow from "../assets/dashboard/legend-low.svg";

function intervalLabel(hour: number, index: number) {
  const minutes = hour * 60 + index * 10;
  const format = (value: number) => `${Math.floor(value / 60).toString().padStart(2, "0")}:${(value % 60).toString().padStart(2, "0")}`;
  return `${format(minutes)} - ${format(minutes + 10)}`;
}

export default function GoodPosture() {
  return <DashboardPage title="Tempo em boa postura" subtitle="Leitura de postura correta em intervalos de 10 minutos e meta diária." detail>
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard title="Tempo total correto" value={dashboardPreview.goodPostureTime} description="Somatório dos blocos em postura correta." progress={dashboardPreview.goalProgress} />
      <MetricCard title="Melhor bloco de 10min" value="10:20" description="Maior estabilidade postural do dia." progress={96} />
      <MetricCard title="Média por intervalo" value="78%" description="Aderência média nos blocos monitorados." progress={78} />
      <MetricCard title="Falta para a média" value={dashboardPreview.remainingTime} description="Tempo restante para atingir 6h diárias." progress={dashboardPreview.goalProgress} />
    </div>
    <div className="grid min-w-0 gap-5 xl:grid-cols-[2.25fr_1fr]">
      <Panel title="Horários com maior permanência em postura correta" subtitle="Cada bloco representa 10 minutos. Quanto mais forte o verde, maior o percentual de postura correta no intervalo." action={<div className="flex items-center gap-4 text-xs text-slate-500"><span className="flex items-center gap-2"><img src={legendLow} alt="" />Baixo</span><span className="flex items-center gap-2"><span aria-hidden="true" className="h-2.5 w-6 rounded-full bg-primary-500" />Alto</span></div>}>
        <div className="overflow-x-auto pb-2" tabIndex={0} role="region" aria-label="Mapa de postura por intervalos de 10 minutos"><table className="w-full min-w-[640px] border-separate border-spacing-x-1.5 border-spacing-y-5 text-xs"><caption className="sr-only">Percentual de postura correta em cada intervalo de 10 minutos.</caption><thead className="sr-only"><tr><th scope="col">Período</th>{Array.from({ length: 12 }, (_, index) => <th key={index} scope="col">Bloco {index + 1}</th>)}</tr></thead><tbody>{postureHeatmap.map(row => <tr key={row.period}><th scope="row" className="w-28 whitespace-nowrap pr-3 text-left font-medium">{row.period}</th>{row.values.map((value, index) => <td key={index} className={`h-8 min-w-9 rounded-md text-center text-[10px] font-semibold ${value >= 88 ? "bg-primary-500 text-white" : value >= 78 ? "bg-primary-400/80 text-primary-950" : value >= 68 ? "bg-primary-100 text-primary-800" : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-200"}`} title={`${intervalLabel(row.hour, index)}: ${value}% de postura correta`}>{value}%</td>)}</tr>)}</tbody><tfoot><tr><td /><td colSpan={12}><div className="grid grid-cols-12 text-center text-[10px] text-slate-400">{Array.from({ length: 12 }, (_, index) => <span key={index}>{((index % 6) * 10).toString().padStart(2, "0")}</span>)}</div></td></tr></tfoot></table></div>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Leitura dividida de 10 em 10 minutos para identificar blocos de melhor estabilidade postural.</p>
      </Panel>
      <Panel title="Melhores horários do dia" subtitle="Intervalos de 10 minutos com maior percentual de postura correta."><ol className="space-y-3">{bestPostureIntervals.map((item, index) => <li key={item.period} className="flex items-center gap-3 rounded-lg bg-primary-50/70 px-3 py-3 dark:bg-primary-950/30"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-500 text-xs font-semibold text-white">{index + 1}</span><div className="min-w-0 flex-1"><p className="text-xs font-semibold">{item.period}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.description}</p></div><span className="text-sm font-semibold text-primary-700 dark:text-primary-400">{item.percent}%</span></li>)}</ol></Panel>
    </div>
    <DailyGoal compact />
  </DashboardPage>;
}
