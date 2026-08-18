import { useState } from "react";
import Header from "../components/Header";
import Table, { ColumnDef } from "../components/Table";
import Button from "../components/Button";
import ReminderDetailModal from "../components/ReminderDetailModal";
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
} from "lucide-react";

export interface ReminderItem {
    id: string;
    title: string;
    message: string;
    description?: string;
    category: "Postura" | "Hidratação" | "Pausa Visual" | "Exercício";
    interval: string;
    period: string;
    frequency: string;
    notificationTone: boolean;
    status: "ativo" | "inativo";
}

const INITIAL_REMINDERS: ReminderItem[] = [
    {
        id: "1",
        title: "Ajuste de Postura",
        message: "Mantenha a coluna reta e os pés apoiados no chão.",
        description: "Mantenha a coluna reta e os pés apoiados no chão.",
        category: "Postura",
        interval: "45 min",
        period: "08:00 - 18:00",
        frequency: "Segunda a Sexta",
        notificationTone: true,
        status: "ativo",
    },
    {
        id: "2",
        title: "Beber Água",
        message: "Beba 250ml de água para se manter hidratado.",
        description: "Beba 250ml de água para se manter hidratado.",
        category: "Hidratação",
        interval: "1 hora",
        period: "08:00 - 18:00",
        frequency: "Diariamente",
        notificationTone: false,
        status: "ativo",
    },
    {
        id: "3",
        title: "Pausa para os Olhos",
        message: "Olhe para um objeto distante por 20 segundos.",
        description: "Olhe para um objeto distante por 20 segundos.",
        category: "Pausa Visual",
        interval: "30 min",
        period: "09:00 - 17:00",
        frequency: "Segunda a Sexta",
        notificationTone: true,
        status: "ativo",
    },
    {
        id: "4",
        title: "Alongamento dos Punhos",
        message: "Realize exercícios leves de rotação nos punhos.",
        description: "Realize exercícios leves de rotação nos punhos.",
        category: "Exercício",
        interval: "2 horas",
        period: "08:00 - 18:00",
        frequency: "Dias Úteis",
        notificationTone: false,
        status: "inativo",
    },
];

export default function Reminders() {
    const [reminders, setReminders] = useState<ReminderItem[]>(INITIAL_REMINDERS);
    const [searchTerm, setSearchTerm] = useState("");
    const [categoryFilter, setCategoryFilter] = useState<string>("todos");
    const [selectedReminder, setSelectedReminder] = useState<ReminderItem | null>(null);

    const toggleStatus = (id: string) => {
        setReminders((prev) =>
            prev.map((item) =>
                item.id === id
                    ? { ...item, status: item.status === "ativo" ? "inativo" : "ativo" }
                    : item
            )
        );
    };

    const deleteReminder = (id: string) => {
        setReminders((prev) => prev.filter((item) => item.id !== id));
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
                    <span>{item.interval}</span>
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
            cell: (item) => (
                <span className="text-xs font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                    {item.frequency}
                </span>
            ),
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
                            setSelectedReminder(item);
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer"
                    >
                        <Edit2 size={16} />
                    </button>
                    <button
                        title="Excluir lembrete"
                        onClick={(e) => {
                            e.stopPropagation();
                            deleteReminder(item.id);
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
                    <Button variant="primary" size="md">
                        <Plus size={18} />
                        <span>Novo Lembrete</span>
                    </Button>
                }
            />

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

            <Table
                data={filteredReminders}
                columns={columns}
                keyExtractor={(item) => item.id}
                onRowClick={(item) => setSelectedReminder(item)}
                emptyMessage="Nenhum lembrete encontrado."
            />

            <ReminderDetailModal
                isOpen={Boolean(selectedReminder)}
                reminder={selectedReminder}
                onClose={() => setSelectedReminder(null)}
            />
        </div>
    );
}

