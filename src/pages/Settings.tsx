import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Cloud, Laptop, Monitor, ShieldCheck } from "lucide-react";
import Header from "../components/Header";
import Button from "../components/Button";
import Input from "../components/Input";
import Select from "../components/Select";
import Toastr, { type ToastrType } from "../components/Toastr";
import { useAuth } from "../auth/AuthContext";
import { companyService, type CompanyItem } from "../services/companyService";
import { userService } from "../services/userService";
import { workspaceService, type WorkspaceItem } from "../services/workspaceService";
import { FormatterHelper } from "../helpers/FormatterHelper";

type SettingsTab = "usuario" | "empresa" | "tema" | "dispositivos";
type ThemeOption = "Claro" | "Escuro" | "Automático";

const yesNoOptions = [
  { label: "Sim", value: "sim" },
  { label: "Não", value: "nao" },
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
  const { session, refreshSession } = useAuth();
  const user = session.kind === "authenticated" ? session.user : null;
  const [activeTab, setActiveTab] = useState<SettingsTab>("usuario");
  const [theme, setTheme] = useState<ThemeOption>("Claro");
  const [company, setCompany] = useState<CompanyItem | null>(null);
  const [isLoadingCompany, setIsLoadingCompany] = useState<boolean>(true);

  // Estados do formulário de usuário
  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [birthDate, setBirthDate] = useState(user?.birthDate ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState(user?.phone ? FormatterHelper.formatPhone(user.phone) : "");
  const [profilePhoto, setProfilePhoto] = useState<string | null>(user?.photo ?? null);

  const [isLocalUser, setIsLocalUser] = useState<boolean | null>(null);
  const [isCheckingLocalUser, setIsCheckingLocalUser] = useState<boolean>(true);
  const [isSavingUser, setIsSavingUser] = useState<boolean>(false);
  const [userFeedback, setUserFeedback] = useState<{ type: ToastrType; message: string } | null>(null);

  // Estados do formulário de dispositivos/workspace
  const [workspace, setWorkspace] = useState<WorkspaceItem | null>(null);
  const [, setIsLoadingWorkspace] = useState<boolean>(true);
  const [deviceType, setDeviceType] = useState<"desktop" | "notebook">("notebook");
  const [isWebcamFront, setIsWebcamFront] = useState<boolean>(true);
  const [hasExternalKeyboard, setHasExternalKeyboard] = useState<boolean>(true);
  const [hasExternalMouse, setHasExternalMouse] = useState<boolean>(true);
  const [adjustableDesk, setAdjustableDesk] = useState<boolean>(false);
  const [adjustableChair, setAdjustableChair] = useState<boolean>(true);
  const [adjustableMonitor, setAdjustableMonitor] = useState<boolean>(true);
  const [isSavingWorkspace, setIsSavingWorkspace] = useState<boolean>(false);
  const [workspaceFeedback, setWorkspaceFeedback] = useState<{ type: ToastrType; message: string } | null>(null);

  const photoInputRef = useRef<HTMLInputElement>(null);
  const initials = user
    ? `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase()
    : "V";

  useEffect(() => {
    if (user) {
      setFirstName(user.firstName);
      setLastName(user.lastName);
      setBirthDate(user.birthDate);
      setEmail(user.email);
      setPhone(FormatterHelper.formatPhone(user.phone));
      setProfilePhoto(user.photo ?? null);
    }
  }, [user]);

  // Valida no backend se o usuário é estritamente local (sem external_id)
  useEffect(() => {
    let isMounted = true;

    async function checkUserType() {
      if (session.kind === "authenticated" && session.user) {
        setIsCheckingLocalUser(true);
        try {
          const isLocal = await userService.isLocalUser(session.user.id);
          if (isMounted) {
            setIsLocalUser(isLocal);
          }
        } catch (error) {
          console.error("Erro ao validar se o usuário é local:", error);
          if (isMounted) {
            setIsLocalUser(!session.user.externalId);
          }
        } finally {
          if (isMounted) {
            setIsCheckingLocalUser(false);
          }
        }
      } else {
        if (isMounted) {
          setIsLocalUser(false);
          setIsCheckingLocalUser(false);
        }
      }
    }

    checkUserType();

    return () => {
      isMounted = false;
    };
  }, [session]);

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

  useEffect(() => {
    let isMounted = true;

    async function loadWorkspace() {
      try {
        const workspaces = await workspaceService.getAll();
        if (!isMounted) return;

        if (workspaces && workspaces.length > 0) {
          const current = workspaces[0];
          setWorkspace(current);
          setDeviceType(current.deviceType);
          setIsWebcamFront(current.isWebcamFront);
          setHasExternalKeyboard(current.hasExternalKeyboard);
          setHasExternalMouse(current.hasExternalMouse);
          setAdjustableDesk(current.adjustableDesk);
          setAdjustableChair(current.adjustableChair);
          setAdjustableMonitor(current.adjustableMonitor);
        } else {
          setWorkspace(null);
        }
      } catch (error) {
        console.error("Erro ao carregar dados do workspace:", error);
      } finally {
        if (isMounted) {
          setIsLoadingWorkspace(false);
        }
      }
    }

    loadWorkspace();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (deviceType === "desktop") {
      setHasExternalKeyboard(true);
      setHasExternalMouse(true);
    }
  }, [deviceType]);

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
    reader.onload = () => {
      setProfilePhoto(reader.result as string);
      setUserFeedback(null);
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const handleRemovePhoto = () => {
    setProfilePhoto(null);
    setUserFeedback(null);
  };

  const handleResetUserForm = () => {
    if (user) {
      setFirstName(user.firstName);
      setLastName(user.lastName);
      setBirthDate(user.birthDate);
      setEmail(user.email);
      setPhone(FormatterHelper.formatPhone(user.phone));
      setProfilePhoto(user.photo ?? null);
      setUserFeedback(null);
    }
  };

  const handleSaveUser = async (event: FormEvent) => {
    event.preventDefault();
    if (!user || !isLocalUser || !isUserFormDirty) return;

    setUserFeedback(null);
    setIsSavingUser(true);

    try {
      await userService.updateUser({
        id: user.id,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        birthDate: birthDate.trim(),
        email: email.trim(),
        phone: phone.trim(),
        photo: profilePhoto,
      });

      await refreshSession();
      setUserFeedback({
        type: "success",
        message: "Dados atualizados com sucesso!",
      });
    } catch (error: unknown) {
      console.error("Erro ao salvar informações do usuário:", error);
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Não foi possível atualizar os dados. Tente novamente.";
      setUserFeedback({
        type: "error",
        message,
      });
    } finally {
      setIsSavingUser(false);
    }
  };

  const canEditUser = Boolean(user && isLocalUser && !isCheckingLocalUser);
  const isUserFormDirty = Boolean(
    user && (
      firstName !== user.firstName ||
      lastName !== user.lastName ||
      birthDate !== user.birthDate ||
      email !== user.email ||
      phone !== FormatterHelper.formatPhone(user.phone) ||
      (profilePhoto ?? null) !== (user.photo ?? null)
    )
  );

  const isWorkspaceFormDirty = Boolean(
    workspace
      ? (
        deviceType !== workspace.deviceType ||
        isWebcamFront !== workspace.isWebcamFront ||
        hasExternalKeyboard !== workspace.hasExternalKeyboard ||
        hasExternalMouse !== workspace.hasExternalMouse ||
        adjustableDesk !== workspace.adjustableDesk ||
        adjustableChair !== workspace.adjustableChair ||
        adjustableMonitor !== workspace.adjustableMonitor
      )
      : (
        deviceType !== "notebook" ||
        isWebcamFront !== true ||
        hasExternalKeyboard !== true ||
        hasExternalMouse !== true ||
        adjustableDesk !== false ||
        adjustableChair !== true ||
        adjustableMonitor !== true
      )
  );

  const handleResetWorkspaceForm = () => {
    if (workspace) {
      setDeviceType(workspace.deviceType);
      setIsWebcamFront(workspace.isWebcamFront);
      setHasExternalKeyboard(workspace.hasExternalKeyboard);
      setHasExternalMouse(workspace.hasExternalMouse);
      setAdjustableDesk(workspace.adjustableDesk);
      setAdjustableChair(workspace.adjustableChair);
      setAdjustableMonitor(workspace.adjustableMonitor);
    } else {
      setDeviceType("notebook");
      setIsWebcamFront(true);
      setHasExternalKeyboard(true);
      setHasExternalMouse(true);
      setAdjustableDesk(false);
      setAdjustableChair(true);
      setAdjustableMonitor(true);
    }
    setWorkspaceFeedback(null);
  };

  const handleSaveWorkspace = async (event: FormEvent) => {
    event.preventDefault();
    if (!isWorkspaceFormDirty) return;

    setWorkspaceFeedback(null);
    setIsSavingWorkspace(true);

    try {
      let savedWorkspace: WorkspaceItem;
      if (workspace?.id) {
        savedWorkspace = await workspaceService.update({
          id: workspace.id,
          deviceType,
          isWebcamFront,
          hasExternalKeyboard: deviceType === "desktop" ? true : hasExternalKeyboard,
          hasExternalMouse: deviceType === "desktop" ? true : hasExternalMouse,
          adjustableDesk,
          adjustableChair,
          adjustableMonitor,
        });
      } else {
        savedWorkspace = await workspaceService.create({
          deviceType,
          isWebcamFront,
          hasExternalKeyboard: deviceType === "desktop" ? true : hasExternalKeyboard,
          hasExternalMouse: deviceType === "desktop" ? true : hasExternalMouse,
          adjustableDesk,
          adjustableChair,
          adjustableMonitor,
        });
      }

      setWorkspace(savedWorkspace);
      setWorkspaceFeedback({
        type: "success",
        message: "Configurações de dispositivos salvas com sucesso!",
      });
    } catch (error: unknown) {
      console.error("Erro ao salvar configurações de dispositivos:", error);
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Não foi possível salvar as configurações. Tente novamente.";
      setWorkspaceFeedback({
        type: "error",
        message,
      });
    } finally {
      setIsSavingWorkspace(false);
    }
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
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-800 dark:text-white">Informações do usuário</h2>
                {canEditUser ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                    <ShieldCheck size={12} />
                    Conta local
                  </span>
                ) : user ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
                    <Cloud size={12} />
                    Sincronizado online
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-gray-500">
                {canEditUser
                  ? "Edite e salve suas informações cadastrais locais a qualquer momento"
                  : user
                    ? "Esta conta é gerenciada pela plataforma online e está disponível somente para leitura."
                    : "Dados da conta disponíveis somente para leitura em modo visitante."}
              </p>
            </div>
          </div>

          <Toastr
            isOpen={Boolean(userFeedback)}
            type={userFeedback?.type ?? "success"}
            message={userFeedback?.message ?? ""}
            onClose={() => setUserFeedback(null)}
          />

          <form onSubmit={handleSaveUser}>
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
                disabled={!canEditUser || isSavingUser}
              />
              <Button
                variant="secondary"
                size="sm"
                type="button"
                disabled={!canEditUser || isSavingUser}
                onClick={() => photoInputRef.current?.click()}
              >
                Alterar foto
              </Button>
              {canEditUser && profilePhoto && (
                <Button
                  variant="secondary"
                  size="sm"
                  type="button"
                  disabled={isSavingUser}
                  onClick={handleRemovePhoto}
                  className="text-slate-500 hover:text-rose-600 dark:hover:text-rose-400"
                >
                  Remover
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Nome"
                value={firstName}
                onChange={(e) => {
                  setFirstName(e.target.value);
                  setUserFeedback(null);
                }}
                disabled={!canEditUser || isSavingUser}
                required={canEditUser}
              />
              <Input
                label="Sobrenome"
                value={lastName}
                onChange={(e) => {
                  setLastName(e.target.value);
                  setUserFeedback(null);
                }}
                disabled={!canEditUser || isSavingUser}
                required={canEditUser}
              />
              <Input
                label="Data de nascimento"
                type="date"
                value={birthDate}
                onChange={(e) => {
                  setBirthDate(e.target.value);
                  setUserFeedback(null);
                }}
                disabled={!canEditUser || isSavingUser}
                required={canEditUser}
              />
              <Input
                label="E-mail"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setUserFeedback(null);
                }}
                disabled={!canEditUser || isSavingUser}
                required={canEditUser}
              />
              <Input
                label="Telefone"
                value={phone}
                onChange={(e) => {
                  setPhone(FormatterHelper.formatPhone(e.target.value));
                  setUserFeedback(null);
                }}
                disabled={!canEditUser || isSavingUser}
                required={canEditUser}
              />
            </div>

            {canEditUser && (
              <div className="mt-6 flex items-center justify-end gap-3 border-t border-gray-100 pt-4 dark:border-slate-800">
                {isUserFormDirty && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="md"
                    onClick={handleResetUserForm}
                    disabled={isSavingUser}
                  >
                    Descartar alterações
                  </Button>
                )}
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  isLoading={isSavingUser}
                  disabled={!isUserFormDirty || isSavingUser}
                >
                  Salvar alterações
                </Button>
              </div>
            )}
          </form>
        </section>
      )}


      {activeTab === "empresa" && company && (
        <section className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-base font-bold text-slate-800 dark:text-white">Informações da empresa</h2>
          <p className="mb-5 mt-1 text-sm text-gray-500">Dados da sua empresa cadastrados na plataforma online</p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Razão Social" value={company.legalName ?? ""} disabled />
            <Input label="Nome Fantasia" value={company.tradeName ?? ""} disabled />
            <Input label="CNPJ" value={FormatterHelper.formatCnpj(company.cnpj)} disabled />
            <Input label="Departamento" value={company.department ?? ""} disabled />
            <Input label="E-mail" type="email" value={company.email ?? ""} disabled />
            <Input label="Telefone" value={FormatterHelper.formatPhone(company.phone)} disabled />
            <Input label="CEP" value={FormatterHelper.formatCep(company.zipcode)} disabled />
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
          <p className="mb-5 mt-1 text-sm text-gray-500">Escolha como o Ergo aparece para você</p>

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
          <div className="mb-4">
            <h2 className="text-base font-bold text-slate-800 dark:text-white">Dispositivos</h2>
            <p className="mt-1 text-sm text-gray-500">
              Informações do seu ambiente de trabalho e periféricos usadas para calibrar o monitoramento ergonômico.
            </p>
          </div>

          <Toastr
            isOpen={Boolean(workspaceFeedback)}
            type={workspaceFeedback?.type ?? "success"}
            message={workspaceFeedback?.message ?? ""}
            onClose={() => setWorkspaceFeedback(null)}
          />

          <form onSubmit={handleSaveWorkspace} className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">
                Qual seu dispositivo?
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
                <button
                  type="button"
                  onClick={() => {
                    setDeviceType("desktop");
                    setWorkspaceFeedback(null);
                  }}
                  className={`flex items-center gap-3 p-3.5 rounded-xl border transition-all cursor-pointer text-left ${deviceType === "desktop"
                    ? "bg-primary-50 dark:bg-primary-950/40 border-primary-500 text-primary-900 dark:text-primary-200 ring-2 ring-primary-500/20"
                    : "bg-white dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600"
                    }`}
                >
                  <div
                    className={`p-2 rounded-lg ${deviceType === "desktop"
                      ? "bg-primary-500 text-white"
                      : "bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300"
                      }`}
                  >
                    <Monitor size={18} />
                  </div>
                  <div>
                    <div className="font-semibold text-sm">Computador de Mesa</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Desktop tradicional
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setDeviceType("notebook");
                    setWorkspaceFeedback(null);
                  }}
                  className={`flex items-center gap-3 p-3.5 rounded-xl border transition-all cursor-pointer text-left ${deviceType === "notebook"
                    ? "bg-primary-50 dark:bg-primary-950/40 border-primary-500 text-primary-900 dark:text-primary-200 ring-2 ring-primary-500/20"
                    : "bg-white dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600"
                    }`}
                >
                  <div
                    className={`p-2 rounded-lg ${deviceType === "notebook"
                      ? "bg-primary-500 text-white"
                      : "bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300"
                      }`}
                  >
                    <Laptop size={18} />
                  </div>
                  <div>
                    <div className="font-semibold text-sm">Notebook / Laptop</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Computador portátil
                    </div>
                  </div>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select
                label="Sua webcam está posicionada em frente a você?"
                value={isWebcamFront ? "sim" : "nao"}
                onChange={(e) => {
                  setIsWebcamFront(e.target.value === "sim");
                  setWorkspaceFeedback(null);
                }}
                options={yesNoOptions}
              />

              {deviceType === "notebook" && (
                <Select
                  label="Você utiliza um teclado externo?"
                  value={hasExternalKeyboard ? "sim" : "nao"}
                  onChange={(e) => {
                    setHasExternalKeyboard(e.target.value === "sim");
                    setWorkspaceFeedback(null);
                  }}
                  options={yesNoOptions}
                />
              )}

              {deviceType === "notebook" && (
                <Select
                  label="Você utiliza um mouse externo?"
                  value={hasExternalMouse ? "sim" : "nao"}
                  onChange={(e) => {
                    setHasExternalMouse(e.target.value === "sim");
                    setWorkspaceFeedback(null);
                  }}
                  options={yesNoOptions}
                />
              )}

              <Select
                label="Sua mesa possui regulagem de altura?"
                value={adjustableDesk ? "sim" : "nao"}
                onChange={(e) => {
                  setAdjustableDesk(e.target.value === "sim");
                  setWorkspaceFeedback(null);
                }}
                options={yesNoOptions}
              />

              <Select
                label="Sua cadeira possui regulagem de altura?"
                value={adjustableChair ? "sim" : "nao"}
                onChange={(e) => {
                  setAdjustableChair(e.target.value === "sim");
                  setWorkspaceFeedback(null);
                }}
                options={yesNoOptions}
              />

              <Select
                label="Seu monitor possui regulagem de altura?"
                value={adjustableMonitor ? "sim" : "nao"}
                onChange={(e) => {
                  setAdjustableMonitor(e.target.value === "sim");
                  setWorkspaceFeedback(null);
                }}
                options={yesNoOptions}
              />
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-gray-100 pt-4 dark:border-slate-800">
              {isWorkspaceFormDirty && (
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  onClick={handleResetWorkspaceForm}
                  disabled={isSavingWorkspace}
                >
                  Descartar alterações
                </Button>
              )}
              <Button
                type="submit"
                variant="primary"
                size="md"
                isLoading={isSavingWorkspace}
                disabled={!isWorkspaceFormDirty || isSavingWorkspace}
              >
                Salvar alterações
              </Button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}
