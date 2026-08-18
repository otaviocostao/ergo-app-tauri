import Modal from "./Modal";
import Button from "./Button";
import { ReminderItem } from "../pages/Reminders";
import {
  Clock,
  Calendar,
  Repeat,
  Tag,
  CheckCircle2,
  XCircle,
  MessageSquare,
  Edit2,
  Text,
} from "lucide-react";

interface ReminderDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  reminder: ReminderItem | null;
  onEdit?: (reminder: ReminderItem) => void;
}

const CATEGORY_COLORS: Record<ReminderItem["category"], { bg: string; text: string; border: string }> = {
  Postura: {
    bg: "bg-blue-50 dark:bg-blue-950/50",
    text: "text-blue-700 dark:text-blue-300",
    border: "border-blue-200 dark:border-blue-800",
  },
  Hidratação: {
    bg: "bg-cyan-50 dark:bg-cyan-950/50",
    text: "text-cyan-700 dark:text-cyan-300",
    border: "border-cyan-200 dark:border-cyan-800",
  },
  "Pausa Visual": {
    bg: "bg-purple-50 dark:bg-purple-950/50",
    text: "text-purple-700 dark:text-purple-300",
    border: "border-purple-200 dark:border-purple-800",
  },
  Exercício: {
    bg: "bg-amber-50 dark:bg-amber-950/50",
    text: "text-amber-700 dark:text-amber-300",
    border: "border-amber-200 dark:border-amber-800",
  },
};

export default function ReminderDetailModal({
  isOpen,
  onClose,
  reminder,
  onEdit,
}: ReminderDetailModalProps) {
  if (!reminder) return null;

  const categoryStyle = CATEGORY_COLORS[reminder.category] || {
    bg: "bg-slate-50 dark:bg-slate-800",
    text: "text-slate-700 dark:text-slate-300",
    border: "border-slate-200 dark:border-slate-700",
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
              Detalhes do Lembrete
            </h3>
            <p className="text-sm text-slate-500 font-normal">
              Informações completas do lembrete personalizado
            </p>
          </div>
        </div>
      }
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2 ml-auto">
            {onEdit && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  onEdit(reminder);
                  onClose();
                }}
              >
                <Edit2 size={14} />
                <span>Editar</span>
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={onClose}>
              Fechar
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800 text-sm">
        <div className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
            <Text size={15} className="text-slate-500 dark:text-slate-400" />
            Título do Lembrete
          </span>
          <div className="text-left sm:text-right">
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 text-base">
              {reminder.title}
            </span>
            {reminder.description && reminder.description !== reminder.message && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {reminder.description}
              </p>
            )}
          </div>
        </div>

        <div className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
            <Tag size={15} className="text-slate-500 dark:text-slate-400" />
            Categoria
          </span>
          <div>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${categoryStyle.bg} ${categoryStyle.text} ${categoryStyle.border}`}
            >
              {reminder.category}
            </span>
          </div>
        </div>

        <div className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2 shrink-0">
            <MessageSquare size={15} className="text-slate-500 dark:text-slate-400" />
            Mensagem da Notificação
          </span>
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 text-left sm:text-right">
            {reminder.message}
          </span>
        </div>

        <div className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
            <Clock size={15} className="text-slate-500 dark:text-slate-400" />
            Intervalo
          </span>
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            {reminder.interval}
          </span>
        </div>

        <div className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
            <Calendar size={15} className="text-slate-500 dark:text-slate-400" />
            Período
          </span>
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            {reminder.period}
          </span>
        </div>

        <div className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
            <Repeat size={15} className="text-slate-500 dark:text-slate-400" />
            Frequência
          </span>
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            {reminder.frequency}
          </span>
        </div>


        <div className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
            {reminder.status === "ativo" ? (
              <CheckCircle2 size={15} className="text-slate-500 dark:text-slate-400" />
            ) : (
              <XCircle size={15} className="text-slate-500 dark:text-slate-400" />
            )}
            Status
          </span>
          <div>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${reminder.status === "ativo"
                ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800"
                : "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700"
                }`}
            >
              {reminder.status === "ativo" ? "Ativo" : "Inativo"}
            </span>
          </div>
        </div>
      </div>
    </Modal>
  );
}
