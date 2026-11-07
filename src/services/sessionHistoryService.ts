import { invoke, isTauri } from "@tauri-apps/api/core";
import type { SessionHistory } from "../types/sessionHistory";

export const sessionHistoryService = {
  async get(): Promise<SessionHistory> {
    if (!isTauri()) throw new Error("Abra o aplicativo Ergo para consultar o histórico salvo.");
    return invoke<SessionHistory>("get_session_history");
  },
};
