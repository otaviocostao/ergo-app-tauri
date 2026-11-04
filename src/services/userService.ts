import { invoke } from "@tauri-apps/api/core";
import type { User } from "../auth/authService";

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
  canEditProfile: async (id: number): Promise<boolean> => {
    return await invoke<boolean>("is_local_user", { id });
  },

  updateUser: async (payload: UpdateUserPayload): Promise<User> => {
    return await invoke<User>("update_user", { payload });
  },
};
