import { AlertTriangle } from "lucide-react";
import { MetricCard, Panel, ProgressBar } from "../components/dashboard/DashboardWidgets";
import { formatDuration, storedTime, type PostureReport } from "../data/reports";

const alertLabels: Record<string, string> = {
  neck_posture: "Desvio do pescoço",
  shoulder_alignment: "Desalinhamento dos ombros",
  screen_distance: "Distância da tela",
  low_blink_rate: "Frequência de piscadas",
};

export default function PreventiveAlerts({ report }: { report: PostureReport }) {
  const { summary } = report;
  const alerts = report.days.flatMap(day => day.alerts).sort((a, b) => storedTime(b.timestamp) - storedTime(a.timestamp));
  const groups = [...Object.entries(alertLabels), ["other", "Outros alertas"]].map(([kind, label]) => ({
    kind, label, count: alerts.filter(alert => kind === "other" ? !alertLabels[alert.alertType] : alert.alertType === kind).length,
  })).filter(group => group.kind !== "other" || group.count > 0).sort((a, b) => b.count - a.count);
  return <div className="flex flex-col gap-5">
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <MetricCard title="Alertas registrados" value={summary.alerts} description="Episódios iniciados no período selecionado." />
      <MetricCard title="Alertas graves" value={summary.criticalAlerts} description="Episódios classificados com gravidade alta pelo monitoramento." danger />
      <MetricCard title="Episódios encerrados" value={alerts.filter(alert => alert.resolvedAt).length} description="Alertas do período com encerramento salvo." />
    </div>
    <div className="grid items-start gap-5 xl:grid-cols-[1fr_2fr]">
      <Panel title="Pontos de atenção" subtitle="Distribuição dos tipos de alerta efetivamente registrados.">
        <ul className="space-y-6">{groups.map(group => <li key={group.kind}><div className="mb-2 flex items-center justify-between gap-3 text-sm"><span>{group.label}</span><span className="font-semibold">{group.count}</span></div><ProgressBar label={group.label} value={summary.alerts ? group.count / summary.alerts * 100 : 0} /></li>)}</ul>
      </Panel>
      <Panel title="Registro de alertas" subtitle={`${alerts.length} ocorrência(s), da mais recente à mais antiga.`}>
        {alerts.length === 0 ? <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">Nenhum alerta registrado neste período.</p> : <ul className="max-h-[520px] space-y-3 overflow-y-auto pr-1">{alerts.map(alert => {
          const time = new Date(storedTime(alert.timestamp));
          return <li key={alert.id} className="flex items-start gap-3 rounded-lg bg-slate-50 p-4 dark:bg-slate-800/50">
            <span className={`mt-0.5 rounded-lg p-2 ${alert.severity.toLowerCase() === "danger" ? "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400" : "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400"}`}><AlertTriangle size={16} aria-hidden="true" /></span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap justify-between gap-2"><h3 className="text-sm font-semibold">{alertLabels[alert.alertType] ?? "Alerta registrado"}</h3><time dateTime={time.toISOString()} className="text-xs text-slate-500 dark:text-slate-400">{time.toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</time></div>
              <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{alert.message}</p>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Duração registrada do episódio: {formatDuration(alert.durationSeconds)} · {alert.resolvedAt ? "Encerrado" : "Sem encerramento registrado"}</p>
            </div>
          </li>;
        })}</ul>}
      </Panel>
    </div>
  </div>;
}
