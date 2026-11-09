export interface MonitoringSessionItem {
  id: string;
  userId?: string | null;
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
  userId?: string | null;
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
