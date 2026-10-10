import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import {
  applyTheme,
  parseThemePreference,
  readThemePreference,
  resolveTheme,
  saveThemePreference,
  SYSTEM_THEME_QUERY,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type ThemePreference,
} from "./theme";

interface ThemeContextValue {
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(readThemePreference);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia(SYSTEM_THEME_QUERY).matches);
  const resolvedTheme = resolveTheme(theme, systemDark);

  useLayoutEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  useEffect(() => {
    const media = window.matchMedia(SYSTEM_THEME_QUERY);
    const onSystemThemeChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    const onStorageChange = (event: StorageEvent) => {
      if (event.storageArea === window.localStorage && (event.key === THEME_STORAGE_KEY || event.key === null)) {
        setThemeState(parseThemePreference(event.newValue));
      }
    };

    media.addEventListener("change", onSystemThemeChange);
    window.addEventListener("storage", onStorageChange);
    setSystemDark(media.matches);
    return () => {
      media.removeEventListener("change", onSystemThemeChange);
      window.removeEventListener("storage", onStorageChange);
    };
  }, []);

  const setTheme = useCallback((preference: ThemePreference) => {
    setThemeState(preference);
    saveThemePreference(preference);
  }, []);
  const value = useMemo(() => ({ theme, resolvedTheme, setTheme }), [theme, resolvedTheme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme deve ser usado dentro de ThemeProvider.");
  return value;
}
