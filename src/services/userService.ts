import { invoke } from "@tauri-apps/api/core";
import type { LocalUser } from "../auth/authService";

export interface UpdateUserPayload {
  id: number;
  firstName: string;
  lastName: string;
  birthDate: string;
  email: string;
  phone: string;
  photo?: string | null;
}

export const userService = {
  isLocalUser: async (id: number): Promise<boolean> => {
    return await invoke<boolean>("is_local_user", { id });
  },

  updateUser: async (payload: UpdateUserPayload): Promise<LocalUser> => {
    return await invoke<LocalUser>("update_user", { payload });
  },
};
