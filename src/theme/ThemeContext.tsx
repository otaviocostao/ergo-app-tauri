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
  getInitialThemePreference,
  rememberThemePreference,
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
  userId: number | null;
  theme: ThemePreference;
  status: "loading" | "ready" | "error";
  isSaving: boolean;
  error: string;
}

interface ThemeRequestScope {
  userId: number | null;
  active: boolean;
  ready: boolean;
  saving: boolean;
  savedTheme: ThemePreference;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { session, loading: authLoading } = useAuth();
  const userId = session.kind === "authenticated" ? session.user.id : null;
  const userIdRef = useRef(userId);
  const scopeRef = useRef<ThemeRequestScope | null>(null);
  const [account, setAccount] = useState<AccountTheme | null>(null);
  const [reloadIndex, setReloadIndex] = useState(0);
  const [initialTheme, setInitialTheme] = useState(getInitialThemePreference);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia(SYSTEM_THEME_QUERY).matches);

  const current = account?.userId === userId ? account : null;
  const theme = current?.status === "ready" ? current.theme : initialTheme;
  const isLoading = !authLoading && (!current || current.status === "loading");
  const isReady = userId !== null && current?.status === "ready";
  const isSaving = current?.isSaving ?? false;
  const error = current?.error ?? "";
  const resolvedTheme = resolveTheme(theme, systemDark);

  useLayoutEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  useLayoutEffect(() => {
    applyTheme(resolvedTheme);
    if (current?.status === "ready" && !current.isSaving) {
      rememberThemePreference(theme);
      setInitialTheme(theme);
    }
  }, [resolvedTheme, theme, current?.status, current?.isSaving]);

  useEffect(() => {
    if (authLoading) {
      scopeRef.current = null;
      setAccount(null);
      return;
    }

    const scope: ThemeRequestScope = {
      userId,
      active: true,
      ready: false,
      saving: false,
      savedTheme: "light",
    };
    scopeRef.current = scope;
    setAccount({
      userId,
      theme: "light",
      status: "loading",
      isSaving: false,
      error: "",
    });

    const isCurrent = () =>
      scope.active && scopeRef.current === scope && userIdRef.current === userId;

    const request =
      userId === null
        ? userThemeService.getStartupPreference()
        : userThemeService.getPreference();

    request
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
        setAccount({
          userId,
          theme: "light",
          status: "error",
          isSaving: false,
          error: "Não foi possível carregar sua preferência de tema. Tente novamente.",
        });
      });

    return () => {
      scope.active = false;
    };
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
        userIdRef.current !== userId ||
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

      const isCurrent = () =>
        scope.active && scopeRef.current === scope && userIdRef.current === scope.userId;

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
