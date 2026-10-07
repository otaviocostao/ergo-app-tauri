import { DashboardPage, MetricCard, panelClass, subtitleClass, titleClass } from "../components/dashboard/DashboardWidgets";
import { dashboardPreview, preventiveAlerts } from "../data/dashboard";
import postureEvolution from "../assets/dashboard/posture-evolution.svg";

export default function Dashboard() {
  return <DashboardPage title="Início" subtitle="Visão geral do seu bem-estar ergonômico hoje.">
    <div className="grid grid-cols-1 gap-5 @min-[800px]:grid-cols-3 xl:gap-4">
      <MetricCard title="Índice ergonômico" value={`${dashboardPreview.ergonomicIndex}%`} description="Postura dentro da faixa ideal no período." badge="+12%" progress={75} to="/dashboard/indice-ergonomico" />
      <MetricCard title="Tempo em boa postura" value={dashboardPreview.goodPostureTime} description="Meta diária: 6h de alinhamento ativo." badge="+38min" progress={dashboardPreview.goalProgress} to="/dashboard/boa-postura" />
      <MetricCard title="Alertas preventivos" value={preventiveAlerts.length} description="Correções recomendadas desde 08h." badge="Baixo" to="/dashboard/alertas-preventivos" />
    </div>
    <section className={`${panelClass} grid min-w-0 gap-7 p-5 xl:grid-cols-[2fr_1fr] xl:p-7`} aria-label="Evolução postural de hoje">
      <div className="min-w-0"><div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h2 className={titleClass}>Evolução postural de hoje</h2><p className={subtitleClass}>Leituras consolidadas por período com alertas preventivos em tempo real.</p></div><span className="rounded-full bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-700 dark:bg-primary-950/60 dark:text-primary-400">Risco baixo</span></div>
        <figure aria-label="Prévia da evolução do índice postural entre 08h e 18h"><img src={postureEvolution} alt="Gráfico de evolução postural com oscilações e melhora ao fim do dia." className="block max-w-full" /><figcaption className="mt-2 flex justify-between text-xs text-slate-400">{["08h", "10h", "12h", "14h", "16h", "18h"].map(time => <span key={time}>{time}</span>)}</figcaption></figure>
      </div>
      <div className="min-w-0 border-t border-slate-100 pt-6 dark:border-slate-800 xl:border-t-0 xl:border-l xl:pt-0 xl:pl-7"><h2 className="text-base font-semibold">Resumo do monitoramento</h2><p className={`${subtitleClass} text-xs!`}>Dados úteis para priorizar ajustes durante o uso.</p><dl className="mt-5 space-y-3">{[
        ["Tempo sentado", "6h40", "2h seguidas sem pausa"],
        ["Pausas feitas", "4/6", "Próxima pausa em 18 min"],
        ["Última leitura", "2 min", "Sensor sincronizado"],
      ].map(([label, value, detail]) => <div key={label} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 text-xs dark:border-slate-800 dark:bg-slate-800/40"><dt className="text-slate-500 dark:text-slate-400">{label}</dt><dd className="font-semibold">{value}</dd><dd className="text-primary-700 dark:text-primary-400">{detail}</dd></div>)}</dl></div>
    </section>
  </DashboardPage>;
}
