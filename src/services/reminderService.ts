import { invoke } from "@tauri-apps/api/core";
import {
  ReminderFrequency,
  REMINDER_FREQUENCY_LABELS,
  REMINDER_FREQUENCY_OPTIONS,
  WeekDay,
  WEEK_DAY_LABELS,
  WEEK_DAYS_OPTIONS,
} from "../enums";

export {
  ReminderFrequency,
  REMINDER_FREQUENCY_LABELS,
  REMINDER_FREQUENCY_OPTIONS,
  WeekDay,
  WEEK_DAY_LABELS,
  WEEK_DAYS_OPTIONS,
};

export interface ReminderItem {
  id: string;
  title: string;
  message: string;
  description?: string;
  category: "Postura" | "Hidratação" | "Pausa Visual" | "Exercício" | string;
  interval: number;
  period: string;
  frequency: ReminderFrequency;
  notificationTone: boolean;
  status: "ativo" | "inativo" | string;
  startTime?: string;
  endTime?: string;
  reminderDate?: string;
  customDays?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateReminderPayload {
  title: string;
  message: string;
  description?: string;
  category: string;
  interval: number;
  period: string;
  frequency: ReminderFrequency;
  notificationTone?: boolean;
  status?: string;
  startTime?: string;
  endTime?: string;
  reminderDate?: string;
  customDays?: string[];
}

export interface UpdateReminderPayload {
  id: string;
  title?: string;
  message?: string;
  description?: string;
  category?: string;
  interval?: number;
  period?: string;
  frequency?: ReminderFrequency;
  notificationTone?: boolean;
  status?: string;
  startTime?: string;
  endTime?: string;
  reminderDate?: string;
  customDays?: string[];
}

export const reminderService = {
  async getAll(): Promise<ReminderItem[]> {
    return await invoke<ReminderItem[]>("get_reminders");
  },

  async getById(id: string): Promise<ReminderItem> {
    return await invoke<ReminderItem>("get_reminder_by_id", { id });
  },

  async create(payload: CreateReminderPayload): Promise<ReminderItem> {
    return await invoke<ReminderItem>("create_reminder", { payload });
  },

  async update(payload: UpdateReminderPayload): Promise<ReminderItem> {
    return await invoke<ReminderItem>("update_reminder", { payload });
  },

  async delete(id: string): Promise<boolean> {
    return await invoke<boolean>("delete_reminder", { id });
  },

  async toggleStatus(id: string): Promise<ReminderItem> {
    return await invoke<ReminderItem>("toggle_reminder_status", { id });
  },
};
