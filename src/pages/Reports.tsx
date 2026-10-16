import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Activity, ArrowRight, Bell, CalendarDays, ChartNoAxesCombined, ChevronLeft, ChevronRight, Clock3, Coffee, Info } from "lucide-react";
import Header from "../components/Header";
import { Panel, panelClass } from "../components/dashboard/DashboardWidgets";
import { Comparison, GoalProgress, PeriodComparison, ReportChart, ReportHistory, postureChange } from "../components/reports/ReportWidgets";
import { buildReport, createReportPreview, dateKey, formatDate, formatMinutes, formatPercent, isDateKey, periodBounds, shiftPeriod, type PostureReport, type ReportPeriod } from "../data/reports";
import ErgonomicIndex from "./ErgonomicIndex";
import GoodPosture from "./GoodPosture";
import PreventiveAlerts from "./PreventiveAlerts";

const views = [
  { value: "overview", label: "Visão geral" },
  { value: "index", label: "Índice ergonômico" },
  { value: "posture", label: "Boa postura" },
  { value: "alerts", label: "Alertas e pausas" },
] as const;

const periods: { value: ReportPeriod; label: string }[] = [
  { value: "day", label: "Dia" }, { value: "week", label: "Semana" }, { value: "month", label: "Mês" },
];

function ReportMetrics({ report }: { report: PostureReport }) {
  const { summary, previous } = report;
  const dailyMinutesChange = summary.days && previous.days ? summary.goodMinutes / summary.days - previous.goodMinutes / previous.days : null;
  const alertChange = summary.alertsPerHour === null || previous.alertsPerHour === null ? null : summary.alertsPerHour - previous.alertsPerHour;
  const metrics = [
    { title: "Índice ergonômico", value: formatPercent(summary.posturePercent), detail: "do tempo monitorado em boa postura", icon: Activity, change: postureChange(report), unit: "p.p." },
    { title: "Tempo em boa postura", value: formatMinutes(summary.goodMinutes), detail: `${formatMinutes(summary.goodMinutes / summary.days)} por dia monitorado`, icon: Clock3, change: dailyMinutesChange, unit: "min/dia" },
    { title: "Alertas preventivos", value: summary.alerts, detail: `${summary.alertsPerHour?.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} por hora monitorada`, icon: Bell, change: alertChange, unit: "/h", lowerIsBetter: true },
    { title: "Pausas realizadas", value: summary.breaks, detail: `${(summary.breaks / summary.days).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} por dia monitorado`, icon: Coffee, change: null, unit: "" },
  ];
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(metric => <section key={metric.title} aria-label={metric.title} className={`${panelClass} flex min-w-0 flex-col p-5`}>
    <div className="flex items-center justify-between gap-3"><h2 className="text-sm font-medium text-slate-600 dark:text-slate-300">{metric.title}</h2><span className="rounded-lg bg-primary-50 p-2 text-primary-600 dark:bg-primary-950/40 dark:text-primary-400"><metric.icon size={17} aria-hidden="true" /></span></div>
    <p className="mt-4 text-3xl font-semibold tracking-tight">{metric.value}</p>
    <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{metric.detail}</p>
    <div className="mt-auto pt-4">{metric.title === "Pausas realizadas" ? <span className="text-xs text-slate-500 dark:text-slate-400">{formatMinutes(summary.monitoredMinutes)} de monitoramento</span> : <Comparison change={metric.change} unit={metric.unit} lowerIsBetter={metric.lowerIsBetter} />}</div>
  </section>)}</div>;
}

