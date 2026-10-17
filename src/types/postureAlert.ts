export interface PostureAlert {
  id: string;
  sessionId: string;
  timestamp: string;
  alertType: string;
  severity: string;
  durationSeconds: number;
  persistentDurationSeconds?: number;
  message: string;
  resolvedAt?: string | null;
  createdAt?: string | null;
}

export type PostureAlertDTO = PostureAlert;

export interface CreateAlertPayload {
  sessionId: string;
  timestamp?: string | null;
  alertType: string;
  severity?: string | null;
  durationSeconds?: number | null;
  persistentDurationSeconds?: number | null;
  message: string;
}

export interface ResolveAlertPayload {
  id: string;
  resolvedAt?: string | null;
}

export interface AlertFilter {
  sessionId?: string | null;
  alertType?: string | null;
  severity?: string | null;
  unresolvedOnly?: boolean | null;
  startTime?: string | null;
  endTime?: string | null;
  limit?: number | null;
}
