import { invoke, isTauri } from "@tauri-apps/api/core";
import { Module } from "../enums/module";
import type { ReminderItem, SystemReminderType } from "./reminderService";

export interface ModuleSettings {
  id: string;
  userId: string;
  posturalAnalysis: boolean;
  ocularAnalysis: boolean;
  typingAnalysis: boolean;
  /** Device ID of the default webcam used by every visual analysis; null until one is chosen. */
  webCam: string | null;
  dailyGoalMinutes?: number;
  createdAt: string;
  updatedAt: string;
}

export type UpdateModuleSettingsPayload = Partial<Pick<ModuleSettings, "posturalAnalysis" | "ocularAnalysis" | "typingAnalysis" | "webCam" | "dailyGoalMinutes">>;
type ModuleField = "posturalAnalysis" | "ocularAnalysis" | "typingAnalysis";

const MODULE_FIELDS: Record<Module, ModuleField> = {
  [Module.POSTURAL_ANALYSIS]: "posturalAnalysis",
  [Module.OCULAR_ANALYSIS]: "ocularAnalysis",
  [Module.TYPING_ANALYSIS]: "typingAnalysis",
};

export const SETTINGS_UPDATED_EVENT = "ergo:settings-updated";
export interface SettingsUpdatedDetail {
  settings: ModuleSettings;
  fields: (keyof UpdateModuleSettingsPayload)[];
}

/** Keep retained monitoring and settings pages in sync without restarting unchanged sessions. */
function publishSettings(settings: ModuleSettings, fields: SettingsUpdatedDetail["fields"]): ModuleSettings {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<SettingsUpdatedDetail>(SETTINGS_UPDATED_EVENT, { detail: { settings, fields } }));
  }
  return settings;
}

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
  update: async (payload: UpdateModuleSettingsPayload): Promise<ModuleSettings> =>
    publishSettings(await invoke("update_settings", { payload }), Object.keys(payload) as SettingsUpdatedDetail["fields"]),
  setModuleEnabled: async (module: Module, enabled: boolean): Promise<ModuleSettings> =>
    publishSettings(await invoke("set_module_enabled", { payload: { module, enabled } }), [MODULE_FIELDS[module]]),
  setWebCam: async (webCam: string | null): Promise<ModuleSettings> =>
    publishSettings(await invoke("update_settings", { payload: { webCam } }), ["webCam"]),
  delete: (): Promise<boolean> => invoke("delete_settings"),
};
