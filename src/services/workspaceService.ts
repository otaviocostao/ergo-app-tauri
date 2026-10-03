import { invoke, isTauri } from "@tauri-apps/api/core";

export interface WorkspaceItem {
  id: string;
  deviceType: "desktop" | "notebook";
  isWebcamFront: boolean;
  hasExternalKeyboard: boolean;
  hasExternalMouse: boolean;
  adjustableDesk: boolean;
  adjustableChair: boolean;
  adjustableMonitor: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface CreateWorkspacePayload {
  deviceType?: "desktop" | "notebook";
  isWebcamFront?: boolean;
  hasExternalKeyboard?: boolean;
  hasExternalMouse?: boolean;
  adjustableDesk?: boolean;
  adjustableChair?: boolean;
  adjustableMonitor?: boolean;
}

export interface UpdateWorkspacePayload {
  id: string;
  deviceType?: "desktop" | "notebook";
  isWebcamFront?: boolean;
  hasExternalKeyboard?: boolean;
  hasExternalMouse?: boolean;
  adjustableDesk?: boolean;
  adjustableChair?: boolean;
  adjustableMonitor?: boolean;
}

export const workspaceService = {
  async getAll(): Promise<WorkspaceItem[]> {
    if (!isTauri()) {
      return [];
    }
    return await invoke<WorkspaceItem[]>("get_workspaces");
  },

  async getById(id: string): Promise<WorkspaceItem> {
    return await invoke<WorkspaceItem>("get_workspace_by_id", { id });
  },

  async create(payload: CreateWorkspacePayload): Promise<WorkspaceItem> {
    return await invoke<WorkspaceItem>("create_workspace", { payload });
  },

  async update(payload: UpdateWorkspacePayload): Promise<WorkspaceItem> {
    return await invoke<WorkspaceItem>("update_workspace", { payload });
  },

  async delete(id: string): Promise<boolean> {
    return await invoke<boolean>("delete_workspace", { id });
  },
};
