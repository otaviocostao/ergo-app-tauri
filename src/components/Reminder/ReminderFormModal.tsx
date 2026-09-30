import { useState, useEffect } from "react";
import Modal from "../Modal";
import Button from "../Button";
import Input from "../Input";
import Select from "../Select";
import { ReminderItem } from "../../pages/Reminders";
import {
  ReminderFrequency,
  REMINDER_FREQUENCY_OPTIONS,
  WEEK_DAYS_OPTIONS,
} from "../../enums";
import { Tag, Calendar } from "lucide-react";

interface ReminderFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave?: (reminder: ReminderItem) => Promise<void> | void;
  reminder: ReminderItem | null;
}

function parseIntervalToMinutes(val?: string | number): string {
  if (val === undefined || val === null || val === "") return "";
  if (typeof val === "number") return isNaN(val) ? "" : val.toString();
  const cleaned = val.trim().toLowerCase();

  const hourMatch = cleaned.match(/^(\d+)\s*hora/);
  if (hourMatch) {
    const hours = parseInt(hourMatch[1], 10);
    return isNaN(hours) ? "" : (hours * 60).toString();
  }

  const digitsMatch = cleaned.match(/^(\d+)/);
  if (digitsMatch) {
    return digitsMatch[1];
  }

  return "";
}

function calculatePeriodDuration(start?: string, end?: string): number | null {
  if (!start || !end) return null;
  const [startH, startM] = start.split(":").map((v) => parseInt(v, 10));
  const [endH, endM] = end.split(":").map((v) => parseInt(v, 10));
  if (isNaN(startH) || isNaN(startM) || isNaN(endH) || isNaN(endM)) return null;
  const startTotal = startH * 60 + startM;
  const endTotal = endH * 60 + endM;
  return endTotal - startTotal;
}

