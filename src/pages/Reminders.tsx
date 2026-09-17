import { useState, useEffect, useCallback } from "react";
import Header from "../components/Header";
import Table, { ColumnDef } from "../components/Table";
import Button from "../components/Button";
import ReminderDetailModal from "../components/Reminder/ReminderDetailModal";
import ReminderFormModal from "../components/Reminder/ReminderFormModal";
import ReminderDeleteModal from "../components/Reminder/ReminderDeleteModal";
import {
    reminderService,
    ReminderItem,
} from "../services/reminderService";
import {
    ReminderFrequency,
    REMINDER_FREQUENCY_LABELS,
    WeekDay,
    WEEK_DAY_LABELS,
} from "../enums";
import {
    Clock,
    Calendar,
    Plus,
    Search,
    Trash2,
    Edit2,
    CheckCircle2,
    XCircle,
    Filter,
    Loader2,
    AlertCircle,
    RotateCw,
} from "lucide-react";

export type { ReminderItem };

export default function Reminders() {
    const [reminders, setReminders] = useState<ReminderItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [categoryFilter, setCategoryFilter] = useState<string>("todos");
    const [selectedReminder, setSelectedReminder] = useState<ReminderItem | null>(null);
    const [editingReminder, setEditingReminder] = useState<ReminderItem | null>(null);
    const [deletingReminder, setDeletingReminder] = useState<ReminderItem | null>(null);
    const [isOpenFormReminderModal, setIsOpenFormReminderModal] = useState(false);

    const loadReminders = useCallback(async () => {
        try {
            setIsLoading(true);
            setErrorMessage(null);
            const data = await reminderService.getAll();
            setReminders(data);
        } catch (err) {
            console.error("Failed to load reminders from backend:", err);
            setErrorMessage("Não foi possível carregar os lembretes. Tente novamente.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadReminders();
    }, [loadReminders]);

    const handleConfirmDelete = async () => {
        if (!deletingReminder) return;
        try {
            await reminderService.delete(deletingReminder.id);
            setReminders((prev) => prev.filter((item) => item.id !== deletingReminder.id));
            if (selectedReminder?.id === deletingReminder.id) {
                setSelectedReminder(null);
            }
            setDeletingReminder(null);
        } catch (err) {
            console.error("Failed to delete reminder:", err);
            setErrorMessage("Erro ao excluir lembrete. Tente novamente.");
        }
    };

    const handleOpenNewReminderModal = () => {
        setEditingReminder(null);
        setIsOpenFormReminderModal(true);
    };

    const handleOpenEditReminderModal = (item: ReminderItem) => {
        setEditingReminder(item);
        setIsOpenFormReminderModal(true);
    };

    const handleSaveReminder = async (item: ReminderItem) => {
        if (editingReminder && editingReminder.id) {
            const updated = await reminderService.update({
                id: editingReminder.id,
                title: item.title,
                message: item.message,
                description: item.description,
                category: item.category,
                interval: item.interval,
                period: item.period,
                frequency: item.frequency,
                notificationTone: item.notificationTone,
                status: item.status,
                startTime: item.startTime,
                endTime: item.endTime,
                reminderDate: item.reminderDate,
                customDays: item.customDays,
            });

            setReminders((prev) =>
                prev.map((r) => (r.id === updated.id ? updated : r))
            );

            if (selectedReminder?.id === updated.id) {
                setSelectedReminder(updated);
            }
        } else {
            const created = await reminderService.create({
                title: item.title,
                message: item.message,
                description: item.description,
                category: item.category,
                interval: item.interval,
                period: item.period,
                frequency: item.frequency,
                notificationTone: item.notificationTone,
                status: item.status,
                startTime: item.startTime,
                endTime: item.endTime,
                reminderDate: item.reminderDate,
                customDays: item.customDays,
            });

            setReminders((prev) => [created, ...prev]);
        }
    };

    const toggleStatus = async (id: string) => {
        try {
            const updated = await reminderService.toggleStatus(id);
            setReminders((prev) =>
                prev.map((item) => (item.id === id ? updated : item))
            );

            if (selectedReminder?.id === id) {
                setSelectedReminder(updated);
            }
        } catch (err) {
            console.error("Failed to toggle reminder status:", err);
            setErrorMessage("Erro ao alterar o status do lembrete.");
        }
    };

    const filteredReminders = reminders.filter((item) => {
        const matchesSearch =
            item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.message.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesCategory =
            categoryFilter === "todos" || item.category === categoryFilter;
        return matchesSearch && matchesCategory;
    });

    const columns: ColumnDef<ReminderItem>[] = [
        {
            header: "Título",
            cell: (item) => (
                <div className="flex items-center gap-3">
                    <span className="text-sm text-slate-600 dark:text-slate-300 font-medium">
                        {item.title}
                    </span>
                </div>
            ),
        },
        {
            header: "Mensagem",
            cell: (item) => (
                <span
                    className="text-sm text-slate-600 dark:text-slate-300 max-w-xs truncate block"
                    title={item.message}
                >
                    {item.message}
                </span>
            ),
        },
        {
            header: "Intervalo",
            cell: (item) => (
                <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                    <Clock size={14} className="text-slate-400" />
                    <span>{item.interval} min</span>
                </div>
            ),
        },
        {
            header: "Período",
            cell: (item) => (
                <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                    <Calendar size={14} className="text-slate-400" />
                    <span>{item.period}</span>
                </div>
            ),
        },
        {
            header: "Frequência",
            cell: (item) => {
                const label = REMINDER_FREQUENCY_LABELS[item.frequency] || item.frequency;
                const formattedDate = item.reminderDate
                    ? item.reminderDate.split("-").reverse().join("/")
                    : null;

                return (
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                            {label}
                        </span>
                        {item.frequency === ReminderFrequency.CUSTOM && item.customDays && item.customDays.length > 0 && (
                            <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                                {item.customDays.map((d) => WEEK_DAY_LABELS[d as WeekDay] || d).join(", ")}
                            </span>
                        )}
                        {(item.frequency === ReminderFrequency.ONCE || item.reminderDate) && formattedDate && (
                            <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                                {formattedDate}
                            </span>
                        )}
                    </div>
                );
            },
        },
        {
            header: "Status",
            cell: (item) => (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        toggleStatus(item.id);
                    }}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors ${item.status === "ativo"
                        ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400"
                        }`}
                >
                    {item.status === "ativo" ? (
                        <>
                            <CheckCircle2 size={13} className="text-emerald-500" />
                            <span>Ativo</span>
                        </>
                    ) : (
                        <>
                            <XCircle size={13} className="text-slate-400" />
                            <span>Inativo</span>
                        </>
                    )}
                </button>
            ),
        },
        {
            header: "Ações",
            align: "right",
            cell: (item) => (
                <div className="flex items-center justify-end gap-1">
                    <button
                        title="Editar / Ver detalhes"
                        onClick={(e) => {
                            e.stopPropagation();
                            handleOpenEditReminderModal(item);
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer"
                    >
                        <Edit2 size={16} />
                    </button>
                    <button
                        title="Excluir lembrete"
                        onClick={(e) => {
                            e.stopPropagation();
                            setDeletingReminder(item);
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 transition-colors cursor-pointer"
                    >
                        <Trash2 size={16} />
                    </button>
                </div>
            ),
        },
    ];

    return (
        <div className="w-full h-full flex flex-col gap-6">
            <Header
                title="Lembretes Personalizados"
                subtitle="Gerencie seu envio de lembretes"
                action={
                    <Button variant="primary" size="md" onClick={handleOpenNewReminderModal}>
                        <Plus size={18} />
                        <span>Novo Lembrete</span>
                    </Button>
                }
            />

            {errorMessage && (
                <div className="flex items-center justify-between p-3 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-sm">
                    <div className="flex items-center gap-2">
                        <AlertCircle size={18} className="shrink-0" />
                        <span>{errorMessage}</span>
                    </div>
                    <button
                        onClick={loadReminders}
                        className="flex items-center gap-1 text-xs font-semibold underline hover:text-rose-800 dark:hover:text-rose-200 cursor-pointer"
                    >
                        <RotateCw size={13} />
                        <span>Recarregar</span>
                    </button>
                </div>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="relative w-full sm:w-80">
                    <Search
                        size={18}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                    />
                    <input
                        type="text"
                        placeholder="Buscar lembrete..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md text-slate-800 dark:text-slate-200 placeholder-slate-400"
                    />
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <Filter size={16} className="text-slate-400 hidden sm:block" />
                    <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl w-full sm:w-auto overflow-x-auto">
                        {["todos", "Postura", "Hidratação", "Pausa Visual", "Exercício"].map(
                            (cat) => (
                                <button
                                    key={cat}
                                    onClick={() => setCategoryFilter(cat)}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-all cursor-pointer ${categoryFilter === cat
                                        ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                                        }`}
                                >
                                    {cat === "todos" ? "Todos" : cat}
                                </button>
                            )
                        )}
                    </div>
                </div>
            </div>

            {isLoading ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                    <Loader2 size={32} className="animate-spin text-emerald-500 mb-3" />
                    <span className="text-sm">Carregando lembretes...</span>
                </div>
            ) : (
                <Table
                    data={filteredReminders}
                    columns={columns}
                    keyExtractor={(item) => item.id}
                    onRowClick={(item) => setSelectedReminder(item)}
                    emptyMessage="Nenhum lembrete encontrado."
                />
            )}

            <ReminderDetailModal
                isOpen={Boolean(selectedReminder)}
                reminder={selectedReminder}
                onClose={() => setSelectedReminder(null)}
            />

            <ReminderFormModal
                isOpen={isOpenFormReminderModal}
                reminder={editingReminder}
                onClose={() => {
                    setIsOpenFormReminderModal(false);
                    setEditingReminder(null);
                }}
                onSave={handleSaveReminder}
            />

            <ReminderDeleteModal
                isOpen={Boolean(deletingReminder)}
                reminderTitle={deletingReminder?.title}
                onClose={() => setDeletingReminder(null)}
                onConfirm={handleConfirmDelete}
            />
        </div>
    );
}
