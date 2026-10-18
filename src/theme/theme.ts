export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const SYSTEM_THEME_QUERY = "(prefers-color-scheme: dark)";

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
  // Wait for SQLite before displaying the login or the authenticated pages.
  applyTheme("light");
}
