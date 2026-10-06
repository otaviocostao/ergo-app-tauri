import type { ReactNode } from "react";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import Header from "../Header";
import { dashboardPreview } from "../../data/dashboard";

export const panelClass = "rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900";
export const titleClass = "text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100";
export const subtitleClass = "mt-1 text-sm leading-relaxed text-slate-500 dark:text-slate-400";

export function DashboardPage({ title, subtitle, detail = false, children }: { title: string; subtitle: string; detail?: boolean; children: ReactNode }) {
  return (
    <div className="@container flex w-full min-w-0 flex-col gap-7 pb-8">
      {detail && <Link to="/" viewTransition className="inline-flex w-fit items-center gap-2 rounded-md text-sm font-medium text-slate-500 transition-colors hover:text-primary-600 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-500 dark:text-slate-400"><ArrowLeft size={16} /> Voltar ao início</Link>}
      <Header title={title} subtitle={subtitle} className="mb-0!" />
      {children}
    </div>
  );
}

export function ProgressBar({ value, label, danger = false, large = false }: { value: number; label: string; danger?: boolean; large?: boolean }) {
  const percent = Math.min(100, Math.max(0, value));
  return <div role="progressbar" aria-label={label} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} className={`overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800 ${large ? "h-3" : "h-2"}`}><div className={`h-full rounded-full ${danger ? "bg-red-500" : "bg-primary-500"}`} style={{ width: `${percent}%` }} /></div>;
}

export function MetricCard({ title, value, description, progress, badge, to, danger = false }: { title: string; value: string | number; description: string; progress?: number; badge?: string; to?: string; danger?: boolean }) {
  const content = <>
    <div className="flex items-start justify-between gap-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200"><span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${danger ? "bg-red-500" : "bg-primary-500"}`} />{title}</h2>
      {badge && <span className="shrink-0 rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-700 dark:bg-primary-950/60 dark:text-primary-400">{badge}</span>}
    </div>
    <p className={`font-semibold tracking-tight text-slate-950 dark:text-white ${to ? "mt-6 text-4xl xl:text-5xl" : "mt-4 text-3xl"}`}>{value}</p>
    <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{description}</p>
    {progress !== undefined && <div className="mt-auto pt-4">{to && <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">Meta diária</p>}<ProgressBar value={progress} label={`${title}: progresso`} danger={danger} /></div>}
    {to && <span className="mt-auto flex items-center gap-1 pt-3 text-xs font-medium text-primary-700 dark:text-primary-400">Ver detalhes<ArrowUpRight size={14} aria-hidden="true" /></span>}
  </>;
  const className = `${panelClass} flex min-w-0 flex-col p-5 xl:p-6 ${to ? "min-h-64 transition-colors hover:border-primary-400 hover:bg-primary-50/30 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-500 dark:hover:bg-primary-950/20" : "min-h-40"}`;
  return to ? <Link to={to} viewTransition aria-label={`Ver detalhes: ${title}`} className={className}>{content}</Link> : <section aria-label={title} className={className}>{content}</section>;
}

export function Panel({ title, subtitle, action, children, className = "" }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`${panelClass} min-w-0 p-5 xl:p-7 ${className}`} aria-label={title}><div className="mb-6 flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h2 className={titleClass}>{title}</h2>{subtitle && <p className={subtitleClass}>{subtitle}</p>}</div>{action}</div>{children}</section>;
}

export function Legend({ items }: { items: { label: string; className: string }[] }) {
  return <div className="flex flex-wrap gap-4 text-xs text-slate-600 dark:text-slate-400">{items.map(item => <span key={item.label} className="inline-flex items-center gap-2"><span aria-hidden="true" className={`h-2 w-2 rounded-full ${item.className}`} />{item.label}</span>)}</div>;
}

export function DailyGoal({ compact = false }: { compact?: boolean }) {
  return <section aria-label="Meta diária" className={`${panelClass} p-5 xl:p-7 ${compact ? "grid items-center gap-5 xl:grid-cols-2" : "flex flex-col"}`}>
    <div><h2 className={titleClass}>{compact ? "Tempo restante para meta diária" : "Progresso até a média diária"}</h2>{!compact && <p className="mt-4 text-4xl font-semibold tracking-tight">{dashboardPreview.goodPostureTime} de {dashboardPreview.dailyGoal}</p>}<p className={subtitleClass}>{compact ? "A meta diária configurada é 6h em postura correta." : "Faltam 48 minutos dentro da faixa ideal para atingir a média diária definida para o usuário."}</p></div>
    <div className={compact ? "" : "mt-auto pt-6"}><ProgressBar value={dashboardPreview.goalProgress} label="Meta diária de boa postura" large /><div className="mt-2 flex justify-between gap-3 text-xs"><span className="font-semibold text-primary-700 dark:text-primary-400">{dashboardPreview.goalProgress}% concluído</span>{compact && <span className="font-medium">{dashboardPreview.remainingTime} restantes</span>}</div></div>
  </section>;
}
