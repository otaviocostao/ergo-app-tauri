import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Activity, ArrowRight, Bell, ChartNoAxesCombined, ChevronLeft, ChevronRight, RefreshCw, Timer } from "lucide-react";
import Header from "../components/Header";
import { Panel, panelClass } from "../components/dashboard/DashboardWidgets";
import { Comparison, PeriodComparison, ReportChart, ReportCoverage, ReportHistory, scoreChange } from "../components/reports/ReportWidgets";
import ReportPeriodPicker from "../components/reports/ReportPeriodPicker";
import { buildReport, dateKey, formatDate, formatDuration, formatPercent, formatScore, isDateKey, periodBounds, reportRange, shiftPeriod, type PostureReport, type ReportPeriod } from "../data/reports";
import { useAuth } from "../auth/AuthContext";
import { useReportData } from "../hooks/useReportData";
import ErgonomicIndex from "./ErgonomicIndex";
import GoodPosture from "./GoodPosture";
import PreventiveAlerts from "./PreventiveAlerts";
import TypingReport from "./TypingReport";

const views = [
  { value: "overview", label: "Visão geral" },
  { value: "index", label: "Score postural" },
  { value: "posture", label: "Resumos posturais" },
  { value: "alerts", label: "Alertas" },
  { value: "typing", label: "Digitação" },
] as const;
const periods: { value: ReportPeriod; label: string }[] = [
  { value: "day", label: "Dia" }, { value: "week", label: "Semana" }, { value: "month", label: "Mês" },
];

function ReportMetrics({ report }: { report: PostureReport }) {
  const { summary, previous } = report;
  const adequateChange = summary.adequateSummaryPercentage === null || previous.adequateSummaryPercentage === null
    ? null : summary.adequateSummaryPercentage - previous.adequateSummaryPercentage;
  const metrics = [
    { title: "Score postural médio", value: formatScore(summary.averageScore), detail: "Média ponderada pelas amostras válidas.", icon: Activity, change: scoreChange(report), unit: "pontos" },
    { title: "Resumos adequados", value: formatPercent(summary.adequateSummaryPercentage), detail: `${summary.goodSummaries} de ${summary.validSummaries} resumos posturais válidos.`, icon: ChartNoAxesCombined, change: adequateChange, unit: "p.p." },
    { title: "Alertas registrados", value: summary.alerts, detail: `${summary.criticalAlerts} com gravidade alta.`, icon: Bell, change: previous.hasData ? summary.alerts - previous.alerts : null, unit: "alertas", lowerIsBetter: true },
    { title: "Tempo de sessão", value: formatDuration(summary.sessionSeconds), detail: "Duração gravada de sessões encerradas.", icon: Timer, change: null, unit: "" },
  ];
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(metric => <section key={metric.title} aria-label={metric.title} className={`${panelClass} flex min-w-0 flex-col p-5`}>
    <div className="flex items-center justify-between gap-3"><h2 className="text-sm font-medium text-slate-600 dark:text-slate-300">{metric.title}</h2><span className="rounded-lg bg-primary-50 p-2 text-primary-600 dark:bg-primary-950/40 dark:text-primary-400"><metric.icon size={17} aria-hidden="true" /></span></div>
    <p className="mt-4 text-3xl font-semibold tracking-tight">{metric.value}</p>
    <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{metric.detail}</p>
    <div className="mt-auto pt-4">{metric.title === "Tempo de sessão" ? <span className="text-xs text-slate-500 dark:text-slate-400">{summary.sessionCount} sessão(ões) no período · {summary.openSessions} em andamento</span> : <Comparison change={metric.change} unit={metric.unit} lowerIsBetter={metric.lowerIsBetter} />}</div>
  </section>)}</div>;
}

