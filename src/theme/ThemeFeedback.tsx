import { AlertCircle, RotateCw } from "lucide-react";
import { useTheme } from "./ThemeContext";

export default function ThemeFeedback() {
  const { error, isReady, reloadTheme } = useTheme();

  if (!error) return null;

  return (
    <div
      role="alert"
      className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
    >
      <AlertCircle size={18} className="shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1">{error}</p>
      {!isReady && (
        <button
          type="button"
          onClick={reloadTheme}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 font-semibold underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"
        >
          <RotateCw size={14} aria-hidden="true" /> Tentar novamente
        </button>
      )}
    </div>
  );
}
