import { invoke, isTauri } from "@tauri-apps/api/core";
import { Module } from "../enums/module";
import type { ReminderItem, SystemReminderType } from "./reminderService";

export interface ModuleSettings {
  id: number;
  userId: number;
  posturalAnalysis: boolean;
  ocularAnalysis: boolean;
  typingAnalysis: boolean;
  /** Device ID of the default webcam used by every visual analysis; null until one is chosen. */
  webCam: string | null;
  createdAt: string;
  updatedAt: string;
}

export type UpdateModuleSettingsPayload = Partial<Pick<ModuleSettings, "posturalAnalysis" | "ocularAnalysis" | "typingAnalysis" | "webCam">>;
type ModuleField = "posturalAnalysis" | "ocularAnalysis" | "typingAnalysis";

const MODULE_FIELDS: Record<Module, ModuleField> = {
  [Module.POSTURAL_ANALYSIS]: "posturalAnalysis",
  [Module.OCULAR_ANALYSIS]: "ocularAnalysis",
  [Module.TYPING_ANALYSIS]: "typingAnalysis",
};

/** Same links as the backend: disabling the module turns these notices off. */
export const NOTICE_MODULES: Record<SystemReminderType, Module> = {
  POSTURE_CHECK: Module.POSTURAL_ANALYSIS,
  VISUAL_BREAK: Module.OCULAR_ANALYSIS,
  MOVEMENT_BREAK: Module.POSTURAL_ANALYSIS,
};

/** Custom reminders follow their category; other categories (e.g. Hidratação) have no module. */
export const CATEGORY_MODULES: Readonly<Record<string, Module>> = {
  Postura: Module.POSTURAL_ANALYSIS,
  "Exercício": Module.POSTURAL_ANALYSIS,
  "Pausa Visual": Module.OCULAR_ANALYSIS,
};

export function reminderModule(reminder: Pick<ReminderItem, "systemType" | "category">): Module | null {
  return reminder.systemType ? NOTICE_MODULES[reminder.systemType] : CATEGORY_MODULES[reminder.category] ?? null;
}

/** Missing settings (browser preview, guest or still loading) mean the defaults: enabled. */
export function isModuleEnabled(settings: ModuleSettings | null | undefined, module: Module): boolean {
  return settings ? settings[MODULE_FIELDS[module]] : true;
}

export function withModuleEnabled(settings: ModuleSettings, module: Module, enabled: boolean): ModuleSettings {
  return { ...settings, [MODULE_FIELDS[module]]: enabled };
}

export const settingsService = {
  get: (): Promise<ModuleSettings | null> => isTauri() ? invoke("get_settings") : Promise.resolve(null),
  update: (payload: UpdateModuleSettingsPayload): Promise<ModuleSettings> => invoke("update_settings", { payload }),
  setModuleEnabled: (module: Module, enabled: boolean): Promise<ModuleSettings> =>
    invoke("set_module_enabled", { payload: { module, enabled } }),
  setWebCam: (webCam: string | null): Promise<ModuleSettings> => invoke("update_settings", { payload: { webCam } }),
  delete: (): Promise<boolean> => invoke("delete_settings"),
};
