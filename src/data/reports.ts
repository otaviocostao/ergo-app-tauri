import type { MonitoringSessionItem } from "../types/monitoringSession";
import type { PostureAlert } from "../types/postureAlert";
import type { PostureMetricSnapshot } from "../types/postureMetricSnapshot";
import type { ReportData } from "../types/report";
import type { TypingMetricSnapshot } from "../types/typingMetricSnapshot";

export type ReportPeriod = "day" | "week" | "month";

export interface PostureSummary {
  averageScore: number | null;
  samplesCount: number;
  validSummaries: number;
  goodSummaries: number;
  warningSummaries: number;
  dangerSummaries: number;
  absentSummaries: number;
  unavailableSummaries: number;
  adequateSummaryPercentage: number | null;
  averageNeckDeviation: number | null;
  maximumNeckDeviation: number | null;
  averageShoulderBalance: number | null;
  minimumShoulderBalance: number | null;
  averageDistanceCm: number | null;
  blinkCount: number;
}

export interface TypingSummary {
  summaries: number;
  warningSummaries: number;
  dangerSummaries: number;
  windowSeconds: number;
  keystrokes: number;
  averageCpm: number | null;
  peakCpm: number | null;
  activeSeconds: number;
  microPauses: number;
  longestContinuousMinutes: number | null;
}

export interface ReportDay {
  date: string;
  sessions: MonitoringSessionItem[];
  sessionSeconds: number;
  postureSnapshots: PostureMetricSnapshot[];
  typingSnapshots: TypingMetricSnapshot[];
  alerts: PostureAlert[];
}

export interface ReportSummary extends PostureSummary {
  hasData: boolean;
  days: number;
  sessionCount: number;
  openSessions: number;
  sessionSeconds: number;
  alerts: number;
  criticalAlerts: number;
  typing: TypingSummary;
}

export interface PostureReport {
  period: ReportPeriod;
  start: string;
  end: string;
  previousStart: string;
  previousEnd: string;
  partial: boolean;
  days: ReportDay[];
  summary: ReportSummary;
  previous: ReportSummary;
  points: { label: string; value: number | null }[];
  hours: {
    hour: number;
    averageScore: number | null;
    summaries: number;
    cells: { minute: number; percent: number | null; summaries: number }[];
  }[];
}

export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function parseDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

export function isDateKey(value: string | null): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && dateKey(parseDate(value)) === value;
}

