import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  PostureCalibrationDTO,
  SaveCalibrationPayload,
} from "../types/postureCalibration";

export const postureCalibrationService = {
  async getActiveCalibration(
    userId?: number | null,
  ): Promise<PostureCalibrationDTO | null> {
    if (!isTauri()) {
      return null;
    }
    return await invoke<PostureCalibrationDTO | null>("get_active_calibration", {
      userId: userId ?? null,
    });
  },

  async saveCalibration(
    payload: SaveCalibrationPayload,
  ): Promise<PostureCalibrationDTO> {
    return await invoke<PostureCalibrationDTO>("save_posture_calibration", {
      payload,
    });
  },

  async getAllCalibrations(): Promise<PostureCalibrationDTO[]> {
    if (!isTauri()) {
      return [];
    }
    return await invoke<PostureCalibrationDTO[]>("get_posture_calibrations");
  },

  async deleteCalibration(id: string): Promise<boolean> {
    return await invoke<boolean>("delete_posture_calibration", { id });
  },
};
