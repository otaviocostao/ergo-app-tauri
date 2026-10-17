import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  CreateSessionPayload,
  EndSessionPayload,
  MonitoringSessionItem,
} from "../types/monitoringSession";

export const monitoringSessionService = {
  async startSession(
    payload?: CreateSessionPayload,
  ): Promise<MonitoringSessionItem | null> {
    if (!isTauri()) {
      return null;
    }
    return await invoke<MonitoringSessionItem>("start_monitoring_session", {
      payload: payload ?? null,
    });
  },

  async endSession(
    payload: EndSessionPayload,
  ): Promise<MonitoringSessionItem | null> {
    if (!isTauri()) {
      return null;
    }
    return await invoke<MonitoringSessionItem>("end_monitoring_session", {
      payload,
    });
  },

  async getAllSessions(
    userId?: number | null,
  ): Promise<MonitoringSessionItem[]> {
    if (!isTauri()) {
      return [];
    }
    return await invoke<MonitoringSessionItem[]>("get_monitoring_sessions", {
      userId: userId ?? null,
    });
  },

  async getSessionById(id: string): Promise<MonitoringSessionItem | null> {
    if (!isTauri()) {
      return null;
    }
    return await invoke<MonitoringSessionItem>("get_monitoring_session_by_id", {
      id,
    });
  },

  async getActiveSession(
    userId?: number | null,
  ): Promise<MonitoringSessionItem | null> {
    if (!isTauri()) {
      return null;
    }
    return await invoke<MonitoringSessionItem | null>(
      "get_active_monitoring_session",
      {
        userId: userId ?? null,
      },
    );
  },

  async deleteSession(id: string): Promise<boolean> {
    if (!isTauri()) {
      return false;
    }
    return await invoke<boolean>("delete_monitoring_session", { id });
  },
};
