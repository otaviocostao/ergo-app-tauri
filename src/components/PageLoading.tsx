export default function PageLoading({ fullScreen = false }: { fullScreen?: boolean }) {
  return (
    <div role="status" className={`flex items-center justify-center text-sm text-slate-500 dark:text-slate-400 ${fullScreen ? "min-h-screen" : "min-h-48"}`}>
      Carregando página…
    </div>
  );
}
