export interface PostureCalibrationDTO {
  id: string;
  userId?: string | null;
  cameraDeviceId: string | null;
  baselineNeckAngle: number;
  baselineShoulderBalance: number;
  baselineDistanceCm: number;
  baselineEyeDistancePx: number;
  isActive: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface SaveCalibrationPayload {
  userId?: string | null;
  cameraDeviceId: string;
  baselineNeckAngle: number;
  baselineShoulderBalance: number;
  baselineDistanceCm: number;
  baselineEyeDistancePx: number;
  isActive?: boolean;
}
