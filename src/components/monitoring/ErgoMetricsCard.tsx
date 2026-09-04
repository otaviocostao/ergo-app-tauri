import { LucideIcon, TrendingUp, TrendingDown, Minus, Info } from "lucide-react";

export type MetricStatus = "good" | "warning" | "danger" | "info";

export interface ErgoMetricsCardProps {
  title: string;
  value: string | number;
  unit?: string;
  status: MetricStatus;
  icon: LucideIcon;
  progress?: number;
  idealRange?: string;
  trend?: "improving" | "worsening" | "stable";
  description?: string;
  details?: { label: string; value: string }[];
  className?: string;
}

export default function ErgoMetricsCard({
  title,
  value,
  unit,
  status,
  icon: Icon,
  progress,
  idealRange,
  trend,
  description,
  details,
  className = "",
}: ErgoMetricsCardProps) {
  const statusStyles: Record<MetricStatus, { bg: string; text: string; badgeBg: string; badgeText: string; progressBg: string }> = {
    good: {
      bg: "bg-emerald-50/50 dark:bg-emerald-950/20",

      text: "text-emerald-600 dark:text-emerald-400",
      badgeBg: "bg-emerald-100 dark:bg-emerald-900/50",
      badgeText: "text-emerald-700 dark:text-emerald-300",
      progressBg: "bg-emerald-500",
    },
    warning: {
      bg: "bg-amber-50/50 dark:bg-amber-950/20",

      text: "text-amber-600 dark:text-amber-400",
      badgeBg: "bg-amber-100 dark:bg-amber-900/50",
      badgeText: "text-amber-700 dark:text-amber-300",
      progressBg: "bg-amber-500",
    },
    danger: {
      bg: "bg-rose-50/50 dark:bg-rose-950/20",
      text: "text-rose-600 dark:text-rose-400",
      badgeBg: "bg-rose-100 dark:bg-rose-900/50",
      badgeText: "text-rose-700 dark:text-rose-300",
      progressBg: "bg-rose-500",
    },
    info: {
      bg: "bg-sky-50/50 dark:bg-sky-950/20",
      text: "text-sky-600 dark:text-sky-400",
      badgeBg: "bg-sky-100 dark:bg-sky-900/50",
      badgeText: "text-sky-700 dark:text-sky-300",
      progressBg: "bg-sky-500",
    },
  };

  const style = statusStyles[status];

  return (
    <div
      className={`relative rounded-xl border p-4 transition-all duration-200 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 ${className}`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div className={`p-2 rounded-lg ${style.badgeBg} ${style.text}`}>
            <Icon size={18} />
          </div>
          <div>
            <h3 className="flex gap-1.5 items-center text-sm font-semibold text-slate-800 dark:text-slate-200">
              {title}
              {description ? (
                <div className="relative group/tooltip inline-flex items-center">
                  <Info size={14} className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors cursor-help shrink-0" />
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/tooltip:flex flex-col items-center pointer-events-none z-50 w-max max-w-[220px]">
                    <div className="bg-slate-900/95 dark:bg-slate-800/95 backdrop-blur-sm text-slate-100 text-xs font-normal rounded-lg py-1.5 px-3 shadow-xl border border-slate-700/60 text-center leading-snug whitespace-normal">
                      {description}
                    </div>
                    <div className="w-2 h-2 -mt-1 rotate-45 bg-slate-900/95 dark:bg-slate-800/95 border-r border-b border-slate-700/60" />
                  </div>
                </div>
              ) : (
                <Info size={14} className="text-slate-400 dark:text-slate-500 shrink-0" />
              )}
            </h3>
            {idealRange && (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Ideal: {idealRange}
              </span>
            )}
          </div>
        </div>

        {trend && (
          <div className="ml-auto flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            {trend === "improving" && (
              <span className="flex items-center text-emerald-600 dark:text-emerald-400">
                <TrendingUp size={14} className="mr-0.5" /> Bom
              </span>
            )}
            {trend === "worsening" && (
              <span className="flex items-center text-rose-600 dark:text-rose-400">
                <TrendingDown size={14} className="mr-0.5" /> Atenção
              </span>
            )}
            {trend === "stable" && (
              <span className="flex items-center text-slate-500">
                <Minus size={14} className="mr-0.5" /> Estável
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex items-baseline gap-1.5 my-2">
        <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
          {value}
        </span>
        {unit && <span className="text-sm font-medium text-slate-500 dark:text-slate-400">{unit}</span>}
      </div>

      {typeof progress === "number" && (
        <div className="mt-3 space-y-1">
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ease-out ${style.progressBg}`}
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        </div>
      )}

      {details && details.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 grid grid-cols-2 gap-2 text-xs">
          {details.map((d, i) => (
            <div key={i} className="flex flex-col">
              <span className="text-slate-400 dark:text-slate-500">{d.label}</span>
              <span className="font-medium text-slate-700 dark:text-slate-300">{d.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
