import Modal from "../Modal";
import Button from "../Button";
import Input from "../Input";
import Select from "../Select";
import { ReminderItem } from "../../pages/Reminders";
import { Tag, Calendar } from "lucide-react";

interface ReminderFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEdit?: (reminder: ReminderItem) => void;
  reminder: ReminderItem | null;
}

export default function ReminderFormModal({
  isOpen,
  onClose,
  onEdit,
  reminder
}: ReminderFormModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="2xl"
      title={
        <div className="flex items-center gap-2">
          <div>
            <h3 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              {onEdit == null ? 'Novo Lembrete' : 'Editar Lembrete'}
            </h3>
            <p className="text-sm text-slate-500 font-normal">
              {onEdit == null ? 'Crie um lembrete personalizado' : 'Edite seu lembrete personalizado'}
            </p>
          </div>
        </div>
      }
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2 ml-auto">
            <Button variant="secondary" size="md" onClick={onClose}>
              Fechar
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={() => {
                onClose();
              }}
            >
              <span>Salvar</span>
            </Button>
          </div>
        </div>
      }
      children={
        <div className="flex flex-col gap-4 text-sm">
          <Input
            label="Título"
            type="text"
            placeholder="Ex: Alongamento da Coluna"
            defaultValue={reminder?.title || ""}
            required
          />

          <Input
            label="Mensagem"
            type="text"
            placeholder="Ex: Mantenha a postura ereta e relaxe os ombros"
            defaultValue={reminder?.message || ""}
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* TODO - Analisar viabilidade dessa select-box de categorias*/}
            <Select
              label="Categoria"
              leftIcon={<Tag size={16} />}
              defaultValue={reminder?.category || "Postura"}
              options={[
                { label: "Postura", value: "Postura" },
                { label: "Hidratação", value: "Hidratação" },
                { label: "Pausa Visual", value: "Pausa Visual" },
              ]}
            />


          </div>

          <div className="grid grid-cols-3 gap-4">
            <Input
              label="Intervalo"
              type="text"
              placeholder="Ex: 45 min"
              defaultValue={reminder?.interval || ""}
            />
            <Input
              label="Início"
              type="time"
              defaultValue={reminder?.startTime || "08:00"}
            />
            <Input
              label="Fim"
              type="time"
              defaultValue={reminder?.endTime || "18:00"}
            />
          </div>

          <div className="flex gap-4">
            <Select
              label="Frequência"
              leftIcon={<Calendar size={16} />}
              defaultValue={reminder?.frequency || "Segunda a Sexta"}
              options={[
                { label: "Segunda a Sexta", value: "Segunda a Sexta" },
                { label: "Diariamente", value: "Diariamente" },
                { label: "Dias Úteis", value: "Dias Úteis" },
                { label: "Finais de Semana", value: "Finais de Semana" },
                { label: "Personalizado", value: "Personalizado" },
              ]}
            />

            {/* TODO - Exibir quando a frequencia selecionada for "Personalizado" */}
            <div className="flex flex-col">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Dias da semana
              </label>
              <div className="flex gap-2 align-center flex-1">
                <div className="flex gap-2">
                  <input type="checkbox" className="" />
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center justify-between select-none ">Dom</span>
                </div>
                <div className="flex gap-2">
                  <input type="checkbox" className="" />
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center justify-between select-none ">Seg</span>
                </div>
                <div className="flex gap-2">
                  <input type="checkbox" className="" />
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center justify-between select-none ">Ter</span>
                </div>
                <div className="flex gap-2">
                  <input type="checkbox" className="" />
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center justify-between select-none ">Qua</span>
                </div>
                <div className="flex gap-2">
                  <input type="checkbox" className="" />
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center justify-between select-none ">Qui</span>
                </div>
                <div className="flex gap-2">
                  <input type="checkbox" className="" />
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center justify-between select-none ">Sex</span>
                </div>
                <div className="flex gap-2">
                  <input type="checkbox" className="" />
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center justify-between select-none ">Sab</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <input type="checkbox" className="" />
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center justify-between select-none ">Enviar notificação silenciosa</span>
          </div>
        </div>
      }
    />
  );
}