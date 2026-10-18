export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

// Startup appearance only. Account preferences are persisted in SQLite.
export const THEME_STORAGE_KEY = "ergo.theme";
export const SYSTEM_THEME_QUERY = "(prefers-color-scheme: dark)";

export const themeOptions: { value: ThemePreference; label: string; description: string }[] = [
  { value: "light", label: "Claro", description: "Sempre usar a aparência clara." },
  { value: "dark", label: "Escuro", description: "Sempre usar a aparência escura." },
  { value: "system", label: "Automático", description: "Acompanhar o tema do sistema." },
];

export function parseThemePreference(value: string | null): ThemePreference {
  return value === "dark" || value === "system" ? value : "light";
}

export function readThemePreference(): ThemePreference {
  try {
    return parseThemePreference(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "light";
  }
}

export function saveThemePreference(theme: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Theme switching still works when persistent storage is unavailable.
  }
}

export function resolveTheme(theme: ThemePreference, systemDark: boolean): ResolvedTheme {
  return theme === "system" ? (systemDark ? "dark" : "light") : theme;
}

export function applyTheme(theme: ResolvedTheme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

export function initializeTheme(): void {
  applyTheme(resolveTheme(readThemePreference(), window.matchMedia(SYSTEM_THEME_QUERY).matches));
}
