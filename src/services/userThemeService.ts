import { invoke, isTauri } from "@tauri-apps/api/core";
import type { ThemePreference } from "../theme/theme";

export const userThemeService = {
  getPreference: (): Promise<ThemePreference> => isTauri()
    ? invoke("get_user_theme_preference") : Promise.resolve("system"),
  updatePreference: (theme: ThemePreference): Promise<ThemePreference> =>
    isTauri() ? invoke("update_user_theme_preference", { payload: { theme } }) : Promise.resolve(theme),
};
