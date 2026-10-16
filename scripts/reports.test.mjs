import assert from "node:assert/strict";
import test from "node:test";
import { buildReport, createReportPreview, dateKey, formatMinutes, isDateKey, periodBounds, shiftPeriod, summarize } from "../src/data/reports.ts";

const today = new Date(2026, 9, 16, 12);
const day = (date, monitoredMinutes, goodMinutes) => ({
  date, intervals: [{ minute: 480, monitoredMinutes, goodMinutes }], alerts: [], breaks: 1,
});

test("the index is weighted by monitored time rather than by number of days", () => {
  const result = summarize([day("2026-10-15", 100, 100), day("2026-10-16", 300, 0)]);
  assert.equal(result.posturePercent, 25);
  assert.equal(result.monitoredMinutes, 400);
  assert.equal(result.days, 2);
});

test("missing readings have no score or alert rate", () => {
  const result = summarize([day("2026-10-16", 0, 0)]);
  assert.equal(result.posturePercent, null);
  assert.equal(result.alertsPerHour, null);
  assert.equal(result.days, 0);
});

test("alert frequency is normalized by the monitored duration", () => {
  const record = day("2026-10-16", 120, 90);
  record.alerts = Array.from({ length: 3 }, () => ({ date: record.date, time: "08:10", kind: "neck", title: "Example", detail: "" }));
  assert.equal(summarize([record]).alertsPerHour, 1.5);
});

test("a day compares with the previous calendar day and excludes other dates", () => {
  const report = buildReport([day("2026-10-14", 100, 10), day("2026-10-15", 100, 60), day("2026-10-16", 100, 80)], "day", "2026-10-16", today);
  assert.equal(report.previousStart, "2026-10-15");
  assert.equal(report.previousEnd, "2026-10-15");
  assert.equal(report.summary.posturePercent - report.previous.posturePercent, 20);
  assert.equal(report.days.length, 1);
});

test("the current week compares equal elapsed days and never includes future readings", () => {
  const report = buildReport([day("2026-10-16", 100, 80), day("2026-10-17", 100, 10)], "week", "2026-10-16", today);
  assert.equal(report.start, "2026-10-12");
  assert.equal(report.end, "2026-10-16");
  assert.equal(report.previousStart, "2026-10-05");
  assert.equal(report.previousEnd, "2026-10-09");
  assert.equal(report.partial, true);
  assert.equal(report.days.length, 1);
});

test("the current month compares the same elapsed part of the previous month", () => {
  const report = buildReport([], "month", "2026-10-16", today);
  assert.equal(report.start, "2026-10-01");
  assert.equal(report.end, "2026-10-16");
  assert.equal(report.previousStart, "2026-09-01");
  assert.equal(report.previousEnd, "2026-09-16");
  assert.equal(report.points.length, 16);
});

test("short months, leap years and year changes keep valid calendar boundaries", () => {
  const report = buildReport([], "month", "2024-03-31", today);
  assert.equal(report.previousEnd, "2024-02-29");
  assert.equal(report.partial, false);
  const february = buildReport([], "month", "2026-02-28", today);
  assert.equal(february.previousStart, "2026-01-01");
  assert.equal(february.previousEnd, "2026-01-31");
  assert.equal(shiftPeriod("month", "2026-03-31", -1), "2026-02-01");
  assert.equal(shiftPeriod("week", "2026-01-01", -1), "2025-12-22");
  assert.equal(dateKey(periodBounds("week", "2026-10-18").start), "2026-10-12");
});

test("days without monitoring remain missing points and do not lower the average", () => {
  const report = buildReport([day("2026-10-12", 100, 80)], "week", "2026-10-16", today);
  assert.equal(report.summary.posturePercent, 80);
  assert.equal(report.points[0].value, 80);
  assert.equal(report.points[1].value, null);
  assert.equal(report.previous.posturePercent, null);
});

test("the example history is deterministic and its measurements stay internally consistent", () => {
  const records = createReportPreview(today);
  assert.deepEqual(records, createReportPreview(today));
  for (const record of records) {
    assert.ok(record.date <= "2026-10-16");
    assert.ok(record.intervals.length > 0);
    for (const interval of record.intervals) {
      assert.ok(interval.goodMinutes >= 0 && interval.goodMinutes <= interval.monitoredMinutes);
    }
    for (const alert of record.alerts) {
      assert.ok(record.intervals.some(interval => `${String(Math.floor(interval.minute / 60)).padStart(2, "0")}:${String(interval.minute % 60).padStart(2, "0")}` === alert.time));
    }
  }
  const report = buildReport(records, "month", "2026-10-16", today);
  assert.ok(report.summary.posturePercent > report.previous.posturePercent);
});

test("date validation and time formatting handle calendar and rounding edges", () => {
  assert.equal(isDateKey("2026-02-30"), false);
  assert.equal(isDateKey("2024-02-29"), true);
  assert.equal(isDateKey("invalid"), false);
  assert.equal(formatMinutes(59.9), "1h");
  assert.equal(formatMinutes(312), "5h12");
});