function Overview({ report, postureLink }: { report: PostureReport; postureLink: string }) {
  const rankedHours = report.hours.filter(hour => hour.percent !== null).sort((a, b) => b.percent! - a.percent!);
  const best = rankedHours[0];
  const attention = rankedHours[rankedHours.length - 1];
  return <div className="flex flex-col gap-5">
    <ReportMetrics report={report} />
    <div className="grid items-start gap-5 xl:grid-cols-[2fr_1fr]"><ReportChart report={report} /><PeriodComparison report={report} /></div>
    <div className="grid gap-5 xl:grid-cols-2">
      <GoalProgress report={report} />
      <Panel title="Conheça seus padrões" subtitle="Horários que se destacaram no período selecionado." action={<Link to={postureLink} className="inline-flex items-center gap-1 text-xs font-medium text-primary-700 hover:underline dark:text-primary-400">Ver mapa completo<ArrowRight size={14} /></Link>}>
        <div className="space-y-3">
          {best && <div className="rounded-lg bg-primary-50/70 p-4 dark:bg-primary-950/30"><p className="text-xs font-medium text-primary-700 dark:text-primary-400">Melhor faixa de horário</p><p className="mt-1 text-lg font-semibold">{best.hour}h – {best.hour + 1}h <span className="text-sm font-medium text-primary-700 dark:text-primary-400">· {formatPercent(best.percent)} em boa postura</span></p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Foi o horário com maior proporção de alinhamento nas leituras.</p></div>}
          {attention && <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-800/50"><p className="text-xs font-medium text-slate-500 dark:text-slate-400">Horário com mais espaço para melhorar</p><p className="mt-1 text-lg font-semibold">{attention.hour}h – {attention.hour + 1}h <span className="text-sm font-medium text-slate-500 dark:text-slate-400">· {formatPercent(attention.percent)} em boa postura</span></p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Compare essa faixa com seus melhores horários no mapa de postura.</p></div>}
        </div>
      </Panel>
    </div>
    <ReportHistory report={report} />
  </div>;
}

export default function Reports() {
  const [params, setParams] = useSearchParams();
  const today = dateKey(new Date());
  const rawPeriod = params.get("period");
  const period: ReportPeriod = rawPeriod === "day" || rawPeriod === "month" ? rawPeriod : "week";
  const rawDate = params.get("date");
  const anchor = isDateKey(rawDate) && rawDate <= today ? rawDate : today;
  const view = views.find(item => item.value === params.get("view"))?.value ?? "overview";
  const source = useMemo(() => createReportPreview(), [today]);
  const report = useMemo(() => buildReport(source, period, anchor), [source, period, anchor, today]);
  const hasData = report.summary.monitoredMinutes > 0;
  const canAdvance = dateKey(periodBounds(period, anchor).start) < dateKey(periodBounds(period, today).start);

  function update(values: Record<string, string>) {
    const next = new URLSearchParams(params);
    Object.entries(values).forEach(([key, value]) => next.set(key, value));
    setParams(next);
  }

  function viewLink(value: string) {
    const next = new URLSearchParams(params);
    next.set("view", value);
    return `/reports?${next}`;
  }

  const rangeLabel = report.start === report.end
    ? formatDate(report.start, { day: "2-digit", month: "long", year: "numeric" })
    : `${formatDate(report.start)} – ${formatDate(report.end, { day: "2-digit", month: "short", year: "numeric" })}`;
  const controlClass = "inline-flex cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-white p-2 text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 disabled:cursor-default disabled:opacity-35 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800";

  return <div className="@container relative flex w-full min-w-0 flex-col gap-5 pb-8">
    <Header title="Relatórios" subtitle="Entenda seus hábitos de postura e acompanhe sua evolução ao longo do tempo." className="mb-0!" />
    <div className="flex items-start gap-2.5 rounded-lg border border-primary-100 bg-primary-50/60 px-4 py-3 text-xs leading-relaxed text-primary-800 dark:border-primary-800 dark:bg-primary-950/30 dark:text-primary-200"><Info size={16} className="mt-0.5 shrink-0" aria-hidden="true" /><p><strong className="font-semibold">Dados demonstrativos.</strong> Explore os relatórios com um histórico de exemplo. As leituras do monitoramento ainda não são salvas neste histórico.</p></div>

    <section className={`${panelClass} flex flex-wrap items-center justify-between gap-4 p-4`} aria-label="Filtros do relatório">
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800" role="group" aria-label="Período do relatório">{periods.map(item => <button key={item.value} type="button" aria-pressed={period === item.value} onClick={() => update({ period: item.value })} className={`cursor-pointer rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary-500 ${period === item.value ? "bg-white text-primary-700 shadow-xs dark:bg-slate-700 dark:text-primary-400" : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"}`}>{item.label}</button>)}</div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" aria-label="Período anterior" className={controlClass} onClick={() => update({ date: shiftPeriod(period, anchor, -1) })}><ChevronLeft size={17} /></button>
        <label className={`${controlClass} gap-2 px-3 text-xs`}><CalendarDays size={15} aria-hidden="true" /><span className="sr-only">Data de referência</span><input type="date" value={anchor} max={today} onChange={event => { if (isDateKey(event.target.value) && event.target.value <= today) update({ date: event.target.value }); }} className="min-w-0 cursor-pointer bg-transparent outline-none dark:scheme-dark" /></label>
        <button type="button" aria-label="Próximo período" disabled={!canAdvance} className={controlClass} onClick={() => update({ date: shiftPeriod(period, anchor, 1) })}><ChevronRight size={17} /></button>
        <button type="button" onClick={() => update({ date: today })} className="cursor-pointer rounded-md px-2 py-2 text-xs font-medium text-primary-700 hover:underline focus-visible:outline-2 focus-visible:outline-primary-500 dark:text-primary-400">{period === "day" ? "Hoje" : period === "week" ? "Esta semana" : "Este mês"}</button>
      </div>
    </section>

    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400" aria-live="polite" aria-atomic="true"><p className="font-medium text-slate-700 dark:text-slate-200">{rangeLabel}{report.partial && <span className="ml-2 font-normal text-slate-500 dark:text-slate-400">· Em andamento</span>}</p><p>{report.summary.days} {report.summary.days === 1 ? "dia monitorado" : "dias monitorados"} · {formatMinutes(report.summary.monitoredMinutes)} de leituras</p></div>

    <nav aria-label="Tipos de relatório" className="flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800">{views.map(item => <Link key={item.value} to={viewLink(item.value)} aria-current={view === item.value ? "page" : undefined} className={`shrink-0 border-b-2 px-4 py-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-500 ${view === item.value ? "border-primary-500 text-primary-700 dark:text-primary-400" : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"}`}>{item.label}</Link>)}</nav>

    {!hasData ? <section className={`${panelClass} flex flex-col items-center px-6 py-16 text-center`} aria-label="Período sem dados"><span className="mb-4 rounded-2xl bg-slate-100 p-4 text-slate-400 dark:bg-slate-800"><ChartNoAxesCombined size={30} aria-hidden="true" /></span><h2 className="text-lg font-semibold">Nenhuma leitura neste período</h2><p className="mt-2 max-w-md text-sm leading-relaxed text-slate-500 dark:text-slate-400">Escolha outra data para consultar o histórico de exemplo. Dias sem monitoramento não recebem uma pontuação de postura.</p><button type="button" onClick={() => update({ period: "week", date: today })} className="mt-5 cursor-pointer rounded-lg bg-primary-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500">Ver esta semana</button></section>
      : view === "index" ? <ErgonomicIndex report={report} />
      : view === "posture" ? <GoodPosture report={report} />
      : view === "alerts" ? <PreventiveAlerts report={report} />
      : <Overview report={report} postureLink={viewLink("posture")} />}
  </div>;
}
