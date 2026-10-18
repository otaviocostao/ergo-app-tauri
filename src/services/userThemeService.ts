import { invoke } from "@tauri-apps/api/core";
import type { ThemePreference } from "../theme/theme";

export const userThemeService = {
  getPreference: (): Promise<ThemePreference> => invoke("get_user_theme_preference"),
  updatePreference: (theme: ThemePreference): Promise<ThemePreference> =>
    invoke("update_user_theme_preference", { payload: { theme } }),
};
