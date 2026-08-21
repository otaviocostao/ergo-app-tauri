import Modal from "../Modal";
import Button from "../Button";
import { AlertTriangle } from "lucide-react";

interface ReminderDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  reminderTitle?: string;
}

export default function ReminderDeleteModal({
  isOpen,
  onClose,
  onConfirm,
  reminderTitle,
}: ReminderDeleteModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="md"
      title={
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">
            <AlertTriangle size={20} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Excluir Lembrete
            </h3>
          </div>
        </div>
      }
      footer={
        <div className="flex items-center justify-end gap-2 w-full">
          <Button variant="secondary" size="md" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            size="md"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            Excluir
          </Button>
        </div>
      }
    >
      <div className="py-2 text-slate-600 dark:text-slate-300">
        <p className="text-sm">
          Deseja realmente excluir esse lembrete
          {reminderTitle ? (
            <>
              {" "}
              <strong className="text-slate-900 dark:text-slate-100 font-semibold">
                "{reminderTitle}"
              </strong>
            </>
          ) : null}
          ?
        </p>
      </div>
    </Modal>
  );
}
