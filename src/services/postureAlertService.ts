import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  AlertFilter,
  CreateAlertPayload,
  PostureAlert,
  ResolveAlertPayload,
} from "../types/postureAlert";

export const postureAlertService = {
  async recordAlert(
    payload: CreateAlertPayload,
  ): Promise<PostureAlert | null> {
    if (!isTauri()) {
      return null;
    }
    return await invoke<PostureAlert>("record_posture_alert", { payload });
  },

  async resolveAlert(
    payload: ResolveAlertPayload,
  ): Promise<PostureAlert | null> {
    if (!isTauri()) {
      return null;
    }
    return await invoke<PostureAlert>("resolve_posture_alert", { payload });
  },

  async getBySession(sessionId: string): Promise<PostureAlert[]> {
    if (!isTauri()) {
      return [];
    }
    return await invoke<PostureAlert[]>("get_alerts_by_session", {
      sessionId,
    });
  },

  async getAlerts(filter: AlertFilter): Promise<PostureAlert[]> {
    if (!isTauri()) {
      return [];
    }
    return await invoke<PostureAlert[]>("get_posture_alerts", { filter });
  },

  async deleteAlert(id: string): Promise<boolean> {
    if (!isTauri()) {
      return false;
    }
    return await invoke<boolean>("delete_posture_alert", { id });
  },
};