export function addDays(date: Date, amount: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

export function formatDate(value: string, options: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short" }): string {
  return parseDate(value).toLocaleDateString("pt-BR", options);
}

export function formatMinutes(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const minutes = Math.max(0, Math.round(value));
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h${minutes % 60 ? String(minutes % 60).padStart(2, "0") : ""}` : `${minutes} min`;
}

export function formatDuration(seconds: number): string {
  return seconds > 0 && seconds < 60 ? `${Math.round(seconds)} s` : formatMinutes(seconds / 60);
}

export function formatPercent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value)}%`;
}

export function formatScore(value: number | null): string {
  return value === null ? "—" : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}/100`;
}

export function formatTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** SQLite default timestamps are UTC, including values without an explicit offset. */
export function storedTime(value: string): number {
  return Date.parse(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(value)
    ? `${value.replace(" ", "T")}Z` : value);
}

export function periodBounds(period: ReportPeriod, anchor: string) {
  const start = parseDate(anchor);
  if (period === "week") start.setDate(start.getDate() - start.getDay());
  if (period === "month") start.setDate(1);
  const end = period === "month"
    ? new Date(start.getFullYear(), start.getMonth() + 1, 0, 12)
    : addDays(start, period === "week" ? 6 : 0);
  return { start, end };
}

export function shiftPeriod(period: ReportPeriod, anchor: string, direction: number): string {
  const { start } = periodBounds(period, anchor);
  if (period === "month") start.setMonth(start.getMonth() + direction);
  else start.setDate(start.getDate() + direction * (period === "week" ? 7 : 1));
  return dateKey(start);
}

function midnight(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function reportRange(period: ReportPeriod, anchor: string, now = new Date()) {
  const { start, end: fullEnd } = periodBounds(period, anchor);
  const currentStart = midnight(start);
  const fullEndExclusive = midnight(addDays(fullEnd, 1));
  const currentEnd = new Date(Math.max(currentStart.getTime(), Math.min(fullEndExclusive.getTime(), now.getTime())));
  const end = currentEnd < fullEndExclusive ? midnight(now) : midnight(fullEnd);
  const partial = currentEnd < fullEndExclusive;
  const previousStart = midnight(parseDate(shiftPeriod(period, dateKey(start), -1)));
  const previousFullEnd = periodBounds(period, dateKey(previousStart)).end;
  const elapsedDays = Math.round((Date.UTC(end.getFullYear(), end.getMonth(), end.getDate())
    - Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) / 86400000);
  const candidate = addDays(previousStart, elapsedDays);
  const previousEnd = partial && candidate <= previousFullEnd ? candidate : midnight(previousFullEnd);
  const previousEndExclusive = partial && candidate <= previousFullEnd
    ? new Date(previousEnd.getFullYear(), previousEnd.getMonth(), previousEnd.getDate(), now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds())
    : midnight(addDays(previousFullEnd, 1));
  return {
    currentStart, currentEnd, previousStart, previousEndExclusive,
    start: dateKey(start), end: dateKey(end), previousStartKey: dateKey(previousStart),
    previousEnd: dateKey(previousEnd), partial,
    // Fetch both periods together, then exclude future and non-comparable dates below.
    filter: { startTime: previousStart.toISOString(), endTime: midnight(addDays(end, 1)).toISOString() },
  };
}

const finite = (value: number | null): value is number => value !== null && Number.isFinite(value);
const mean = (values: (number | null)[]) => {
  const measured = values.filter(finite);
  return measured.length ? measured.reduce((sum, value) => sum + value, 0) / measured.length : null;
};
const extreme = (values: (number | null)[], choose: (...values: number[]) => number) => {
  const measured = values.filter(finite);
  return measured.length ? measured.reduce((result, value) => choose(result, value)) : null;
};

export function summarizePosture(snapshots: PostureMetricSnapshot[]): PostureSummary {
  const valid = snapshots.filter(item => item.samplesCount > 0 && ["good", "warning", "danger"].includes(item.dominantStatus));
  const validSet = new Set(valid);
  const scored = valid.filter(item => Number.isFinite(item.score) && item.score >= 0 && item.score <= 100);
  const samplesCount = scored.reduce((sum, item) => sum + item.samplesCount, 0);
  const goodSummaries = valid.filter(item => item.dominantStatus === "good").length;
  return {
    averageScore: samplesCount ? scored.reduce((sum, item) => sum + item.score * item.samplesCount, 0) / samplesCount : null,
    samplesCount, validSummaries: valid.length, goodSummaries,
    warningSummaries: valid.filter(item => item.dominantStatus === "warning").length,
    dangerSummaries: valid.filter(item => item.dominantStatus === "danger").length,
    absentSummaries: snapshots.filter(item => item.dominantStatus === "absent").length,
    unavailableSummaries: snapshots.filter(item => item.dominantStatus !== "absent" && !validSet.has(item)).length,
    adequateSummaryPercentage: valid.length ? goodSummaries / valid.length * 100 : null,
    // Anatomical sample counts are not stored per metric: average the saved means.
    averageNeckDeviation: mean(valid.map(item => item.avgNeckAngle)),
    maximumNeckDeviation: extreme(valid.map(item => item.maxNeckAngle), Math.max),
    averageShoulderBalance: mean(valid.map(item => item.avgShoulderBalance)),
    minimumShoulderBalance: extreme(valid.map(item => item.minShoulderBalance), Math.min),
    averageDistanceCm: mean(valid.map(item => item.avgDistanceCm)),
    blinkCount: valid.reduce((sum, item) => sum + item.blinkCount, 0),
  };
}

function summarizeTyping(snapshots: TypingMetricSnapshot[]): TypingSummary {
  const valid = snapshots.filter(item => item.windowDurationSeconds > 0);
  const windowSeconds = valid.reduce((sum, item) => sum + item.windowDurationSeconds, 0);
  return {
    summaries: valid.length, windowSeconds,
    warningSummaries: valid.filter(item => item.dominantStatus === "warning").length,
    dangerSummaries: valid.filter(item => item.dominantStatus === "danger").length,
    keystrokes: valid.reduce((sum, item) => sum + item.keystrokesCount, 0),
    averageCpm: windowSeconds ? valid.reduce((sum, item) => sum + item.cadenceCpm * item.windowDurationSeconds, 0) / windowSeconds : null,
    peakCpm: extreme(valid.map(item => item.peakCpm), Math.max),
    activeSeconds: valid.reduce((sum, item) => sum + item.activeTypingSeconds, 0),
    microPauses: valid.reduce((sum, item) => sum + item.microPausesCount, 0),
    longestContinuousMinutes: extreme(valid.map(item => item.continuousTypingMinutes), Math.max),
  };
}

export function hasDayData(day: ReportDay): boolean {
  return day.sessions.length + day.postureSnapshots.length + day.typingSnapshots.length + day.alerts.length > 0;
}

export function summarize(days: ReportDay[]): ReportSummary {
  const sessions = new Map(days.flatMap(day => day.sessions).map(item => [item.id, item]));
  const alerts = days.flatMap(day => day.alerts);
  return {
    ...summarizePosture(days.flatMap(day => day.postureSnapshots)),
    hasData: days.some(hasDayData), days: days.filter(hasDayData).length,
    sessionCount: sessions.size,
    openSessions: [...sessions.values()].filter(item => !item.endedAt).length,
    sessionSeconds: days.reduce((sum, day) => sum + day.sessionSeconds, 0),
    alerts: alerts.length,
    criticalAlerts: alerts.filter(item => item.severity.toLowerCase() === "danger").length,
    typing: summarizeTyping(days.flatMap(day => day.typingSnapshots)),
  };
}

function periodDays(data: ReportData, from: Date, to: Date, lastDay: string): ReportDay[] {
  const days: ReportDay[] = [];
  for (let date = midnight(from); dateKey(date) <= lastDay; date = addDays(date, 1)) {
    days.push({ date: dateKey(date), sessions: [], sessionSeconds: 0, postureSnapshots: [], typingSnapshots: [], alerts: [] });
  }
  const byDate = new Map(days.map(day => [day.date, day]));
  const belongs = (timestamp: string) => {
    const time = storedTime(timestamp);
    return time >= from.getTime() && time < to.getTime() ? byDate.get(dateKey(new Date(time))) : undefined;
  };
  data.postureSnapshots.forEach(item => belongs(item.timestamp)?.postureSnapshots.push(item));
  data.typingSnapshots.forEach(item => belongs(item.timestamp)?.typingSnapshots.push(item));
  data.alerts.forEach(item => belongs(item.timestamp)?.alerts.push(item));
  const recordedSessions = new Map(days.map(day => [day.date, new Set([
    ...day.postureSnapshots.map(item => item.sessionId),
    ...day.typingSnapshots.map(item => item.sessionId),
    ...day.alerts.map(item => item.sessionId),
  ])]));
  for (const session of data.sessions) {
    const start = storedTime(session.startedAt);
    const end = session.endedAt ? storedTime(session.endedAt) : to.getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    for (const day of days) {
      const dayStart = midnight(parseDate(day.date)).getTime();
      const dayEnd = addDays(new Date(dayStart), 1).getTime();
      const overlap = Math.max(0, Math.min(end, dayEnd, to.getTime()) - Math.max(start, dayStart, from.getTime()));
      const startsInDay = start >= Math.max(dayStart, from.getTime()) && start < Math.min(dayEnd, to.getTime());
      const hasSavedRecords = recordedSessions.get(day.date)!.has(session.id);
      // An old, unclosed row may be left by an interrupted application. Do not
      // extrapolate it into activity on later days without saved observations.
      if (session.endedAt ? overlap > 0 || startsInDay : startsInDay || hasSavedRecords) day.sessions.push(session);
      if (session.endedAt && end > start && session.durationSeconds > 0 && overlap > 0) {
        day.sessionSeconds += session.durationSeconds * overlap / (end - start);
      }
    }
  }
  return days;
}

export function buildReport(data: ReportData, period: ReportPeriod, anchor: string, now = new Date()): PostureReport {
  const range = reportRange(period, anchor, now);
  const days = periodDays(data, range.currentStart, range.currentEnd, range.end);
  const previousDays = periodDays(data, range.previousStart, range.previousEndExclusive, range.previousEnd);
  const buckets = Array.from({ length: 144 }, () => [] as PostureMetricSnapshot[]);
  for (const snapshot of days.flatMap(day => day.postureSnapshots)) {
    const time = new Date(storedTime(snapshot.timestamp));
    buckets[time.getHours() * 6 + Math.floor(time.getMinutes() / 10)].push(snapshot);
  }
  const hours = Array.from({ length: 24 }, (_, hour) => {
    const cells = buckets.slice(hour * 6, hour * 6 + 6);
    return {
      hour, averageScore: summarizePosture(cells.flat()).averageScore,
      summaries: cells.reduce((count, cell) => count + cell.length, 0),
      cells: cells.map((cell, index) => ({ minute: index * 10, percent: summarizePosture(cell).adequateSummaryPercentage, summaries: cell.length })),
    };
  });
  return {
    period, start: range.start, end: range.end, previousStart: range.previousStartKey,
    previousEnd: range.previousEnd, partial: range.partial, days,
    summary: summarize(days), previous: summarize(previousDays), hours,
    points: period === "day" ? hours.map(hour => ({ label: `${String(hour.hour).padStart(2, "0")}h`, value: hour.averageScore }))
      : days.map(day => ({ label: formatDate(day.date, { day: "2-digit", month: "2-digit" }), value: summarizePosture(day.postureSnapshots).averageScore })),
  };
}
