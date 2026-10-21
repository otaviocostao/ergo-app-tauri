import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "../auth/AuthContext";
import { userThemeService } from "../services/userThemeService";
import {
  applyTheme,
  resolveTheme,
  SYSTEM_THEME_QUERY,
  type ResolvedTheme,
  type ThemePreference,
} from "./theme";

interface ThemeContextValue {
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
  isLoading: boolean;
  isSaving: boolean;
  isReady: boolean;
  error: string;
  setTheme: (theme: ThemePreference) => Promise<void>;
  reloadTheme: () => void;
}

interface AccountTheme {
  userId: number;
  theme: ThemePreference;
  status: "loading" | "ready" | "error";
  isSaving: boolean;
  error: string;
}

interface ThemeRequestScope {
  userId: number;
  active: boolean;
  ready: boolean;
  saving: boolean;
  savedTheme: ThemePreference;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { session, loading: authLoading } = useAuth();
  const userId = session.kind === "authenticated" ? session.user.id : null;
  const scopeRef = useRef<ThemeRequestScope | null>(null);
  const [account, setAccount] = useState<AccountTheme | null>(null);
  const [reloadIndex, setReloadIndex] = useState(0);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia(SYSTEM_THEME_QUERY).matches);

  const current = !authLoading && account?.userId === userId ? account : null;
  const theme = current?.theme ?? "system";
  const isLoading = !authLoading && userId !== null && (!current || current.status === "loading");
  const isReady = userId !== null && current?.status === "ready";
  const isSaving = current?.isSaving ?? false;
  const error = current?.error ?? "";
  const resolvedTheme = resolveTheme(theme, systemDark);

  useLayoutEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  useLayoutEffect(() => {
    if (authLoading || userId === null) {
      scopeRef.current = null;
      return;
    }

    const scope: ThemeRequestScope = {
      userId,
      active: true,
      ready: false,
      saving: false,
      savedTheme: "system",
    };
    scopeRef.current = scope;

    return () => {
      // Invalidate at commit time, before an old promise can update the next account.
      scope.active = false;
      if (scopeRef.current === scope) {
        scopeRef.current = null;
      }
    };
  }, [authLoading, userId, reloadIndex]);

  useEffect(() => {
    const scope = scopeRef.current;
    if (!scope || userId === null) {
      setAccount(null);
      return;
    }

    setAccount((previous) => ({
      userId,
      theme: previous?.userId === userId ? previous.theme : "system",
      status: "loading",
      isSaving: false,
      error: "",
    }));

    const isCurrent = () => scope.active && scopeRef.current === scope;

    userThemeService.getPreference()
      .then((preference) => {
        if (!isCurrent()) return;
        scope.savedTheme = preference;
        scope.ready = true;
        setAccount({
          userId,
          theme: preference,
          status: "ready",
          isSaving: false,
          error: "",
        });
      })
      .catch(() => {
        if (!isCurrent()) return;
        setAccount((previous) => ({
          userId,
          theme: previous?.userId === userId ? previous.theme : "system",
          status: "error",
          isSaving: false,
          error: "Não foi possível carregar sua preferência de tema. Tente novamente.",
        }));
      });
  }, [authLoading, userId, reloadIndex]);

  useEffect(() => {
    const media = window.matchMedia(SYSTEM_THEME_QUERY);
    const onSystemThemeChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);

    media.addEventListener("change", onSystemThemeChange);
    setSystemDark(media.matches);

    return () => {
      media.removeEventListener("change", onSystemThemeChange);
    };
  }, []);

  const setTheme = useCallback(
    async (preference: ThemePreference) => {
      const scope = scopeRef.current;
      if (
        userId === null ||
        !scope ||
        !scope.active ||
        !scope.ready ||
        scope.saving ||
        scope.userId !== userId ||
        scope.savedTheme === preference
      ) {
        return;
      }

      scope.saving = true;
      setAccount({
        userId: scope.userId,
        theme: preference,
        status: "ready",
        isSaving: true,
        error: "",
      });

      const isCurrent = () => scope.active && scopeRef.current === scope;

      try {
        const saved = await userThemeService.updatePreference(preference);
        if (!isCurrent()) return;
        scope.savedTheme = saved;
        setAccount({
          userId: scope.userId,
          theme: saved,
          status: "ready",
          isSaving: false,
          error: "",
        });
      } catch {
        if (!isCurrent()) return;
        setAccount({
          userId: scope.userId,
          theme: scope.savedTheme,
          status: "ready",
          isSaving: false,
          error:
            "Não foi possível salvar sua preferência de tema. A escolha anterior foi mantida. Tente novamente.",
        });
      } finally {
        scope.saving = false;
      }
    },
    [userId],
  );

  const reloadTheme = useCallback(() => {
    setReloadIndex((index) => index + 1);
  }, []);

  const value = useMemo(
    () => ({
      theme,
      resolvedTheme,
      isLoading,
      isSaving,
      isReady,
      error,
      setTheme,
      reloadTheme,
    }),
    [
      theme,
      resolvedTheme,
      isLoading,
      isSaving,
      isReady,
      error,
      setTheme,
      reloadTheme,
    ],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme deve ser usado dentro de ThemeProvider.");
  return value;
}
