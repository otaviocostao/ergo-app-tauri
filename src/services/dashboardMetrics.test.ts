import { describe, expect, it } from "vitest";
import { buildDashboard, dashboardPeriod } from "./dashboardMetrics";
import type { DashboardData } from "../types/dashboard";
import type { MonitoringSessionItem } from "../types/monitoringSession";
import type { PostureMetricSnapshot } from "../types/postureMetricSnapshot";
import { PostureStatus } from "../enums/postureStatus";

const now = new Date(2026, 10, 3, 12);
const timestamp = (day: number, hour = 10) => new Date(2026, 10, day, hour).toISOString();
const session = (changes: Partial<MonitoringSessionItem> = {}): MonitoringSessionItem => ({ id: "s", userId: "00000000-0000-4000-8000-000000000001",
  startedAt: timestamp(3), endedAt: timestamp(3, 11), durationSeconds: 3600, averageScore: 80,
  goodPosturePercentage: 80, warningPosturePercentage: 20, dangerPosturePercentage: 0, totalAlertsCount: 0, ...changes });
const snapshot = (changes: Partial<PostureMetricSnapshot> = {}): PostureMetricSnapshot => ({ id: "m", sessionId: "s",
  timestamp: timestamp(3), avgNeckAngle: null, maxNeckAngle: null, avgShoulderBalance: 100,
  minShoulderBalance: 100, avgDistanceCm: null, blinkCount: 0, dominantStatus: PostureStatus.GOOD,
  score: 80, samplesCount: 600, ...changes });

describe("persisted dashboard aggregation", () => {
  it("returns unavailable percentages and hourly gaps for empty data", () => {
    const result = buildDashboard({ sessions: [], snapshots: [], alerts: [] }, now);
    expect(result.hasData).toBe(false);
    expect(result.posturePercent).toBeNull();
    expect(result.points.every(point => point.value === null)).toBe(true);
  });
  it("weights closed summaries by duration and excludes unmeasured and active defaults", () => {
    const result = buildDashboard({ sessions: [session(), session({ durationSeconds: 1800, goodPosturePercentage: 20 }),
      session({ endedAt: null, goodPosturePercentage: 100 }), session({ durationSeconds: 0 }),
      session({ startedAt: timestamp(2), goodPosturePercentage: 50 }), session({ startedAt: timestamp(4) })], snapshots: [], alerts: [] }, now);
    expect(result.monitoredMinutes).toBe(90);
    expect(result.goodMinutes).toBe(54);
    expect(result.posturePercent).toBe(60);
    expect(result.previousPosturePercent).toBe(50);
  });
  it("uses valid persisted scores despite NULL metrics and leaves missing hours unavailable", () => {
    const data: DashboardData = { sessions: [], alerts: [], snapshots: [snapshot(), snapshot({ score: 20, samplesCount: 300 }),
      snapshot({ score: 0, samplesCount: 0 }), snapshot({ timestamp: timestamp(2), score: 0 })] };
    const before = structuredClone(data);
    const result = buildDashboard(data, now);
    expect(result.points[10].value).toBe(60);
    expect(result.points[9].value).toBeNull();
    expect(data).toEqual(before);
    expect(data.snapshots[0].avgNeckAngle).toBeNull();
  });
  it("uses local midnight boundaries and counts alerts by timestamp rather than duplicated session totals", () => {
    const period = dashboardPeriod(now);
    expect(period.dayStart.getHours()).toBe(0);
    expect(period.dayEnd.getDate()).toBe(4);
    const result = buildDashboard({ sessions: [session({ totalAlertsCount: 99 })], snapshots: [], alerts: [
      { id: "a", sessionId: "s", timestamp: timestamp(3), alertType: "neck_posture", severity: "warning", durationSeconds: 20, message: "test" },
      { id: "b", sessionId: "s", timestamp: timestamp(4, 0), alertType: "neck_posture", severity: "warning", durationSeconds: 20, message: "test" },
    ] }, now);
    expect(result.alerts).toBe(1);
  });
});
