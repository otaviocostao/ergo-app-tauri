import { monitoringSessionService } from "./monitoringSessionService";
import { postureAlertService } from "./postureAlertService";
import { postureCalibrationService } from "./postureCalibrationService";
import { postureMetricSnapshotService } from "./postureMetricSnapshotService";

import type {
  CreateSessionPayload,
  EndSessionPayload,
  MonitoringSessionItem,
} from "../types/monitoringSession";
import type {
  AlertFilter,
  CreateAlertPayload,
  PostureAlert,
  ResolveAlertPayload,
} from "../types/postureAlert";
import type {
  PostureCalibrationDTO,
  SaveCalibrationPayload,
} from "../types/postureCalibration";
import type {
  CreateSnapshotPayload,
  PostureMetricSnapshot,
  SnapshotHistoryFilter,
} from "../types/postureMetricSnapshot";

export const postureService = {
  // Session
  startSession: (payload?: CreateSessionPayload): Promise<MonitoringSessionItem | null> =>
    monitoringSessionService.startSession(payload),
  endSession: (payload: EndSessionPayload): Promise<MonitoringSessionItem | null> =>
    monitoringSessionService.endSession(payload),
  getActiveSession: (userId?: number | null): Promise<MonitoringSessionItem | null> =>
    monitoringSessionService.getActiveSession(userId),
  getSessions: (userId?: number | null): Promise<MonitoringSessionItem[]> =>
    monitoringSessionService.getAllSessions(userId),
  getAllSessions: (userId?: number | null): Promise<MonitoringSessionItem[]> =>
    monitoringSessionService.getAllSessions(userId),

  // Snapshots
  recordSnapshot: (payload: CreateSnapshotPayload): Promise<PostureMetricSnapshot | null> =>
    postureMetricSnapshotService.recordSnapshot(payload),
  recordSnapshotBatch: (payloads: CreateSnapshotPayload[]): Promise<PostureMetricSnapshot[]> =>
    postureMetricSnapshotService.recordBatch(payloads),
  getSnapshotsBySession: (sessionId: string): Promise<PostureMetricSnapshot[]> =>
    postureMetricSnapshotService.getBySession(sessionId),
  getPostureHistory: (filter: SnapshotHistoryFilter): Promise<PostureMetricSnapshot[]> =>
    postureMetricSnapshotService.getHistory(filter),

  // Alerts
  recordAlert: (payload: CreateAlertPayload): Promise<PostureAlert | null> =>
    postureAlertService.recordAlert(payload),
  resolveAlert: (payload: ResolveAlertPayload): Promise<PostureAlert | null> =>
    postureAlertService.resolveAlert(payload),
  getAlertsBySession: (sessionId: string): Promise<PostureAlert[]> =>
    postureAlertService.getBySession(sessionId),
  getAlerts: (filter: AlertFilter): Promise<PostureAlert[]> =>
    postureAlertService.getAlerts(filter),
  deleteAlert: (id: string): Promise<boolean> =>
    postureAlertService.deleteAlert(id),

  // Calibration
  saveCalibration: (payload: SaveCalibrationPayload): Promise<PostureCalibrationDTO | null> =>
    postureCalibrationService.saveCalibration(payload),
  getActiveCalibration: (userId?: number | null): Promise<PostureCalibrationDTO | null> =>
    postureCalibrationService.getActiveCalibration(userId),
  getCalibrations: (): Promise<PostureCalibrationDTO[]> =>
    postureCalibrationService.getAllCalibrations(),
  getAllCalibrations: (): Promise<PostureCalibrationDTO[]> =>
    postureCalibrationService.getAllCalibrations(),
};

export {
  monitoringSessionService,
  postureAlertService,
  postureCalibrationService,
  postureMetricSnapshotService,
};
