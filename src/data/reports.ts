// Preview fixtures only. Replace this source with persisted measurements when
// posture history is available; all report calculations consume the same model.
export type ReportPeriod = "day" | "week" | "month";

export interface PostureInterval {
  minute: number;
  monitoredMinutes: number;
  goodMinutes: number;
}

export interface PostureAlert {
  date: string;
  time: string;
  kind: "neck" | "shoulders" | "trunk";
  severity: "warning" | "danger";
  title: string;
  detail: string;
}

export interface PostureDay {
  date: string;
  intervals: PostureInterval[];
  alerts: PostureAlert[];
  breaks: number;
}

export interface ReportSummary {
  days: number;
  monitoredMinutes: number;
  goodMinutes: number;
  posturePercent: number | null;
  alerts: number;
  criticalAlerts: number;
  alertsPerHour: number | null;
  breaks: number;
  goalDays: number;
}

export interface PostureReport {
  period: ReportPeriod;
  start: string;
  end: string;
  previousStart: string;
  previousEnd: string;
  partial: boolean;
  days: PostureDay[];
  summary: ReportSummary;
  previous: ReportSummary;
  points: { label: string; value: number | null }[];
  hours: { hour: number; monitoredMinutes: number; goodMinutes: number; percent: number | null }[];
}

export const dailyGoalMinutes = 360;

// Construct local dates explicitly, avoiding UTC date shifts in date inputs.
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
  const minutes = Math.round(value);
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h${minutes % 60 ? String(minutes % 60).padStart(2, "0") : ""}` : `${minutes} min`;
}

export function formatPercent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value)}%`;
}

export function formatTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
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

const alertKinds: Omit<PostureAlert, "date" | "time" | "severity">[] = [
  { kind: "neck", title: "Pescoço projetado à frente", detail: "O alinhamento cervical saiu da faixa de referência." },
  { kind: "shoulders", title: "Desnível dos ombros", detail: "Foi registrada uma diferença no alinhamento dos ombros." },
  { kind: "trunk", title: "Inclinação do tronco", detail: "O tronco permaneceu fora da posição de referência." },
];

export function createReportPreview(today = new Date()): PostureDay[] {
  return Array.from({ length: 120 }, (_, index): PostureDay | null => {
    const date = addDays(today, index - 119);
    if (date.getDay() === 0 || date.getDay() === 6) return null;
    const key = dateKey(date);
    const seed = date.getDate() + date.getMonth() * 3;
    const baseline = 61 + index * 0.19 + (seed % 7 - 3);
    const hours = [8, 9, 10, 11, 13, 14, 15, 16];
    const hourEffects = [-5, -2, 10, 7, -12, -3, 8, -1];
    const intervals = hours.flatMap((hour, hourIndex) =>
      Array.from({ length: 6 }, (_, slot) => {
        const percent = Math.min(99, Math.max(30, baseline + hourEffects[hourIndex] + ((seed + slot * 3) % 9 - 4)));
        return { minute: hour * 60 + slot * 10, monitoredMinutes: 10, goodMinutes: Math.round(percent) / 10 };
      }),
    ).slice(0, 42 + seed % 7);
    const alertCount = Math.max(1, Math.round((100 - baseline) / 5) + seed % 3 - 1);
    const alerts = Array.from({ length: alertCount }, (_, alertIndex): PostureAlert => ({
      ...alertKinds[(seed + alertIndex) % alertKinds.length],
      severity: (seed + alertIndex) % 4 === 0 ? "danger" : "warning",
      date: key,
      time: formatTime(intervals[Math.floor((alertIndex + 1) * intervals.length / (alertCount + 1))].minute),
    }));
    return { date: key, intervals, alerts, breaks: 3 + seed % 4 };
  }).filter((day): day is PostureDay => day !== null);
}

function totals(day: PostureDay) {
  return day.intervals.reduce((sum, interval) => ({
    monitoredMinutes: sum.monitoredMinutes + interval.monitoredMinutes,
    goodMinutes: sum.goodMinutes + interval.goodMinutes,
  }), { monitoredMinutes: 0, goodMinutes: 0 });
}

export function summarize(days: PostureDay[]): ReportSummary {
  const measured = days.filter(day => totals(day).monitoredMinutes > 0);
  const result = measured.reduce((summary, day) => {
    const total = totals(day);
    summary.monitoredMinutes += total.monitoredMinutes;
    summary.goodMinutes += total.goodMinutes;
    summary.alerts += day.alerts.length;
    summary.criticalAlerts += day.alerts.filter(alert => alert.severity === "danger").length;
    summary.breaks += day.breaks;
    if (total.goodMinutes >= dailyGoalMinutes) summary.goalDays++;
    return summary;
  }, { days: measured.length, monitoredMinutes: 0, goodMinutes: 0, alerts: 0, criticalAlerts: 0, breaks: 0, goalDays: 0 });
  return {
    ...result,
    posturePercent: result.monitoredMinutes ? result.goodMinutes / result.monitoredMinutes * 100 : null,
    alertsPerHour: result.monitoredMinutes ? result.alerts / (result.monitoredMinutes / 60) : null,
  };
}

export function buildReport(source: PostureDay[], period: ReportPeriod, anchor: string, today = new Date()): PostureReport {
  const { start, end: fullEnd } = periodBounds(period, anchor);
  const todayKey = dateKey(today);
  const startKey = dateKey(start);
  const endKey = dateKey(fullEnd) > todayKey && startKey <= todayKey ? todayKey : dateKey(fullEnd);
  const end = parseDate(endKey);
  const previousStart = parseDate(shiftPeriod(period, startKey, -1));
  const previousFullEnd = periodBounds(period, dateKey(previousStart)).end;
  const elapsedDays = Math.round((Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()) - Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) / 86400000);
  const partial = endKey !== dateKey(fullEnd);
  const previousEnd = !partial || dateKey(addDays(previousStart, elapsedDays)) > dateKey(previousFullEnd) ? previousFullEnd : addDays(previousStart, elapsedDays);
  const select = (from: string, to: string) => source.filter(day => day.date >= from && day.date <= to);
  const days = select(startKey, endKey);
  const hours = [8, 9, 10, 11, 13, 14, 15, 16].map(hour => {
    const intervals = days.flatMap(day => day.intervals).filter(interval => Math.floor(interval.minute / 60) === hour);
    const monitoredMinutes = intervals.reduce((sum, interval) => sum + interval.monitoredMinutes, 0);
    const goodMinutes = intervals.reduce((sum, interval) => sum + interval.goodMinutes, 0);
    return { hour, monitoredMinutes, goodMinutes, percent: monitoredMinutes ? goodMinutes / monitoredMinutes * 100 : null };
  });
  const points = period === "day"
    ? hours.map(hour => ({ label: `${hour.hour}h`, value: hour.percent }))
    : Array.from({ length: elapsedDays + 1 }, (_, index) => {
      const key = dateKey(addDays(start, index));
      return { label: formatDate(key, { day: "2-digit", month: "2-digit" }), value: summarize(days.filter(day => day.date === key)).posturePercent };
    });
  return {
    period, start: startKey, end: endKey,
    previousStart: dateKey(previousStart), previousEnd: dateKey(previousEnd),
    partial, days,
    summary: summarize(days), previous: summarize(select(dateKey(previousStart), dateKey(previousEnd))),
    points, hours,
  };
}
