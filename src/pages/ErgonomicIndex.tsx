import { DashboardPage, DailyGoal, Legend, MetricCard, Panel } from "../components/dashboard/DashboardWidgets";
import { dashboardPreview, posturePeriods, postureSegments, preventiveAlerts } from "../data/dashboard";

export default function ErgonomicIndex() {
  return <DashboardPage title="Índice ergonômico" subtitle="Momentos dentro e fora da faixa ideal, com progresso até a média diária." detail>
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard title="Índice atual" value={`${dashboardPreview.ergonomicIndex}%`} description="Média do período monitorado hoje." progress={82} />
      <MetricCard title="Dentro da faixa ideal" value="4h48" description="Postura mantida com alinhamento adequado." progress={80} />
      <MetricCard title="Fora da faixa" value="1h12" description="Momentos com correção recomendada." progress={20} danger />
      <MetricCard title="Falta para a média" value={dashboardPreview.remainingTime} description="Tempo restante para bater 6h diárias." progress={dashboardPreview.goalProgress} />
    </div>
    <Panel title="Momentos dentro e fora da faixa ideal" subtitle="A linha mostra quando a postura permaneceu dentro da faixa ideal e quando saiu do intervalo recomendado." action={<Legend items={[{ label: "Faixa ideal", className: "bg-primary-500" }, { label: "Fora da faixa", className: "bg-red-500" }]} />}>
      <div className="flex h-8 gap-0.5 overflow-hidden rounded-lg" role="img" aria-label="Linha do período, alternando momentos dentro e fora da faixa ideal entre 08h e 18h">{postureSegments.map((minutes, index) => <div key={index} className={`rounded-md ${index % 2 === 0 ? "bg-primary-500" : "bg-red-500"}`} style={{ flex: minutes }} title={`${minutes} min ${index % 2 === 0 ? "na faixa ideal" : "fora da faixa"}`} />)}</div>
      <div className="mt-3 mb-5 flex justify-between text-xs text-slate-400">{["08h", "10h", "12h", "14h", "16h", "18h"].map(time => <span key={time} className="border-t border-slate-200 pt-2 dark:border-slate-700">{time}</span>)}</div>
      <ul className="space-y-2">{posturePeriods.map(item => <li key={item.period} className={`grid items-center gap-2 rounded-lg px-4 py-3 text-xs md:grid-cols-[145px_130px_1fr] ${item.ideal ? "bg-primary-50/60 dark:bg-primary-950/20" : "bg-slate-100 dark:bg-slate-800/60"}`}><span className="font-semibold">{item.period}</span><span className={`inline-flex items-center gap-2 font-medium ${item.ideal ? "text-primary-700 dark:text-primary-400" : "text-red-600 dark:text-red-400"}`}><span aria-hidden="true" className={`h-2 w-2 rounded-full ${item.ideal ? "bg-primary-500" : "bg-red-500"}`} />{item.ideal ? "Faixa ideal" : "Fora da faixa"}</span><span className="text-slate-500 dark:text-slate-400">{item.description}</span></li>)}</ul>
    </Panel>
    <div className="grid gap-5 xl:grid-cols-2"><DailyGoal /><Panel title="Principais pontos de atenção"><ul className="space-y-3">{preventiveAlerts.map(item => <li key={item.time} className="grid gap-2 rounded-lg bg-slate-100 px-4 py-3 text-xs dark:bg-slate-800/60 2xl:grid-cols-[50px_1fr_1fr]"><time className="font-semibold">{item.time}</time><span className="font-semibold">{item.title}</span><span className="text-slate-500 dark:text-slate-400">{item.attention}</span></li>)}</ul></Panel></div>
  </DashboardPage>;
}
