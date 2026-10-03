import { useEffect, useRef, useState, type ChangeEvent } from "react";
import Header from "../components/Header";
import Button from "../components/Button";
import Input from "../components/Input";
import Select from "../components/Select";
import { useAuth } from "../auth/AuthContext";
import { companyService, type CompanyItem } from "../services/companyService";

type SettingsTab = "usuario" | "empresa" | "tema" | "dispositivos";
type ThemeOption = "Claro" | "Escuro" | "Automático";

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
    return <div className="h-14 rounded-md border border-gray-200 bg-[linear-gradient(135deg,#ffffff_60%,#f4f6f9_60%)]" />;
  }

  if (theme === "Escuro") {
    return <div className="h-14 rounded-md bg-[linear-gradient(135deg,#101a2e_60%,#16233d_60%)]" />;
  }

  return <div className="h-14 rounded-md bg-[linear-gradient(90deg,#ffffff_50%,#101a2e_50%)]" />;
}

export default function Settings() {
  const { session } = useAuth();
  const user = session.kind === "authenticated" ? session.user : null;
  const [activeTab, setActiveTab] = useState<SettingsTab>("usuario");
  const [theme, setTheme] = useState<ThemeOption>("Claro");
  const [company, setCompany] = useState<CompanyItem | null>(null);
  const [isLoadingCompany, setIsLoadingCompany] = useState<boolean>(true);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const initials = user
    ? `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase()
    : "V";

  useEffect(() => {
    let isMounted = true;

    async function loadCompany() {
      try {
        const companies = await companyService.getAll();
        if (!isMounted) return;

        if (companies && companies.length > 0) {
          const currentCompany = companies.find((c) => c.active) ?? companies[0];
          setCompany(currentCompany);
        } else {
          setCompany(null);
        }
      } catch (error) {
        console.error("Erro ao carregar dados da empresa:", error);
        if (isMounted) {
          setCompany(null);
        }
      } finally {
        if (isMounted) {
          setIsLoadingCompany(false);
        }
      }
    }

    loadCompany();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isLoadingCompany && !company && activeTab === "empresa") {
      setActiveTab("usuario");
    }
  }, [isLoadingCompany, company, activeTab]);

  const tabs: Array<{ id: SettingsTab; label: string }> = [
    { id: "usuario", label: "Usuário" },
    ...(company ? [{ id: "empresa" as const, label: "Empresa" }] : []),
    { id: "tema", label: "Tema" },
    { id: "dispositivos", label: "Dispositivos" },
  ];

  const handlePhotoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => setProfilePhoto(reader.result as string);
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  return (
    <div className="w-full min-h-full pb-8">
      <Header
        title="Configurações"
        subtitle="Gerencie seu perfil, empresa, tema e ambiente de trabalho."
      />

      <div className="mb-6 flex gap-6 overflow-x-auto border-b border-gray-200 dark:border-slate-800">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`whitespace-nowrap border-b-2 px-0.5 py-3 text-sm transition-colors ${activeTab === tab.id
              ? "border-primary-500 font-semibold text-primary-500"
              : "border-transparent text-gray-500 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "usuario" && (
        <section className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-base font-bold text-slate-800 dark:text-white">Informações do usuário</h2>
          <p className="mb-5 mt-1 text-sm text-gray-500">Dados da conta disponíveis somente para leitura.</p>

          <div className="mb-5 flex items-center gap-3.5">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-50 text-lg font-bold text-primary-500">
              {profilePhoto ? (
                <img className="h-full w-full object-cover" src={profilePhoto} alt="Foto do perfil" />
              ) : (
                initials
              )}
            </div>
            <input
              ref={photoInputRef}
              className="hidden"
              type="file"
              accept="image/*"
              onChange={handlePhotoChange}
              aria-label="Selecionar foto do perfil"
            />
            <Button
              variant="secondary"
              size="sm"
              type="button"
              onClick={() => photoInputRef.current?.click()}
            >
              Alterar foto
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Nome" defaultValue={user?.firstName ?? "Visitante"} disabled />
            <Input label="Sobrenome" defaultValue={user?.lastName ?? ""} disabled />
            <Input label="Data de nascimento" type="date" defaultValue={user?.birthDate ?? ""} disabled />
            <Input label="E-mail" type="email" defaultValue={user?.email ?? ""} disabled />
            <Input label="Telefone" defaultValue={user?.phone ?? ""} disabled />
          </div>
        </section>
      )}

      {activeTab === "empresa" && company && (
        <section className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-base font-bold text-slate-800 dark:text-white">Informações da empresa</h2>
          <p className="mb-5 mt-1 text-sm text-gray-500">Dados gerenciados pelo administrador — somente leitura.</p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Razão Social" value={company.legalName ?? ""} disabled />
            <Input label="Nome Fantasia" value={company.tradeName ?? ""} disabled />
            <Input label="CNPJ" value={company.cnpj ?? ""} disabled />
            <Input label="Departamento" value={company.department ?? ""} disabled />
            <Input label="E-mail" type="email" value={company.email ?? ""} disabled />
            <Input label="Telefone" value={company.phone ?? ""} disabled />
            <Input label="CEP" value={company.zipcode ?? ""} disabled />
            <Input label="Logradouro" value={company.street ?? ""} disabled />
            <Input label="Número" value={company.number ?? ""} disabled />
            <Input label="Bairro" value={company.neighborhood ?? ""} disabled />
            <Input label="Cidade" value={company.city ?? ""} disabled />
            <Input label="Estado" value={company.state ?? ""} disabled />
            <Input label="País" value={company.country ?? ""} disabled />
            <Input label="Status" value={company.active ? "Ativo" : "Inativo"} disabled />
            {company.externalId && (
              <Input label="Código Externo" value={company.externalId} disabled />
            )}
          </div>
        </section>
      )}

      {activeTab === "tema" && (
        <section className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-base font-bold text-slate-800 dark:text-white">Tema</h2>
          <p className="mb-5 mt-1 text-sm text-gray-500">Escolha como o Ergo aparece para você.</p>

          <div className="grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-3">
            {(["Claro", "Escuro", "Automático"] as ThemeOption[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setTheme(option)}
                className={`rounded-lg border-2 p-3 text-left transition-colors ${theme === option
                  ? "border-primary-500"
                  : "border-gray-200 hover:border-primary-200 dark:border-slate-700"
                  }`}
              >
                <ThemePreview theme={option} />
                <span className="mt-2 block text-sm font-semibold text-slate-800 dark:text-slate-100">{option}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {activeTab === "dispositivos" && (
        <section className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-base font-bold text-slate-800 dark:text-white">Dispositivos</h2>
          <p className="mb-5 mt-1 text-sm text-gray-500">Informações usadas para calibrar o monitoramento ergonômico.</p>

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
