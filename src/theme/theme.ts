export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const SYSTEM_THEME_QUERY = "(prefers-color-scheme: dark)";
export const INITIAL_THEME_STORAGE_KEY = "ergo.initial-theme";

export const themeOptions: { value: ThemePreference; label: string; description: string }[] = [
  { value: "light", label: "Claro", description: "Sempre usar a aparência clara." },
  { value: "dark", label: "Escuro", description: "Sempre usar a aparência escura." },
  { value: "system", label: "Automático", description: "Acompanhar o tema do sistema." },
];

export function resolveTheme(theme: ThemePreference, systemDark: boolean): ResolvedTheme {
  return theme === "system" ? (systemDark ? "dark" : "light") : theme;
}

export function applyTheme(theme: ResolvedTheme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

export function initializeTheme(): void {
  applyTheme(resolveTheme(getInitialThemePreference(), window.matchMedia(SYSTEM_THEME_QUERY).matches));
}

export function getInitialThemePreference(): ThemePreference {
  try {
    const cached = window.localStorage.getItem(INITIAL_THEME_STORAGE_KEY);
    if (cached === "light" || cached === "dark" || cached === "system") {
      return cached;
    }
  } catch {
    // Storage may be unavailable; the system appearance still works.
  }
  return "system";
}

export function rememberThemePreference(theme: ThemePreference): void {
  try {
    // SQLite remains authoritative; this cache only supplies the initial paint.
    window.localStorage.setItem(INITIAL_THEME_STORAGE_KEY, theme);
  } catch {
    // A painting optimization must not prevent loading or saving preferences.
  }
}
