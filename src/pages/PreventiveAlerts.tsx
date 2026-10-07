import { DashboardPage, Legend, MetricCard, Panel } from "../components/dashboard/DashboardWidgets";
import { alertTimeline, postureAchievements, preventiveAlerts } from "../data/dashboard";

export default function PreventiveAlerts() {
  return <DashboardPage title="Alertas preventivos" subtitle="Alertas emitidos pelo sistema e parabenizações por posicionamento correto." detail>
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard title="Alertas emitidos" value={preventiveAlerts.length} description="Correções preventivas no período." progress={35} />
      <MetricCard title="Parabenizações" value={postureAchievements.length} description="Reconhecimentos por postura correta." progress={92} />
      <MetricCard title="Status atual" value="Risco baixo" description="Últimas leituras dentro da faixa." progress={86} />
      <MetricCard title="Último evento" value="16:30" description="Parabenização por alinhamento estável." progress={78} />
    </div>
    <div className="grid gap-5 xl:grid-cols-2">
      <Panel title="Alertas do sistema" subtitle="Eventos que exigiram correção ou pausa preventiva durante o monitoramento."><ul className="space-y-4">{preventiveAlerts.map(item => <li key={item.time} className="flex items-center gap-3 rounded-lg bg-slate-100 p-4 dark:bg-slate-800/60"><span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">!</span><time className="shrink-0 text-xs font-semibold">{item.time}</time><div className="min-w-0"><h3 className="text-sm font-semibold">{item.title}</h3><p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{item.detail}</p></div></li>)}</ul></Panel>
      <Panel title="Posicionamento correto" subtitle="Mensagens positivas emitidas quando a postura permaneceu estável e dentro da faixa ideal."><ul className="space-y-3">{postureAchievements.map(item => <li key={item.time} className="flex items-center gap-3 rounded-lg bg-primary-50/70 px-4 py-3 dark:bg-primary-950/30"><span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-500 text-xs font-semibold text-white">✓</span><time className="shrink-0 text-xs font-medium text-primary-700 dark:text-primary-400">{item.time}</time><div className="min-w-0"><h3 className="text-xs font-semibold">{item.title}</h3><p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{item.detail}</p></div></li>)}</ul></Panel>
    </div>
    <Panel title="Linha do tempo dos eventos" subtitle="Alertas exibidos para entender a evolução do posicionamento ao longo do dia." action={<Legend items={[{ label: "Alerta", className: "bg-slate-600" }, { label: "Boa postura", className: "bg-primary-500" }]} />}>
      <div className="overflow-x-auto pb-2" tabIndex={0} role="region" aria-label="Linha do tempo de alertas e boa postura"><ol className="relative flex min-w-[580px] justify-between gap-3 before:absolute before:inset-x-0 before:top-1.5 before:h-1 before:rounded-full before:bg-slate-200 dark:before:bg-slate-700">{alertTimeline.map(item => <li key={item.time} className="relative flex flex-col items-center gap-3 px-3"><span className={`h-3.5 w-3.5 rounded-full ring-4 ring-white dark:ring-slate-900 ${item.positive ? "bg-primary-500" : "bg-slate-600"}`} aria-hidden="true" /><time className="text-xs text-slate-500 dark:text-slate-400">{item.time}</time><span className="sr-only">{item.positive ? "Boa postura" : "Alerta preventivo"}</span></li>)}</ol></div>
    </Panel>
  </DashboardPage>;
}