function Overview({ report, postureLink }: { report: PostureReport; postureLink: string }) {
  const ranked = report.hours.filter(hour => hour.averageScore !== null).sort((a, b) => b.averageScore! - a.averageScore!);
  const best = ranked[0];
  const attention = ranked.length > 1 ? ranked[ranked.length - 1] : null;
  return <div className="flex flex-col gap-5">
    <ReportMetrics report={report} />
    <div className="grid items-start gap-5 xl:grid-cols-[2fr_1fr]"><ReportChart report={report} /><PeriodComparison report={report} /></div>
    <div className="grid gap-5 xl:grid-cols-2">
      <ReportCoverage report={report} />
      <Panel title="Padrões por horário" subtitle="Horários locais em que os resumos foram registrados." action={<Link to={postureLink} className="inline-flex items-center gap-1 text-xs font-medium text-primary-700 hover:underline dark:text-primary-400">Ver mapa completo<ArrowRight size={14} /></Link>}>
        {!best ? <p className="text-sm text-slate-500 dark:text-slate-400">Ainda sem leituras válidas para comparar horários.</p> : <div className="space-y-3">
          <div className="rounded-lg bg-primary-50/70 p-4 dark:bg-primary-950/30"><p className="text-xs font-medium text-primary-700 dark:text-primary-400">Maior score médio</p><p className="mt-1 text-lg font-semibold">{best.hour}h – {best.hour + 1}h <span className="text-sm font-medium text-primary-700 dark:text-primary-400">· {formatScore(best.averageScore)}</span></p></div>
          {attention && <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-800/50"><p className="text-xs font-medium text-slate-500 dark:text-slate-400">Menor score médio</p><p className="mt-1 text-lg font-semibold">{attention.hour}h – {attention.hour + 1}h <span className="text-sm font-medium text-slate-500 dark:text-slate-400">· {formatScore(attention.averageScore)}</span></p></div>}
        </div>}
      </Panel>
    </div>
    <ReportHistory report={report} />
  </div>;
}

export default function Reports() {
  const [params, setParams] = useSearchParams();
  const { session } = useAuth();
  const userId = session.kind === "authenticated" ? session.user.id : null;
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const refresh = () => setClock(Date.now());
    const timer = setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    return () => { clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, []);
  const today = dateKey(new Date(clock));
  const rawPeriod = params.get("period");
  const period: ReportPeriod = rawPeriod === "day" || rawPeriod === "month" ? rawPeriod : "week";
  const rawDate = params.get("date");
  const anchor = isDateKey(rawDate) && rawDate <= today ? rawDate : today;
  const view = views.find(item => item.value === params.get("view"))?.value ?? "overview";
  const range = reportRange(period, anchor, new Date(clock));
  const load = useReportData(userId, range.filter);
  const report = useMemo(() => load.data ? buildReport(load.data, period, anchor, new Date()) : null, [load.data, period, anchor, clock]);
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
  const rangeLabel = range.start === range.end
    ? formatDate(range.start, { day: "2-digit", month: "long", year: "numeric" })
    : `${formatDate(range.start)} – ${formatDate(range.end, { day: "2-digit", month: "short", year: "numeric" })}`;
  const controlClass = "inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 disabled:cursor-default disabled:opacity-35 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800";

  return <div className="@container relative flex w-full min-w-0 flex-col gap-5 pb-8">
    <Header title="Relatórios" subtitle="Consulte os dados salvos de postura, alertas e digitação do seu monitoramento." className="mb-0!" />
    <section className={`${panelClass} flex flex-wrap items-center justify-between gap-4 p-4`} aria-label="Filtros do relatório">
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800" role="group" aria-label="Período do relatório">{periods.map(item => <button key={item.value} type="button" aria-pressed={period === item.value} onClick={() => update({ period: item.value })} className={`cursor-pointer rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary-500 ${period === item.value ? "bg-white text-primary-700 shadow-xs dark:bg-slate-700 dark:text-primary-400" : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"}`}>{item.label}</button>)}</div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" aria-label="Período anterior" className={controlClass} onClick={() => update({ date: shiftPeriod(period, anchor, -1) })}><ChevronLeft size={17} /></button>
        <ReportPeriodPicker period={period} value={anchor} onChange={(date) => update({ date })} />
        <button type="button" aria-label="Próximo período" disabled={!canAdvance} className={controlClass} onClick={() => update({ date: shiftPeriod(period, anchor, 1) })}><ChevronRight size={17} /></button>
        <button type="button" onClick={() => update({ date: today })} className="cursor-pointer rounded-md px-2 py-2 text-xs font-medium text-primary-700 hover:underline focus-visible:outline-2 focus-visible:outline-primary-500 dark:text-primary-400">{period === "day" ? "Hoje" : period === "week" ? "Esta semana" : "Este mês"}</button>
        <button type="button" aria-label="Atualizar relatórios" className={controlClass} onClick={load.retry}><RefreshCw size={16} /></button>
      </div>
    </section>
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400" aria-live="polite" aria-atomic="true"><p className="font-medium text-slate-700 dark:text-slate-200">{rangeLabel}{range.partial && <span className="ml-2 font-normal text-slate-500 dark:text-slate-400">· Em andamento</span>}</p>{report && <p>{report.summary.days} dia(s) com registros · Dados salvos da sua conta</p>}</div>
    <nav aria-label="Tipos de relatório" className="flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800">{views.map(item => <Link key={item.value} to={viewLink(item.value)} aria-current={view === item.value ? "page" : undefined} className={`shrink-0 border-b-2 px-4 py-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-500 ${view === item.value ? "border-primary-500 text-primary-700 dark:text-primary-400" : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"}`}>{item.label}</Link>)}</nav>
    {load.loading ? <p role="status" className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">Carregando relatórios salvos...</p>
      : load.error ? <Panel title="Relatórios indisponíveis"><p role="alert" className="text-sm text-slate-500 dark:text-slate-400">{load.error}</p><button type="button" onClick={load.retry} className="mt-4 cursor-pointer rounded-lg bg-primary-500 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600">Tentar novamente</button></Panel>
      : !report?.summary.hasData ? <section className={`${panelClass} flex flex-col items-center px-6 py-16 text-center`} aria-label="Período sem dados"><span className="mb-4 rounded-2xl bg-slate-100 p-4 text-slate-400 dark:bg-slate-800"><ChartNoAxesCombined size={30} aria-hidden="true" /></span><h2 className="text-lg font-semibold">Nenhum registro neste período</h2><p className="mt-2 max-w-md text-sm leading-relaxed text-slate-500 dark:text-slate-400">Escolha outra data ou inicie o monitoramento para registrar dados da sua conta.</p><Link to="/monitoring" className="mt-5 rounded-lg bg-primary-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-600">Abrir monitoramento</Link></section>
      : view === "index" ? <ErgonomicIndex report={report} />
      : view === "posture" ? <GoodPosture report={report} />
      : view === "alerts" ? <PreventiveAlerts report={report} />
      : view === "typing" ? <TypingReport report={report} />
      : <Overview report={report} postureLink={viewLink("posture")} />}
  </div>;
}
