import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { Bell, X } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";

const ALERT_DURATION_MS = 10_000;

interface ReminderAlarm {
  id: string;
  userId: number;
  title: string;
  message: string;
  scheduledAt: string;
}

export default function ReminderAlerts() {
  const { session } = useAuth();
  const userId = session.kind === "authenticated" ? session.user.id : null;
  const [alerts, setAlerts] = useState<ReminderAlarm[]>([]);

  useEffect(() => {
    setAlerts([]);
    if (!isTauri() || userId === null) return;
    let active = true;
    let unlisten: UnlistenFn | undefined;
    const timers = new Set<number>();
    listen<ReminderAlarm>("reminder-alarm", ({ payload }) => {
      if (!active || payload.userId !== userId) return;
      setAlerts((previous) => [...previous, payload].slice(-3));
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        if (!active) return;
        setAlerts((previous) => previous.filter((item) => item.id !== payload.id || item.scheduledAt !== payload.scheduledAt));
      }, ALERT_DURATION_MS);
      timers.add(timer);
    }).then((stop) => {
      if (active) unlisten = stop;
      else stop();
    }).catch((error: unknown) => console.error("Failed to listen for reminder alarms:", error));
    return () => {
      active = false;
      unlisten?.();
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [userId]);

  if (userId === null) return null;
  return (
    <div className="fixed right-4 top-4 z-[100] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-3" aria-live="polite">
      {alerts.filter((alert) => alert.userId === userId).map((alert) => (
        <div key={`${alert.id}:${alert.scheduledAt}`} role="status" className="rounded-xl border border-emerald-300 bg-white p-4 shadow-lg dark:border-emerald-800 dark:bg-slate-900">
          <div className="flex items-start gap-2">
            <Bell size={18} className="mt-0.5 shrink-0 text-emerald-600" />
            <strong className="flex-1 text-sm text-slate-900 dark:text-white">{alert.title}</strong>
            <button aria-label="Fechar aviso" onClick={() => setAlerts((previous) => previous.filter((item) => item.id !== alert.id || item.scheduledAt !== alert.scheduledAt))} className="cursor-pointer text-slate-500 hover:text-slate-900 dark:hover:text-white"><X size={16} /></button>
          </div>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{alert.message}</p>
        </div>
      ))}
    </div>
  );
}
