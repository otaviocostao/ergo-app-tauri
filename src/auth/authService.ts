import { invoke, isTauri } from "@tauri-apps/api/core";

export interface LocalUser {
  id: number;
  fullName: string;
  email: string;
}

export type Session =
  | { kind: "anonymous" }
  | { kind: "guest" }
  | { kind: "authenticated"; user: LocalUser };

export interface Registration {
  fullName: string;
  email: string;
  password: string;
}

export function authErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return "Não foi possível concluir a operação. Tente novamente.";
}

function requireDesktop() {
  if (!isTauri()) {
    throw new Error("Para cadastrar ou acessar sua conta local, abra o aplicativo Ergo pelo Tauri. No navegador, você pode continuar offline como visitante.");
  }
}

// No credentials or session flags are stored in localStorage. The Rust process
// owns the session; the browser-only preview supports guest navigation only.
export const authService = {
  getSession: (): Promise<Session> => isTauri() ? invoke("get_session") : Promise.resolve({ kind: "anonymous" }),
  async register(data: Registration): Promise<LocalUser> {
    requireDesktop();
    return invoke("register_local", { ...data });
  },
  async login(email: string, password: string): Promise<Session> {
    requireDesktop();
    return invoke("login_local", { email, password });
  },
  enterGuest: (): Promise<Session> => isTauri() ? invoke("continue_offline") : Promise.resolve({ kind: "guest" }),
  logout: (): Promise<void> => isTauri() ? invoke("logout") : Promise.resolve(),
};
