import { useState, useEffect } from "react";
import Modal from "../Modal";
import Button from "../Button";
import Input from "../Input";
import Select from "../Select";
import { ReminderItem } from "../../pages/Reminders";
import { Tag, Calendar } from "lucide-react";

interface ReminderFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave?: (reminder: ReminderItem) => void;
  reminder: ReminderItem | null;
}

const WEEK_DAYS = [
  { id: "Dom", label: "Dom" },
  { id: "Seg", label: "Seg" },
  { id: "Ter", label: "Ter" },
  { id: "Qua", label: "Qua" },
  { id: "Qui", label: "Qui" },
  { id: "Sex", label: "Sex" },
  { id: "Sab", label: "Sab" },
];

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
  const [frequency, setFrequency] = useState("Segunda a Sexta");
  const [customDays, setCustomDays] = useState<string[]>([]);
  const [silentNotification, setSilentNotification] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (reminder) {
        setTitle(reminder.title || "");
        setMessage(reminder.message || reminder.description || "");
        setCategory(reminder.category || "Postura");
        setIntervalVal(reminder.interval || "");

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

        setFrequency(reminder.frequency || "Segunda a Sexta");
        setSilentNotification(!reminder.notificationTone);
      } else {
        setTitle("");
        setMessage("");
        setCategory("Postura");
        setIntervalVal("");
        setStartTime("08:00");
        setEndTime("18:00");
        setFrequency("Segunda a Sexta");
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

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!title.trim() || !message.trim()) return;

    const savedReminder: ReminderItem = {
      id: reminder?.id || Date.now().toString(),
      title: title.trim(),
      message: message.trim(),
      description: message.trim(),
      category,
      interval: interval.trim() || "30 min",
      period: `${startTime} - ${endTime}`,
      startTime,
      endTime,
      frequency:
        frequency === "Personalizado" && customDays.length > 0
          ? customDays.join(", ")
          : frequency,
      notificationTone: !silentNotification,
      status: reminder?.status || "ativo",
    };

    onSave?.(savedReminder);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="2xl"
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
          <div className="flex items-center gap-2 ml-auto">
            <Button variant="secondary" size="md" onClick={onClose} type="button">
              Fechar
            </Button>
            <Button variant="primary" size="md" onClick={() => handleSubmit()}>
              <span>Salvar</span>
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
            label="Intervalo"
            type="text"
            placeholder="Ex: 45 min"
            value={interval}
            onChange={(e) => setIntervalVal(e.target.value)}
          />
          <Input
            label="Início"
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
          <Input
            label="Fim"
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <Select
            label="Frequência"
            leftIcon={<Calendar size={16} />}
            value={frequency}
            onChange={(e) => setFrequency(e.target.value)}
            options={[
              { label: "Segunda a Sexta", value: "Segunda a Sexta" },
              { label: "Diariamente", value: "Diariamente" },
              { label: "Dias Úteis", value: "Dias Úteis" },
              { label: "Finais de Semana", value: "Finais de Semana" },
              { label: "Personalizado", value: "Personalizado" },
            ]}
            containerClassName={frequency === "Personalizado" ? "sm:w-1/3" : "w-full"}
          />

          {frequency === "Personalizado" && (
            <div className="flex flex-col sm:w-1/2 justify-center">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Dias da semana
              </label>
              <div className="flex gap-2 items-center flex-wrap">
                {WEEK_DAYS.map((day) => (
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