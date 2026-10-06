import { useLocation } from "react-router-dom";

export default function Topbar() {
  const { pathname } = useLocation();
  const isDashboard = pathname === "/" || pathname.startsWith("/dashboard/");
  return (
    <header className="h-14 bg-white/80 backdrop-blur-md border-b border-slate-200 flex items-center px-6 shrink-0 transition-colors dark:bg-slate-900/80 dark:border-slate-800">
      {isDashboard && <span className="ml-auto inline-flex items-center gap-2 rounded-full border border-primary-100 bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700 dark:border-primary-800 dark:bg-primary-950/60 dark:text-primary-400"><span className="h-2 w-2 rounded-full bg-primary-500" aria-hidden="true" />Dados de demonstração</span>}
    </header>
  );
}
