import { useState } from "react";
import { AlertCircle, Eye, Keyboard, Loader2, PersonStanding, RotateCw, type LucideIcon } from "lucide-react";
import { useModuleSettings } from "../../hooks/useModuleSettings";
import { Module, MODULES, MODULE_DESCRIPTIONS, MODULE_LABELS } from "../../enums/module";
import { isModuleEnabled, settingsService, withModuleEnabled } from "../../services/settingsService";

const MODULE_ICONS: Record<Module, LucideIcon> = {
  [Module.POSTURAL_ANALYSIS]: PersonStanding,
  [Module.OCULAR_ANALYSIS]: Eye,
  [Module.TYPING_ANALYSIS]: Keyboard,
};

const MODULE_EFFECTS: Record<Module, string> = {
  [Module.POSTURAL_ANALYSIS]: "Ao desativar, os avisos “Revise sua postura” e “Mude de posição”, os lembretes de Postura e Exercício e os alertas de pescoço, ombros e distância também são desativados. A câmera é desligada se a análise ocular também estiver inativa.",
  [Module.OCULAR_ANALYSIS]: "Ao desativar, o aviso “Faça uma pausa visual”, os lembretes de Pausa Visual e os alertas de piscadas e distância também são desativados. A câmera é desligada se a análise postural também estiver inativa.",
  [Module.TYPING_ANALYSIS]: "Ao desativar, o card de atividade de digitação do Monitoramento fica inativo.",
};

export default function ModuleSettingsPanel() {
  const { settings, setSettings, isLoading, error, reload, userId } = useModuleSettings();
  const [pending, setPending] = useState<ReadonlySet<Module>>(() => new Set());
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleChange = async (module: Module, enabled: boolean) => {
    if (!settings || pending.has(module)) return;
    const owner = settings.userId;
    const previous = isModuleEnabled(settings, module);
    // Only this module's field is written back, so concurrent saves do not overwrite each other.
    const apply = (value: boolean) => setSettings((current) =>
      current?.userId === owner ? withModuleEnabled(current, module, value) : current);
    setPending((current) => new Set(current).add(module));
    setSaveError(null);
    apply(enabled);
    try {
      apply(isModuleEnabled(await settingsService.setModuleEnabled(module, enabled), module));
    } catch (saveFailure) {
      console.error("Failed to update module:", saveFailure);
      apply(previous);
      setSaveError("Não foi possível alterar o módulo. Tente novamente.");
    } finally {
      setPending((current) => {
        const next = new Set(current);
        next.delete(module);
        return next;
      });
    }
  };

  return (
    <section className="flex w-full flex-col gap-6 rounded-xl border border-gray-200 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
      <header>
        <h2 className="text-base font-bold text-slate-800 dark:text-white">Módulos</h2>
        <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
          Escolha quais análises o Ergo deve realizar. Ative ou desative cada módulo abaixo.
        </p>
      </header>

      {(saveError || error !== null) && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-300">
          <div className="flex items-center gap-2">
            <AlertCircle size={18} className="shrink-0" />
            <span>{saveError ?? "Não foi possível carregar os módulos. Tente novamente."}</span>
          </div>
          {saveError === null && (
            <button type="button" onClick={reload} className="flex cursor-pointer items-center gap-1 text-xs font-semibold underline hover:text-rose-800 dark:hover:text-rose-200">
              <RotateCw size={13} />
              <span>Recarregar</span>
            </button>
          )}
        </div>
      )}

      {userId === null ? (
        <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
          Entre com uma conta para escolher os módulos. Sem conta, todos os módulos ficam ativos.
        </p>
      ) : isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
          <Loader2 size={32} className="mb-3 animate-spin text-emerald-500" />
          <span className="text-sm">Carregando módulos...</span>
        </div>
      ) : settings && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {MODULES.map((module) => {
            const Icon = MODULE_ICONS[module];
            const active = isModuleEnabled(settings, module);
            const busy = pending.has(module);
            return (
              <article key={module} aria-busy={busy} className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-slate-50/60 p-5 dark:border-slate-700 dark:bg-slate-800/30">
                <div className="mb-4 flex size-10 items-center justify-center rounded-lg bg-primary-50 text-primary-700 dark:bg-primary-950/60 dark:text-primary-400">
                  <Icon size={21} aria-hidden="true" />
                </div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{MODULE_LABELS[module]}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{MODULE_DESCRIPTIONS[module]}</p>
                <p className="my-5 text-xs leading-5 text-slate-600 dark:text-slate-300">{MODULE_EFFECTS[module]}</p>

                <div className="mt-auto flex items-center border-t border-slate-200 pt-4 dark:border-slate-700">
                  <label className={`inline-flex items-center gap-2.5 ${busy ? "cursor-wait" : "cursor-pointer"}`}>
                    <input type="checkbox" role="switch" className="peer sr-only"
                      aria-label={`Módulo: ${MODULE_LABELS[module]}`} checked={active} disabled={busy}
                      onChange={(event) => handleChange(module, event.currentTarget.checked)} />
                    <span aria-hidden="true" className="relative h-6 w-11 shrink-0 rounded-full bg-slate-300 transition-colors after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:bg-primary-600 peer-checked:after:translate-x-5 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary-600 dark:bg-slate-600" />
                    <span className={`min-w-10 text-xs font-medium ${active ? "text-primary-700 dark:text-primary-400" : "text-slate-500 dark:text-slate-400"}`}>
                      {active ? "Ativo" : "Inativo"}
                    </span>
                  </label>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
