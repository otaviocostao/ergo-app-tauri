import { invoke, isTauri } from "@tauri-apps/api/core";
import { getInitialThemePreference, type ThemePreference } from "../theme/theme";

export const userThemeService = {
  getStartupPreference: (): Promise<ThemePreference> => isTauri()
    ? invoke("get_startup_theme_preference") : Promise.resolve(getInitialThemePreference()),
  getPreference: (): Promise<ThemePreference> => isTauri()
    ? invoke("get_user_theme_preference") : Promise.resolve(getInitialThemePreference()),
  updatePreference: (theme: ThemePreference): Promise<ThemePreference> =>
    isTauri() ? invoke("update_user_theme_preference", { payload: { theme } }) : Promise.resolve(theme),
};
