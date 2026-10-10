export interface MonitoringSessionItem {
  id: string;
  userId?: number | null;
  startedAt: string;
  endedAt?: string | null;
  durationSeconds: number;
  averageScore: number;
  goodPosturePercentage: number;
  warningPosturePercentage: number;
  dangerPosturePercentage: number;
  totalAlertsCount: number;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface CreateSessionPayload {
  userId?: number | null;
  startedAt?: string | null;
}

export interface EndSessionPayload {
  id: string;
  endedAt?: string | null;
  durationSeconds?: number | null;
  averageScore?: number | null;
  goodPosturePercentage?: number | null;
  warningPosturePercentage?: number | null;
  dangerPosturePercentage?: number | null;
  totalAlertsCount?: number | null;
}

export interface UpdateSessionPayload {
  id: string;
  endedAt?: string | null;
  durationSeconds?: number | null;
  averageScore?: number | null;
  goodPosturePercentage?: number | null;
  warningPosturePercentage?: number | null;
  dangerPosturePercentage?: number | null;
  totalAlertsCount?: number | null;
}

export type CreateMonitoringSessionPayload = CreateSessionPayload;
export type EndMonitoringSessionPayload = EndSessionPayload;
export type UpdateMonitoringSessionPayload = UpdateSessionPayload;
export type MonitoringSessionDTO = MonitoringSessionItem;
