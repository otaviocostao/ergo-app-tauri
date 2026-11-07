import type { DashboardData } from "../types/dashboard";

/** Calendar boundaries use the computer's local timezone, including offset changes. */
export function dashboardPeriod(now: Date) {
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
  const previousStart = new Date(dayStart); previousStart.setDate(previousStart.getDate() - 1);
  const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
  return { dayStart, previousStart, dayEnd, filter: { startTime: previousStart.toISOString(), endTime: dayEnd.toISOString() } };
}

export function buildDashboard(data: DashboardData, now: Date) {
  const { dayStart, previousStart, dayEnd } = dashboardPeriod(now);
  const inPeriod = (timestamp: string, start: Date, end: Date) => {
    const time = Date.parse(timestamp);
    return time >= start.getTime() && time < end.getTime();
  };
  const summarize = (start: Date, end: Date) => {
    const sessions = data.sessions.filter(session => inPeriod(session.startedAt, start, end));
    let seconds = 0, goodSeconds = 0;
    for (const session of sessions) {
      // Active sessions still contain initial defaults; only closed, measured summaries count.
      if (!session.endedAt || session.durationSeconds <= 0) continue;
      seconds += session.durationSeconds;
      goodSeconds += session.durationSeconds * session.goodPosturePercentage / 100;
    }
    return { sessionCount: sessions.length, monitoredMinutes: seconds / 60, goodMinutes: goodSeconds / 60,
      posturePercent: seconds > 0 ? goodSeconds / seconds * 100 : null };
  };
  const totals = new Float64Array(24), samples = new Float64Array(24);
  for (const snapshot of data.snapshots) {
    if (!inPeriod(snapshot.timestamp, dayStart, dayEnd) || snapshot.samplesCount <= 0 || !Number.isFinite(snapshot.score)) continue;
    const hour = new Date(snapshot.timestamp).getHours();
    // Uses the recorded score; nullable anatomical metrics are neither coerced nor reclassified.
    totals[hour] += snapshot.score * snapshot.samplesCount;
    samples[hour] += snapshot.samplesCount;
  }
  const today = summarize(dayStart, dayEnd);
  const alerts = data.alerts.filter(alert => inPeriod(alert.timestamp, dayStart, dayEnd)).length;
  return { ...today, alerts, previousPosturePercent: summarize(previousStart, dayStart).posturePercent,
    hasData: today.sessionCount > 0 || samples.some(count => count > 0) || alerts > 0,
    points: Array.from({ length: 24 }, (_, hour) => ({ label: `${String(hour).padStart(2, "0")}h`,
      value: samples[hour] ? totals[hour] / samples[hour] : null })),
  };
}
