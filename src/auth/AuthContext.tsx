import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { authErrorMessage, authService, type Session } from "./authService";

interface AuthContextValue {
  session: Session;
  loading: boolean;
  initializationError: string;
  login: (email: string, password: string) => Promise<void>;
  enterGuest: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>({ kind: "anonymous" });
  const [loading, setLoading] = useState(true);
  const [initializationError, setInitializationError] = useState("");

  useEffect(() => {
    let active = true;
    authService.getSession()
      .then((value) => { if (active) setSession(value); })
      .catch((error: unknown) => { if (active) setInitializationError(authErrorMessage(error)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const value: AuthContextValue = {
    session,
    loading,
    initializationError,
    async login(email, password) {
      setSession(await authService.login(email, password));
      setInitializationError("");
    },
    async enterGuest() {
      setSession(await authService.enterGuest());
      setInitializationError("");
    },
    async logout() {
      await authService.logout();
      setSession({ kind: "anonymous" });
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth deve ser usado dentro de AuthProvider.");
  return value;
}
