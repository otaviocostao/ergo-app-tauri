export interface PostureCalibrationDTO {
  id: string;
  userId?: number | null;
  baselineNeckAngle: number;
  baselineShoulderBalance: number;
  baselineDistanceCm: number;
  baselineEyeDistancePx: number;
  isActive: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface SaveCalibrationPayload {
  userId?: number | null;
  baselineNeckAngle: number;
  baselineShoulderBalance: number;
  baselineDistanceCm: number;
  baselineEyeDistancePx: number;
  isActive?: boolean;
}
