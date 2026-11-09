// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PostureHistoryLog, { type LogEvent, type PostureHistoryLogProps } from "./PostureHistoryLog";
import { sessionHistoryService } from "../../services/sessionHistoryService";
import { PostureStatus } from "../../enums/postureStatus";
import { RecordingStatus } from "../../enums/recordingStatus";
import type { SessionHistory } from "../../types/sessionHistory";
import { notifySessionHistoryUpdated } from "../../services/monitoring/sessionHistoryEvents";

vi.mock("../../hooks/useMetricRecording", () => ({ waitForRecordingWrites: () => Promise.resolve() }));
vi.mock("../../services/sessionHistoryService", () => ({ sessionHistoryService: { get: vi.fn() } }));
const read = vi.mocked(sessionHistoryService.get);

function history(): SessionHistory {
  const end = Date.parse("2026-11-05T12:15:00Z");
  return {
    session: {
      id: "session-1", userId: "00000000-0000-4000-8000-000000000001", startedAt: "2026-11-05T12:00:00Z", endedAt: null,
      durationSeconds: 0, averageScore: 100, goodPosturePercentage: 100,
      warningPosturePercentage: 0, dangerPosturePercentage: 0, totalAlertsCount: 1
    },
    windowStart: "2026-11-05T12:00:00Z", windowEnd: "2026-11-05T12:15:00Z",
    timeline: Array.from({ length: 15 }, (_, index) => ({
      startedAt: new Date(end - (15 - index) * 60_000).toISOString(),
      endedAt: new Date(end - (14 - index) * 60_000).toISOString(),
      status: [PostureStatus.GOOD, PostureStatus.WARNING, PostureStatus.DANGER][index] ?? null,
      samplesCount: index < 3 ? 600 : 0, summariesCount: index < 3 ? 1 : 0,
      state: index < 3 ? "recorded" : "pending",
    })),
    adequateSummaryPercentage: 100 / 3,
    alerts: [{
      id: "alert-1", sessionId: "session-1", timestamp: "2026-11-05T12:10:00Z",
      alertType: "neck_posture", severity: "danger", durationSeconds: 42,
      message: "Desvio do pescoço salvo no banco", resolvedAt: "2026-11-05T12:11:00Z"
    }],
  };
}

