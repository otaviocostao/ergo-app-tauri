import { Activity, Clock, Eye, Loader2, PersonStanding, Settings2 } from "lucide-react";
import Button from "../Button";
import type { ReminderItem } from "../../services/reminderService";
import { ReminderFrequency, REMINDER_FREQUENCY_LABELS, WEEK_DAY_LABELS, type WeekDay } from "../../enums";

interface ErgonomicNoticeCardsProps {
  reminders: ReminderItem[];
  pendingId: string | null;
  onStatusChange: (reminder: ReminderItem, active: boolean) => void;
  onConfigure: (reminder: ReminderItem) => void;
}

export default function ErgonomicNoticeCards({ reminders, pendingId, onStatusChange, onConfigure }: ErgonomicNoticeCardsProps) {
  if (reminders.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">Nenhum aviso de ergonomia encontrado.</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
      {reminders.map((reminder) => {
        const active = reminder.status === "ativo";
        const pending = pendingId === reminder.id;
        const Icon = reminder.systemType === "POSTURE_CHECK" ? Activity : reminder.systemType === "VISUAL_BREAK" ? Eye : PersonStanding;
        const frequency = reminder.frequency === ReminderFrequency.CUSTOM
          ? reminder.customDays?.map((day) => WEEK_DAY_LABELS[day as WeekDay] ?? day).join(", ")
          : REMINDER_FREQUENCY_LABELS[reminder.frequency];

        return (
          <article key={reminder.id} aria-busy={pending} className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-slate-50/60 p-5 dark:border-slate-700 dark:bg-slate-800/30">
            <div className="mb-4 flex size-10 items-center justify-center rounded-lg bg-primary-50 text-primary-700 dark:bg-primary-950/60 dark:text-primary-400">
              <Icon size={21} aria-hidden="true" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{reminder.title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{reminder.message}</p>

            <dl className="my-5 space-y-2 text-xs text-slate-600 dark:text-slate-300">
              <div className="flex justify-between gap-3">
                <dt className="flex items-center gap-1.5"><Clock size={13} aria-hidden="true" /> Intervalo</dt>
                <dd className="text-right font-medium">{reminder.frequency === ReminderFrequency.ONCE ? "Uma vez" : `${reminder.interval} min`}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Horário</dt><dd className="text-right font-medium">{reminder.period}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Frequência</dt>
                <dd className="text-right font-medium">
                  {frequency}
                  {reminder.frequency === ReminderFrequency.ONCE && reminder.reminderDate && ` · ${reminder.reminderDate.split("-").reverse().join("/")}`}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Notificação</dt><dd className="text-right font-medium">{reminder.notificationTone ? "Com som" : "Silenciosa"}</dd>
              </div>
            </dl>

            <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-slate-700">
              <label className={`inline-flex items-center gap-2.5 ${pendingId ? "cursor-wait" : "cursor-pointer"}`}>
                <input type="checkbox" role="switch" className="peer sr-only"
                  aria-label={`Aviso: ${reminder.title}`} checked={active} disabled={pendingId !== null}
                  onChange={(event) => onStatusChange(reminder, event.currentTarget.checked)} />
                <span aria-hidden="true" className="relative h-6 w-11 shrink-0 rounded-full bg-slate-300 transition-colors after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:bg-primary-600 peer-checked:after:translate-x-5 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary-600 peer-disabled:opacity-50 dark:bg-slate-600" />
                <span className={`text-xs font-medium ${active ? "text-primary-700 dark:text-primary-400" : "text-slate-500 dark:text-slate-400"}`}>
                  {pending ? <span className="flex items-center gap-1"><Loader2 size={12} className="animate-spin" aria-hidden="true" /> Salvando…</span> : active ? "Ativo" : "Inativo"}
                </span>
              </label>
              <Button type="button" variant="secondary" size="sm" disabled={pendingId !== null}
                aria-label={`Configurar aviso: ${reminder.title}`} onClick={() => onConfigure(reminder)}>
                <Settings2 size={14} aria-hidden="true" /> Configurar
              </Button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
