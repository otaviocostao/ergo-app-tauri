import type { DashboardData } from "../types/dashboard";
import { PostureStatus } from "../enums/postureStatus";

export const DEFAULT_DAILY_GOAL_MINUTES = 360;

/** Posture summaries close every 60 seconds; inference frequency is variable. */
const POSTURE_WINDOW_SECONDS = 60;

function coveredSeconds(windows: [number, number][]): number {
  let total = 0, coveredUntil = -Infinity;
  for (const [start, end] of windows.sort((a, b) => a[0] - b[0])) {
    total += Math.max(0, end - Math.max(start, coveredUntil));
    coveredUntil = Math.max(coveredUntil, end);
  }
  return total / 1000;
}

/** Calendar boundaries use the computer's local timezone, including offset changes. */
export function dashboardPeriod(now: Date) {
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
  const previousStart = new Date(dayStart); previousStart.setDate(previousStart.getDate() - 1);
  const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
  return { dayStart, previousStart, dayEnd, filter: { startTime: previousStart.toISOString(), endTime: dayEnd.toISOString() } };
}

export function buildDashboard(data: DashboardData, now: Date) {
  const typingSnapshots = data.typingSnapshots ?? [];
  const { dayStart, previousStart, dayEnd } = dashboardPeriod(now);
  const inPeriod = (timestamp: string, start: Date, end: Date) => {
    const time = Date.parse(timestamp);
    return time >= start.getTime() && time < end.getTime();
  };
  const summarize = (start: Date, end: Date) => {
    const posture = data.snapshots.filter(snapshot => inPeriod(snapshot.timestamp, start, end));
    const typing = typingSnapshots.filter(snapshot => inPeriod(snapshot.timestamp, start, end));
    const measuredIds = new Set([...posture, ...typing].map(snapshot => snapshot.sessionId));
    let seconds = 0, goodSeconds = 0, postureSeconds = 0, sessionCount = 0;
    for (const session of data.sessions) {
      if (!inPeriod(session.startedAt, start, end) && !measuredIds.has(session.id)) continue;
      sessionCount++;
      // Legacy sessions without saved windows retain their allocation to the local start day.
      // Otherwise use exact consolidated totals only for a complete local-day session.
      if (session.endedAt && inPeriod(session.startedAt, start, end) &&
        (Date.parse(session.endedAt) <= end.getTime() || !measuredIds.has(session.id))) {
        if (session.durationSeconds > 0) {
          seconds += session.durationSeconds;
          goodSeconds += session.durationSeconds * session.goodPosturePercentage / 100;
          postureSeconds += session.durationSeconds;
        }
        continue;
      }
      const windows: [number, number][] = [];
      const postureWindows: [number, number][] = [], goodWindows: [number, number][] = [];
      const windowFor = (timestamp: string, duration: number): [number, number] => {
        const savedAt = Date.parse(timestamp);
        return [Math.max(savedAt - duration * 1000, Date.parse(session.startedAt), start.getTime()),
          Math.min(savedAt, end.getTime(), session.endedAt ? Date.parse(session.endedAt) : now.getTime())];
      };
      for (const snapshot of posture.filter(item => item.sessionId === session.id)) {
        const window = windowFor(snapshot.timestamp, POSTURE_WINDOW_SECONDS);
        windows.push(window);
        if (snapshot.samplesCount <= 0 || ![PostureStatus.GOOD, PostureStatus.WARNING, PostureStatus.DANGER].includes(snapshot.dominantStatus as PostureStatus)) continue;
        postureWindows.push(window);
        // Snapshots retain a dominant status, not the individual frames' percentages.
        if (snapshot.dominantStatus === PostureStatus.GOOD) goodWindows.push(window);
      }
      for (const snapshot of typing.filter(item => item.sessionId === session.id)) {
        if (snapshot.windowDurationSeconds > 0) windows.push(windowFor(snapshot.timestamp, snapshot.windowDurationSeconds));
      }
      // Posture and keyboard share a session, so overlapping recorded windows count once.
      seconds += coveredSeconds(windows);
      postureSeconds += coveredSeconds(postureWindows);
      goodSeconds += coveredSeconds(goodWindows);
    }
    return { sessionCount, monitoredMinutes: seconds / 60, goodMinutes: goodSeconds / 60,
      posturePercent: postureSeconds > 0 ? goodSeconds / postureSeconds * 100 : null };
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
  const typing = typingSnapshots.filter(snapshot => inPeriod(snapshot.timestamp, dayStart, dayEnd));
  const pauses = typing.reduce((count, snapshot) => count + snapshot.microPausesCount, 0);
  const configuredGoal = data.dailyGoalMinutes ?? DEFAULT_DAILY_GOAL_MINUTES;
  const dailyGoalMinutes = Number.isInteger(configuredGoal) && configuredGoal > 0 && configuredGoal <= 1440
    ? configuredGoal : DEFAULT_DAILY_GOAL_MINUTES;
  return { ...today, alerts, pauses, dailyGoalMinutes, previousPosturePercent: summarize(previousStart, dayStart).posturePercent,
    hasData: today.sessionCount > 0 || samples.some(count => count > 0) || alerts > 0 || typing.length > 0,
    points: Array.from({ length: 24 }, (_, hour) => ({ label: `${String(hour).padStart(2, "0")}h`,
      value: samples[hour] ? totals[hour] / samples[hour] : null })),
  };
}