describe("database-backed session history", () => {
  let root: Root;
  let container: HTMLDivElement;
  async function render(props: Partial<PostureHistoryLogProps> = {}) {
    await act(async () => root.render(<PostureHistoryLog logs={[]} userId={"00000000-0000-4000-8000-000000000001"} recordingStatus={RecordingStatus.ACTIVE} {...props} />));
  }
  async function tick(milliseconds = 5_000) {
    await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds); });
  }
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.useFakeTimers(); read.mockReset(); read.mockResolvedValue(history());
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount()); container.remove(); vi.useRealTimers();
  });

  it("renders stored statuses, actual times, percentage and resolved alert duration after loading", async () => {
    await render({ logs: [{ id: "posture:cooldown", timestamp: "12:10", message: "Duplicate live notice", type: "error" }] });
    expect(container.textContent).toContain("33% dos minutos adequados");
    expect(container.textContent).not.toContain("87%");
    expect(container.textContent).toContain("Desvio do pescoço salvo no banco");
    expect(container.textContent).toContain("Encerrado · Duração registrada: 42 s.");
    expect(container.textContent).not.toContain("Duplicate live notice");
    const blocks = container.querySelector('[aria-label="Qualidade postural por minuto"]')!.children;
    expect(blocks).toHaveLength(15);
    expect(blocks[0].className).toContain("bg-emerald-500");
    expect(blocks[1].className).toContain("bg-amber-500");
    expect(blocks[2].className).toContain("bg-rose-500");
    expect(blocks[3].className).toContain("border-dashed");
    expect(blocks[0].getAttribute("title")).toContain("600 amostras");
    expect(blocks[3].getAttribute("title")).toContain("Aguardando conclusão");
    expect(container.textContent).toContain("Monitoramento iniciado");
  });

  it("shows an empty database without inventing good measurements", async () => {
    const empty = history(); empty.session = null; empty.alerts = []; empty.adequateSummaryPercentage = null;
    empty.timeline = empty.timeline.map(item => ({ ...item, status: null, samplesCount: 0, summariesCount: 0, state: "pending" }));
    read.mockResolvedValue(empty);
    await render({ recordingStatus: RecordingStatus.IDLE });
    expect(container.textContent).toContain("Nenhuma sessão de monitoramento registrada");
    expect(container.textContent).toContain("Nenhum minuto registrado");
    expect(container.querySelectorAll(".bg-emerald-500")).toHaveLength(0);
    await tick(20_000);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("reloads saved history on reopening and keeps the completed session's time range", async () => {
    const saved = history(); saved.session!.endedAt = "2026-11-05T12:15:00Z"; read.mockResolvedValue(saved);
    await render({ recordingStatus: RecordingStatus.IDLE });
    expect(container.textContent).toContain("Últimos 15 minutos da sessão");
    expect(container.textContent).toContain("Monitoramento encerrado");
    await act(async () => root.unmount()); root = createRoot(container);
    await render({ recordingStatus: RecordingStatus.IDLE });
    expect(container.textContent).toContain("Desvio do pescoço salvo no banco");
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("waits for a pending read before polling and refreshes newly saved summaries", async () => {
    let finish!: (value: SessionHistory) => void;
    read.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    await render(); await tick(20_000);
    expect(read).toHaveBeenCalledTimes(1);
    await act(async () => finish(history()));
    const refreshed = history(); refreshed.adequateSummaryPercentage = 75;
    read.mockResolvedValue(refreshed);
    await tick();
    expect(container.textContent).toContain("75% dos minutos adequados");
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("clears only the displayed events and still admits new stored alerts", async () => {
    const clear = vi.fn(); await render({ onClearLogs: clear });
    await act(async () => (container.querySelector('[aria-label="Limpar lista de eventos"]') as HTMLButtonElement).click());
    expect(clear).toHaveBeenCalledOnce();
    expect(container.textContent).not.toContain("Desvio do pescoço salvo no banco");
    await tick();
    expect(container.textContent).not.toContain("Desvio do pescoço salvo no banco");
    const updated = history(); updated.alerts.push({ ...updated.alerts[0], id: "alert-2", message: "Novo alerta salvo" });
    read.mockResolvedValue(updated); await tick();
    expect(container.textContent).toContain("Novo alerta salvo");
    expect(container.textContent).toContain("33% dos minutos adequados");
  });

  it("hides the previous account immediately and discards its late response", async () => {
    let finishOld!: (value: SessionHistory) => void;
    await render();
    read.mockReturnValueOnce(new Promise(resolve => { finishOld = resolve; }));
    await tick();
    const next = history(); next.session!.id = "session-2"; next.session!.userId = "00000000-0000-4000-8000-000000000002";
    next.alerts = []; next.adequateSummaryPercentage = 0;
    read.mockResolvedValue(next);
    await render({ userId: "00000000-0000-4000-8000-000000000002" });
    expect(container.textContent).not.toContain("Desvio do pescoço salvo no banco");
    await act(async () => finishOld(history()));
    expect(container.textContent).not.toContain("Desvio do pescoço salvo no banco");
    expect(container.textContent).toContain("0% dos minutos adequados");
  });

  it("keeps loaded data on read failures, supports retry and suspends reads while hidden", async () => {
    await render(); read.mockRejectedValue(new Error("SQLite unavailable")); await tick();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Exibindo os últimos dados carregados");
    expect(container.textContent).toContain("Desvio do pescoço salvo no banco");
    read.mockResolvedValue(history());
    await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "Tentar novamente")!.click());
    expect(container.querySelector('[role="alert"]')).toBeNull();
    await render({ isVisible: false }); const calls = read.mock.calls.length; await tick(20_000);
    expect(read).toHaveBeenCalledTimes(calls);
    await render(); expect(read).toHaveBeenCalledTimes(calls + 1);
  });

  it("keeps the calibration success visible between the closed session and the resumed session", async () => {
    const previous = history(); previous.session!.endedAt = "2026-11-05T12:15:00Z";
    read.mockResolvedValue(previous);
    const notice: LogEvent = {
      id: "calibration-saved", occurredAt: "2026-11-05T12:15:01Z", timestamp: "12:15:01",
      message: "Ambiente de trabalho salvo com sucesso", type: "success", scope: "account", userId: "00000000-0000-4000-8000-000000000001",
    };
    const presence: LogEvent = {
      id: "old-presence", occurredAt: "2026-11-05T12:15:01Z",
      timestamp: "12:15:01", message: "Presence outside this session", type: "info"
    };
    await render({ logs: [notice, presence] });
    expect(container.textContent).toContain(notice.message);
    expect(container.textContent).not.toContain(presence.message);
    const resumed = history(); resumed.session!.id = "resumed"; resumed.session!.startedAt = "2026-11-05T12:15:02Z";
    read.mockResolvedValue(resumed); await tick();
    expect(container.textContent).toContain(notice.message);
    expect(container.textContent).not.toContain(presence.message);
    await act(async () => (container.querySelector('[aria-label="Limpar lista de eventos"]') as HTMLButtonElement).click());
    expect(container.textContent).not.toContain(notice.message);
  });

  it("does not display another account's calibration notice", async () => {
    await render({
      logs: [{
        id: "other-calibration", occurredAt: "2026-11-05T12:10:00Z", timestamp: "12:10:00",
        message: "Another account saved its calibration", type: "success", scope: "account", userId: "00000000-0000-4000-8000-000000000002"
      }]
    });
    expect(container.textContent).not.toContain("Another account saved its calibration");
  });

  it("shows a saved alert and its resolution immediately without waiting for the five-second poll", async () => {
    const initial = history(); initial.alerts = []; read.mockResolvedValue(initial); await render();
    read.mockResolvedValue(history());
    await act(async () => notifySessionHistoryUpdated({ userId: "00000000-0000-4000-8000-000000000001", sessionId: "session-1" }));
    expect(container.textContent).toContain("Desvio do pescoço salvo no banco");
    expect(read).toHaveBeenCalledTimes(2);
    const resolved = history(); resolved.alerts[0].durationSeconds = 73;
    read.mockResolvedValue(resolved);
    await act(async () => notifySessionHistoryUpdated({ userId: "00000000-0000-4000-8000-000000000001", sessionId: "session-1" }));
    expect(container.textContent).toContain("Duração registrada: 73 s");
    expect(container.textContent?.match(/Desvio do pescoço salvo no banco/g)).toHaveLength(1);
  });

  it("coalesces saves during a pending read and discards the stale result", async () => {
    let finish!: (value: SessionHistory) => void;
    read.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    await render(); const fresh = history(); fresh.alerts[0].message = "Latest saved alert";
    read.mockResolvedValue(fresh);
    await act(async () => {
      for (let index = 0; index < 3; index++) notifySessionHistoryUpdated({ userId: "00000000-0000-4000-8000-000000000001", sessionId: "session-1" });
    });
    expect(read).toHaveBeenCalledTimes(1);
    await act(async () => finish(history()));
    expect(read).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Latest saved alert");
    expect(container.textContent).not.toContain("Desvio do pescoço salvo no banco");
  });

  it("displays saved session start metadata and new live events while the history read is pending", async () => {
    const old = history(); old.session!.endedAt = "2026-11-05T12:15:00Z"; read.mockResolvedValue(old);
    const live: LogEvent = {
      id: "new-presence", message: "New monitoring presence", type: "info",
      occurredAt: "2026-11-05T12:16:01Z", timestamp: "12:16:01"
    };
    await render({ logs: [live] }); expect(container.textContent).not.toContain(live.message);
    let finish!: (value: SessionHistory) => void;
    read.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const next = history(); next.session!.id = "session-2"; next.session!.startedAt = "2026-11-05T12:16:00Z";
    await act(async () => notifySessionHistoryUpdated({ userId: "00000000-0000-4000-8000-000000000001", sessionId: "session-2", session: next.session! }));
    expect(container.textContent).toContain("Monitoramento iniciado");
    expect(container.textContent).toContain(live.message);
    expect(container.textContent).not.toContain("Desvio do pescoço salvo no banco");
    await act(async () => finish(next));
    expect(container.textContent).toContain(live.message);
  });

  it("ignores save notifications of another user and stops listening while hidden", async () => {
    await render(); const calls = read.mock.calls.length;
    await act(async () => notifySessionHistoryUpdated({ userId: "00000000-0000-4000-8000-000000000002", sessionId: "other" }));
    expect(read).toHaveBeenCalledTimes(calls);
    await render({ isVisible: false });
    await act(async () => notifySessionHistoryUpdated({ userId: "00000000-0000-4000-8000-000000000001", sessionId: "session-1" }));
    expect(read).toHaveBeenCalledTimes(calls);
    await render(); expect(read).toHaveBeenCalledTimes(calls + 1);
  });

  it("fills gray only for full-minute absence while pending and unavailable cycles remain outlined", async () => {
    const data = history();
    data.timeline[0] = { ...data.timeline[0], state: "absent", status: null, samplesCount: 0 };
    data.timeline[1] = { ...data.timeline[1], state: "unavailable", status: null, samplesCount: 0 };
    data.timeline[2] = { ...data.timeline[2], state: "pending", status: null, samplesCount: 0 };
    read.mockResolvedValue(data); await render();
    const blocks = container.querySelector('[aria-label="Qualidade postural por minuto"]')!.children;
    expect(blocks[0].className).toContain("bg-slate-400");
    expect(blocks[0].getAttribute("title")).toContain("ausente durante todo o minuto");
    expect(blocks[1].className).toContain("bg-transparent");
    expect(blocks[1].getAttribute("title")).toContain("Sem leituras válidas");
    expect(blocks[2].className).toContain("border-dashed");
    expect(container.querySelectorAll(".bg-slate-400")).toHaveLength(1);
  });
});
