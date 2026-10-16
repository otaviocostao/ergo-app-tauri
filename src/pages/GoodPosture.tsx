import { GoalProgress } from "../components/reports/ReportWidgets";
import { Panel } from "../components/dashboard/DashboardWidgets";
import { formatPercent, formatTime, type PostureReport } from "../data/reports";

export default function GoodPosture({ report }: { report: PostureReport }) {
  const bestHours = report.hours.filter(hour => hour.percent !== null).sort((a, b) => b.percent! - a.percent!).slice(0, 3);
  return <div className="flex flex-col gap-5">
    <div className="grid items-start gap-5 xl:grid-cols-[2fr_1fr]">
      <Panel title="Mapa de postura por horário" subtitle="Cada célula resume 10 minutos. Em semanas e meses, ela reúne as leituras do mesmo horário nos dias monitorados.">
        <div className="overflow-x-auto pb-2" tabIndex={0} role="region" aria-label="Mapa de boa postura em intervalos de 10 minutos">
          <table className="w-full min-w-[480px] border-separate border-spacing-1.5 text-xs">
            <caption className="sr-only">Percentual do tempo em boa postura por hora e intervalo de 10 minutos</caption>
            <thead><tr><th scope="col" className="text-left font-medium text-slate-500">Hora</th>{[0, 10, 20, 30, 40, 50].map(minute => <th scope="col" key={minute} className="pb-2 font-medium text-slate-500 dark:text-slate-400">:{String(minute).padStart(2, "0")}</th>)}</tr></thead>
            <tbody>{report.hours.map(({ hour }) => <tr key={hour}><th scope="row" className="pr-3 text-left font-medium">{hour}h</th>{[0, 10, 20, 30, 40, 50].map(minute => {
              const intervals = report.days.flatMap(day => day.intervals).filter(interval => interval.minute === hour * 60 + minute);
              const monitored = intervals.reduce((sum, interval) => sum + interval.monitoredMinutes, 0);
              const good = intervals.reduce((sum, interval) => sum + interval.goodMinutes, 0);
              const percent = monitored ? Math.round(good / monitored * 100) : null;
              return <td key={minute} title={`${formatTime(hour * 60 + minute)} – ${formatTime(hour * 60 + minute + 10)}: ${percent === null ? "sem leituras" : `${formatPercent(percent)} em boa postura`}`} className={`h-10 rounded-md text-center font-semibold ${percent === null ? "bg-slate-50 text-slate-400 dark:bg-slate-800/40" : percent >= 90 ? "bg-primary-600 text-white" : percent >= 80 ? "bg-primary-400 text-primary-950" : percent >= 70 ? "bg-primary-100 text-primary-800" : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-200"}`}>{formatPercent(percent)}</td>;
            })}</tr>)}</tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500 dark:text-slate-400">{[["bg-slate-200 dark:bg-slate-700", "Abaixo de 70%"], ["bg-primary-100", "70–79%"], ["bg-primary-400", "80–89%"], ["bg-primary-600", "90% ou mais"]].map(([color, label]) => <span key={label} className="inline-flex items-center gap-1.5"><span className={`size-2.5 rounded-sm ${color}`} />{label}</span>)}</div>
      </Panel>
      <div className="flex flex-col gap-5">
        <Panel title="Seus melhores horários" subtitle="Maior proporção de boa postura no período.">
          <ol className="space-y-3">{bestHours.map((hour, index) => <li key={hour.hour} className="flex items-center gap-3 rounded-lg bg-primary-50/70 p-3 dark:bg-primary-950/30"><span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-500 text-xs font-semibold text-white">{index + 1}</span><span className="flex-1 text-sm font-medium">{hour.hour}h – {hour.hour + 1}h</span><span className="text-sm font-semibold text-primary-700 dark:text-primary-400">{formatPercent(hour.percent)}</span></li>)}</ol>
        </Panel>
        <GoalProgress report={report} />
      </div>
    </div>
  </div>;
}
