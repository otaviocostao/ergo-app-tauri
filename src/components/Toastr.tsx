import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, AlertTriangle, CheckCircle2, X } from "lucide-react";

export type ToastrType = "success" | "warning" | "error";

export interface ToastrProps {
  isOpen: boolean;
  onClose: () => void;
  type?: ToastrType;
  title?: string;
  message: React.ReactNode;
  duration?: number;
}

const toastrConfig = {
  success: {
    icon: CheckCircle2,
    defaultTitle: "Sucesso",
    borderClass: "border-emerald-200 dark:border-emerald-800/80",
    bgClass: "bg-white/95 dark:bg-slate-900/95",
    iconBgClass: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400",
    titleClass: "text-emerald-900 dark:text-emerald-200",
  },
  warning: {
    icon: AlertTriangle,
    defaultTitle: "Atenção",
    borderClass: "border-amber-200 dark:border-amber-800/80",
    bgClass: "bg-white/95 dark:bg-slate-900/95",
    iconBgClass: "bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400",
    titleClass: "text-amber-900 dark:text-amber-200",
  },
  error: {
    icon: AlertCircle,
    defaultTitle: "Erro",
    borderClass: "border-rose-200 dark:border-rose-800/80",
    bgClass: "bg-white/95 dark:bg-slate-900/95",
    iconBgClass: "bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400",
    titleClass: "text-rose-900 dark:text-rose-200",
  },
};

export default function Toastr({
  isOpen,
  onClose,
  type = "success",
  title,
  message,
  duration = 4000,
}: ToastrProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isOpen || duration <= 0) return;

    timerRef.current = setTimeout(() => {
      onClose();
    }, duration);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [isOpen, duration, message, type, onClose]);

  if (!isOpen) return null;

  const currentConfig = toastrConfig[type] || toastrConfig.success;
  const IconComponent = currentConfig.icon;
  const displayTitle = title !== undefined ? title : currentConfig.defaultTitle;

  return createPortal(
    <div
      className="fixed top-5 right-5 z-50 pointer-events-none flex flex-col items-end"
      role="region"
      aria-live="polite"
    >
      <div
        className={`pointer-events-auto relative w-full sm:w-auto min-w-[320px] max-w-sm rounded-xl border p-4 shadow-sm backdrop-blur-md transition-all animate-toast-in ${currentConfig.borderClass} ${currentConfig.bgClass}`}
      >
        <div className="flex items-start gap-3">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${currentConfig.iconBgClass}`}
          >
            <IconComponent size={20} className="stroke-[2.2]" />
          </div>

          <div className="flex-1 pr-1 pt-0.5">
            {displayTitle && (
              <h4 className={`text-sm font-semibold leading-none ${currentConfig.titleClass}`}>
                {displayTitle}
              </h4>
            )}
            <div className="mt-1 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {message}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer"
            aria-label="Fechar notificação"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
