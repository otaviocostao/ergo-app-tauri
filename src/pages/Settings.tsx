import { useState } from "react";
import Header from "../components/Header";
import Button from "../components/Button";
import Input from "../components/Input";
import Select from "../components/Select";

type SettingsTab = "usuario" | "empresa" | "tema" | "dispositivos";
type ThemeOption = "Claro" | "Escuro" | "Automático";

const tabs: Array<{ id: SettingsTab; label: string }> = [
  { id: "usuario", label: "Usuário" },
  { id: "empresa", label: "Empresa" },
  { id: "tema", label: "Tema" },
  { id: "dispositivos", label: "Dispositivos" },
];

const yesNoOptions = [
  { label: "Sim", value: "sim" },
  { label: "Não", value: "nao" },
];

const deviceOptions = [
  { label: "Notebook", value: "notebook" },
  { label: "Desktop", value: "desktop" },
  { label: "Tablet", value: "tablet" },
];

function ThemePreview({ theme }: { theme: ThemeOption }) {
  if (theme === "Claro") {
    return <div className="h-14 rounded-md border border-[#e6eaf0] bg-[linear-gradient(135deg,#ffffff_60%,#f4f6f9_60%)]" />;
  }

  if (theme === "Escuro") {
    return <div className="h-14 rounded-md bg-[linear-gradient(135deg,#101a2e_60%,#16233d_60%)]" />;
  }

  return <div className="h-14 rounded-md bg-[linear-gradient(90deg,#ffffff_50%,#101a2e_50%)]" />;
}

export default function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("usuario");
  const [theme, setTheme] = useState<ThemeOption>("Claro");
  const [saved, setSaved] = useState(false);

  return (
    <div className="w-full min-h-full bg-[#f4f6f9] pb-8 dark:bg-slate-950">
      <Header
        title="Configurações"
        subtitle="Gerencie seu perfil, empresa, tema e dispositivos conectados."
        action={
          <div className="inline-flex items-center gap-1.5 rounded-full bg-[#e6fbf7] px-3 py-1.5 text-xs font-semibold text-[#14b8a6]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#14b8a6]" />
            Sessão ativa
          </div>
        }
      />

      <div className="mb-6 flex gap-6 overflow-x-auto border-b border-[#e6eaf0] dark:border-slate-800">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`whitespace-nowrap border-b-2 px-0.5 py-3 text-sm transition-colors ${activeTab === tab.id
              ? "border-[#14b8a6] font-semibold text-[#14b8a6]"
              : "border-transparent text-[#64748b] hover:text-[#101a2e] dark:hover:text-slate-200"
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "usuario" && (
        <section className="rounded-xl border border-[#e6eaf0] bg-white p-5 shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-base font-bold text-[#101a2e] dark:text-white">Informações do usuário</h2>
          <p className="mb-5 mt-1 text-sm text-[#64748b]">Dados usados na sua conta e no monitoramento.</p>

          <div className="mb-5 flex items-center gap-3.5">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#e6fbf7] text-lg font-bold text-[#14b8a6]">LC</div>
            <Button variant="secondary" size="sm" type="button">Alterar foto</Button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Nome completo" defaultValue="Lucas Costa" />
            <Input label="Cargo" defaultValue="Analista de Operações" />
            <Input label="E-mail" type="email" defaultValue="lucas.costa@empresa.com" />
            <Input label="Telefone" defaultValue="(75) 99xxx-xxxx" />
          </div>

          <div className="mt-5 flex items-center gap-3">
            <Button type="button" onClick={() => setSaved(true)}>Salvar alterações</Button>
            {saved && <span className="text-xs font-medium text-[#14b8a6]">Alterações salvas</span>}
          </div>
        </section>
      )}

      {activeTab === "empresa" && (
        <section className="rounded-xl border border-[#e6eaf0] bg-white p-5 shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-base font-bold text-[#101a2e] dark:text-white">Informações da empresa</h2>
          <p className="mb-5 mt-1 text-sm text-[#64748b]">Dados gerenciados pelo administrador — somente leitura.</p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Empresa" defaultValue="Ergo Tecnologia Ltda." disabled />
            <Input label="Plano" defaultValue="Corporate — 250 licenças" disabled />
            <Input label="Departamento" defaultValue="Operações — Unidade Feira de Santana" disabled />
            <Input label="Administrador da conta" defaultValue="ti@empresa.com" disabled />
          </div>
        </section>
      )}

      {activeTab === "tema" && (
        <section className="rounded-xl border border-[#e6eaf0] bg-white p-5 shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-base font-bold text-[#101a2e] dark:text-white">Tema</h2>
          <p className="mb-5 mt-1 text-sm text-[#64748b]">Escolha como o Ergo aparece para você.</p>

          <div className="grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-3">
            {(["Claro", "Escuro", "Automático"] as ThemeOption[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setTheme(option)}
                className={`rounded-lg border-2 p-3 text-left transition-colors ${theme === option
                  ? "border-[#14b8a6]"
                  : "border-[#e6eaf0] hover:border-[#a7ddd5] dark:border-slate-700"
                  }`}
              >
                <ThemePreview theme={option} />
                <span className="mt-2 block text-sm font-semibold text-[#101a2e] dark:text-slate-100">{option}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {activeTab === "dispositivos" && (
        <section className="rounded-xl border border-[#e6eaf0] bg-white p-5 shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-base font-bold text-[#101a2e] dark:text-white">Dispositivos</h2>
          <p className="mb-5 mt-1 text-sm text-[#64748b]">Informações usadas para calibrar o monitoramento ergonômico.</p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select label="Qual seu dispositivo?" placeholder="Selecione" options={deviceOptions} />
            <Select label="Você utiliza um teclado externo?" placeholder="Selecione" options={yesNoOptions} />
            <Select label="Você utiliza um mouse externo?" placeholder="Selecione" options={yesNoOptions} />
            <Select label="Sua mesa tem regulagem de altura?" placeholder="Selecione" options={yesNoOptions} />
            <Select label="Sua cadeira tem regulagem de altura?" placeholder="Selecione" options={yesNoOptions} />
            <Select label="Seu monitor tem regulagem de altura?" placeholder="Selecione" options={yesNoOptions} />
          </div>
        </section>
      )}
    </div>
  );
}