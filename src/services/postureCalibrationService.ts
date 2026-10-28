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
    if (!isTauri()) {
      return {
        id: "mock-calibration-id",
        userId: payload.userId ?? null,
        baselineNeckAngle: payload.baselineNeckAngle,
        baselineShoulderBalance: payload.baselineShoulderBalance,
        baselineDistanceCm: payload.baselineDistanceCm,
        baselineEyeDistancePx: payload.baselineEyeDistancePx,
        isActive: payload.isActive ?? true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
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
    if (!isTauri()) {
      return true;
    }
    return await invoke<boolean>("delete_posture_calibration", { id });
  },
};
