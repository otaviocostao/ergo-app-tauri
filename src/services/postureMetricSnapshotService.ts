import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  CreateSnapshotPayload,
  PostureMetricSnapshot,
  SnapshotHistoryFilter,
} from "../types/postureMetricSnapshot";

export const postureMetricSnapshotService = {
  async recordSnapshot(
    payload: CreateSnapshotPayload,
  ): Promise<PostureMetricSnapshot | null> {
    if (!isTauri()) {
      return null;
    }
    return await invoke<PostureMetricSnapshot>("record_metric_snapshot", {
      payload,
    });
  },

  async recordBatch(
    payloads: CreateSnapshotPayload[],
  ): Promise<PostureMetricSnapshot[]> {
    if (!isTauri()) {
      return [];
    }
    return await invoke<PostureMetricSnapshot[]>(
      "record_metric_snapshots_batch",
      {
        payloads,
      },
    );
  },

  async getBySession(sessionId: string): Promise<PostureMetricSnapshot[]> {
    if (!isTauri()) {
      return [];
    }
    return await invoke<PostureMetricSnapshot[]>("get_snapshots_by_session", {
      sessionId,
    });
  },

  async getHistory(
    filter: SnapshotHistoryFilter,
  ): Promise<PostureMetricSnapshot[]> {
    if (!isTauri()) {
      return [];
    }
    return await invoke<PostureMetricSnapshot[]>("get_posture_history", {
      filter,
    });
  },

  async deleteSnapshot(id: string): Promise<boolean> {
    if (!isTauri()) {
      return false;
    }
    return await invoke<boolean>("delete_metric_snapshot", { id });
  },
};