export default function ReminderFormModal({
  isOpen,
  onClose,
  onSave,
  reminder,
}: ReminderFormModalProps) {
  const isEditing = reminder !== null;

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState<ReminderItem["category"]>("Postura");
  const [interval, setIntervalVal] = useState("");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("18:00");
  const [frequency, setFrequency] = useState<string>(ReminderFrequency.BUSINESS_DAYS);
  const [reminderDate, setReminderDate] = useState<string>(() =>
    new Date().toISOString().split("T")[0]
  );
  const [customDays, setCustomDays] = useState<string[]>([]);
  const [silentNotification, setSilentNotification] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSubmitError(null);
      setIsSaving(false);
      if (reminder) {
        setTitle(reminder.title || "");
        setMessage(reminder.message || reminder.description || "");
        setCategory(reminder.category || "Postura");
        setIntervalVal(parseIntervalToMinutes(reminder.interval));

        let start = reminder.startTime || "";
        let end = reminder.endTime || "";
        if ((!start || !end) && reminder.period) {
          const parts = reminder.period.split(" - ");
          if (parts.length === 2) {
            start = start || parts[0].trim();
            end = end || parts[1].trim();
          }
        }
        setStartTime(start || "08:00");
        setEndTime(end || "18:00");

        setFrequency(reminder.frequency || ReminderFrequency.BUSINESS_DAYS);
        setReminderDate(
          reminder.reminderDate || new Date().toISOString().split("T")[0]
        );
        setCustomDays(reminder.customDays || []);
        setSilentNotification(!reminder.notificationTone);
      } else {
        setTitle("");
        setMessage("");
        setCategory("Postura");
        setIntervalVal("");
        setStartTime("08:00");
        setEndTime("18:00");
        setFrequency(ReminderFrequency.BUSINESS_DAYS);
        setReminderDate(new Date().toISOString().split("T")[0]);
        setCustomDays([]);
        setSilentNotification(false);
      }
    }
  }, [isOpen, reminder]);

  const toggleDay = (dayId: string) => {
    setCustomDays((prev) =>
      prev.includes(dayId) ? prev.filter((d) => d !== dayId) : [...prev, dayId]
    );
  };

  const periodDuration = calculatePeriodDuration(startTime, endTime);
  const parsedMinutes = parseInt(interval, 10);
  const isIntervalInvalid =
    interval.trim() !== "" &&
    (!isNaN(parsedMinutes) && periodDuration !== null && (parsedMinutes <= 0 || parsedMinutes >= periodDuration));
  const isTimeOrderInvalid = periodDuration !== null && periodDuration <= 0;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!title.trim() || !message.trim()) {
      setSubmitError("Preencha o título e a mensagem do lembrete.");
      return;
    }

    const minutes = parseInt(interval, 10);
    if (isNaN(minutes) || minutes < 1) {
      setSubmitError("Informe um intervalo válido de pelo menos 1 minuto.");
      return;
    }

    const duration = calculatePeriodDuration(startTime, endTime);
    if (duration !== null && duration <= 0) {
      setSubmitError("O horário de término deve ser posterior ao horário de início.");
      return;
    }

    if (duration !== null && minutes >= duration) {
      setSubmitError(
        `O intervalo (${minutes} min) deve ser menor que a duração do período (${duration} min).`
      );
      return;
    }

    if (frequency === ReminderFrequency.ONCE && !reminderDate) {
      setSubmitError("Informe a data do lembrete.");
      return;
    }

    if (frequency === ReminderFrequency.CUSTOM && customDays.length === 0) {
      setSubmitError("Selecione pelo menos um dia da semana.");
      return;
    }

    try {
      setIsSaving(true);
      setSubmitError(null);

      const savedReminder: ReminderItem = {
        id: reminder?.id || "",
        title: title.trim(),
        message: message.trim(),
        description: message.trim(),
        category,
        interval: minutes,
        period: `${startTime} - ${endTime}`,
        startTime,
        endTime,
        frequency: frequency as ReminderFrequency,
        reminderDate:
          frequency === ReminderFrequency.ONCE ? reminderDate : undefined,
        customDays:
          frequency === ReminderFrequency.CUSTOM ? customDays : undefined,
        notificationTone: !silentNotification,
        status: reminder?.status || "ativo",
      };

      await onSave?.(savedReminder);
      onClose();
    } catch (err: unknown) {
      console.error("Failed to save reminder:", err);
      const errorMessage =
        typeof err === "string"
          ? err
          : (err as Error)?.message || "Erro ao salvar lembrete. Tente novamente.";
      setSubmitError(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="3xl"
      title={
        <div className="flex items-center gap-2">
          <div>
            <h3 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              {isEditing ? "Editar Lembrete" : "Novo Lembrete"}
            </h3>
            <p className="text-sm text-slate-500 font-normal">
              {isEditing
                ? "Edite seu lembrete personalizado"
                : "Crie um lembrete personalizado"}
            </p>
          </div>
        </div>
      }
      footer={
        <div className="flex items-center justify-between w-full">
          {submitError && (
            <span className="text-xs text-rose-500 font-medium">{submitError}</span>
          )}
          <div className="flex items-center gap-2 ml-auto">
            <Button variant="secondary" size="md" onClick={onClose} type="button" disabled={isSaving}>
              Fechar
            </Button>
            <Button variant="primary" size="md" onClick={() => handleSubmit()} disabled={isSaving || isIntervalInvalid || isTimeOrderInvalid}>
              <span>{isSaving ? "Salvando..." : "Salvar"}</span>
            </Button>
          </div>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-sm">
        <Input
          label="Título"
          type="text"
          placeholder="Ex: Alongamento da Coluna"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />

        <Input
          label="Mensagem"
          type="text"
          placeholder="Ex: Mantenha a postura ereta e relaxe os ombros"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            label="Categoria"
            leftIcon={<Tag size={16} />}
            value={category}
            onChange={(e) =>
              setCategory(e.target.value as ReminderItem["category"])
            }
            options={[
              { label: "Postura", value: "Postura" },
              { label: "Hidratação", value: "Hidratação" },
              { label: "Pausa Visual", value: "Pausa Visual" },
              { label: "Exercício", value: "Exercício" },
            ]}
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Input
            label="Intervalo (minutos)"
            type="number"
            min={1}
            max={periodDuration && periodDuration > 1 ? periodDuration - 1 : undefined}
            step={1}
            placeholder="Ex: 10"
            value={interval}
            onChange={(e) => {
              const val = e.target.value.replace(/[^0-9]/g, "");
              setIntervalVal(val);
              if (submitError) setSubmitError(null);
            }}
            rightIcon={<span className="text-xs text-slate-400 font-medium mr-1 select-none">min</span>}
            error={
              isIntervalInvalid
                ? parsedMinutes <= 0
                  ? "Mínimo de 1 min"
                  : `Deve ser menor que o intervalo entre início e fim (${periodDuration} min).`
                : undefined
            }
            required
          />
          <Input
            label="Início"
            type="time"
            value={startTime}
            onChange={(e) => {
              setStartTime(e.target.value);
              if (submitError) setSubmitError(null);
            }}
          />
          <Input
            label="Fim"
            type="time"
            value={endTime}
            onChange={(e) => {
              setEndTime(e.target.value);
              if (submitError) setSubmitError(null);
            }}
            error={isTimeOrderInvalid ? "Deve ser posterior ao início" : undefined}
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-4 items-start">
          <Select
            label="Frequência"
            leftIcon={<Calendar size={16} />}
            value={frequency}
            onChange={(e) => {
              setFrequency(e.target.value);
              if (submitError) setSubmitError(null);
            }}
            options={REMINDER_FREQUENCY_OPTIONS}
            containerClassName={
              frequency === ReminderFrequency.ONCE ||
              frequency === ReminderFrequency.CUSTOM
                ? "w-full sm:w-1/2"
                : "w-full"
            }
          />

          {frequency === ReminderFrequency.ONCE && (
            <div className="w-full sm:w-1/2">
              <Input
                label="Data do Lembrete"
                type="date"
                value={reminderDate}
                onChange={(e) => {
                  setReminderDate(e.target.value);
                  if (submitError) setSubmitError(null);
                }}
                required
              />
            </div>
          )}

          {frequency === ReminderFrequency.CUSTOM && (
            <div className="flex flex-col w-full sm:w-1/2 justify-center">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Dias da semana
              </label>
              <div className="flex gap-2 items-center flex-wrap">
                {WEEK_DAYS_OPTIONS.map((day) => (
                  <label
                    key={day.id}
                    className="flex items-center gap-1 cursor-pointer select-none"
                  >
                    <input
                      type="checkbox"
                      checked={customDays.includes(day.id)}
                      onChange={() => toggleDay(day.id)}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      {day.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 pt-1">
          <input
            id="silent-notification-checkbox"
            type="checkbox"
            checked={silentNotification}
            onChange={(e) => setSilentNotification(e.target.checked)}
            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
          />
          <label
            htmlFor="silent-notification-checkbox"
            className="text-xs font-medium text-slate-700 dark:text-slate-300 select-none cursor-pointer"
          >
            Enviar notificação silenciosa
          </label>
        </div>
      </form>
    </Modal>
  );
}