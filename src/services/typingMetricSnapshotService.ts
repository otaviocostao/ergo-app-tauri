import { invoke, isTauri } from "@tauri-apps/api/core";
import type {
  CreateTypingSnapshotPayload,
  TypingMetricSnapshotItem,
  TypingSnapshotHistoryFilter,
} from "../types/typingMetricSnapshot";

export const typingMetricSnapshotService = {
  async recordSnapshot(
    payload: CreateTypingSnapshotPayload,
  ): Promise<TypingMetricSnapshotItem | null> {
    if (!isTauri()) {
      return null;
    }
    return await invoke<TypingMetricSnapshotItem>("record_typing_snapshot", {
      payload,
    });
  },

  async recordBatch(
    payloads: CreateTypingSnapshotPayload[],
  ): Promise<TypingMetricSnapshotItem[]> {
    if (!isTauri()) {
      return [];
    }
    return await invoke<TypingMetricSnapshotItem[]>(
      "record_typing_snapshots_batch",
      {
        payloads,
      },
    );
  },

  async getBySession(sessionId: string): Promise<TypingMetricSnapshotItem[]> {
    if (!isTauri()) {
      return [];
    }
    return await invoke<TypingMetricSnapshotItem[]>(
      "get_typing_snapshots_by_session",
      {
        sessionId,
      },
    );
  },

  async getHistory(
    filter: TypingSnapshotHistoryFilter = {},
  ): Promise<TypingMetricSnapshotItem[]> {
    if (!isTauri()) {
      return [];
    }
    return await invoke<TypingMetricSnapshotItem[]>("get_typing_history", {
      filter,
    });
  },

  async deleteSnapshot(id: string): Promise<boolean> {
    if (!isTauri()) {
      return false;
    }
    return await invoke<boolean>("delete_typing_snapshot", { id });
  },
};

