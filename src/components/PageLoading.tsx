export default function PageLoading({ fullScreen = false }: { fullScreen?: boolean }) {
  return (
    <div
      role="status"
      className={`flex items-center justify-center bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 ${fullScreen ? "min-h-screen" : "min-h-48"}`}
    >
      <span aria-hidden="true" className="h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-primary-600 motion-reduce:animate-none dark:border-slate-700 dark:border-t-primary-400" />
      <span className="sr-only">Carregando</span>
    </div>
  );
}
