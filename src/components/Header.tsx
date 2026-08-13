import { ReactNode } from "react";

interface HeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export default function Header({
  title,
  subtitle,
  action,
  children,
  className = "",
}: HeaderProps) {
  return (
    <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 ${className}`}>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {subtitle}
          </p>
        )}
      </div>
      {(action || children) && (
        <div className="flex items-center gap-3">
          {action}
          {children}
        </div>
      )}
    </div>
  );
}
