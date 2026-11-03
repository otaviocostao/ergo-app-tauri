// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Dashboard from "./Dashboard";
import { dashboardService } from "../services/dashboardService";
import type { DashboardData } from "../types/dashboard";
import * as recording from "../hooks/useMetricRecording";

const auth = vi.hoisted(() => ({ userId: 1 }));
vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ session: { kind: "authenticated", user: { id: auth.userId } } }) }));
const empty: DashboardData = { sessions: [], snapshots: [], alerts: [] };

describe("persisted dashboard UI", () => {
  let root: Root;
  let container: HTMLDivElement;
  const render = async (strict = false) => act(async () => root.render(<MemoryRouter>{strict ? <StrictMode><Dashboard /></StrictMode> : <Dashboard />}</MemoryRouter>));

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    auth.userId = 1;
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); });

  it("shows loading then a real empty state under StrictMode", async () => {
    const pending: ((value: DashboardData) => void)[] = [];
    vi.spyOn(dashboardService, "getData").mockImplementation(() => new Promise(resolve => pending.push(resolve)));
    await render(true);
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Carregando");
    await act(async () => pending.forEach(resolve => resolve(empty)));
    expect(container.textContent).toContain("Nenhuma sessão registrada hoje");
    expect(container.textContent).toContain("Não registrado");
    expect(container.textContent).not.toContain("82%");
  });

  it("shows an error and can retry without fabricated metrics", async () => {
    vi.spyOn(dashboardService, "getData").mockRejectedValueOnce("db busy").mockResolvedValue(empty);
    await render();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.textContent).not.toContain("Tempo em boa postura");
    await act(async () => container.querySelector("button")!.click());
    expect(container.textContent).toContain("Nenhuma sessão registrada hoje");
  });

  it("discards a previous account's delayed response", async () => {
    let resolveOld!: (value: DashboardData) => void;
    vi.spyOn(dashboardService, "getData").mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; })).mockResolvedValue(empty);
    await render();
    auth.userId = 2;
    await render();
    const now = new Date().toISOString();
    await act(async () => resolveOld({ ...empty, sessions: [{ id: "old-owner", userId: 1, startedAt: now, endedAt: now,
      durationSeconds: 3600, averageScore: 100, goodPosturePercentage: 99, warningPosturePercentage: 1, dangerPosturePercentage: 0, totalAlertsCount: 0 }] }));
    expect(container.textContent).toContain("Nenhuma sessão registrada hoje");
    expect(container.textContent).not.toContain("99%");
  });

  it("renders saved session totals and identifies the separate demonstrative reports", async () => {
    const now = new Date().toISOString();
    vi.spyOn(dashboardService, "getData").mockResolvedValue({ ...empty, sessions: [{ id: "saved", userId: 1,
      startedAt: now, endedAt: now, durationSeconds: 3600, averageScore: 85, goodPosturePercentage: 75,
      warningPosturePercentage: 25, dangerPosturePercentage: 0, totalAlertsCount: 0 }] });
    await render();
    expect(container.textContent).toContain("75%");
    expect(container.textContent).toContain("45 min");
    expect(container.textContent).toContain("Dados salvos");
    expect(container.textContent).toContain("Ver relatórios demonstrativos");
    expect(container.textContent).not.toContain("Nenhuma sessão registrada");
  });

  it("waits for the previous page's pending session writes before reading history", async () => {
    let finishWrites!: () => void;
    vi.spyOn(recording, "waitForRecordingWrites").mockImplementation(() => new Promise<void>(resolve => { finishWrites = resolve; }));
    const read = vi.spyOn(dashboardService, "getData").mockResolvedValue(empty);
    await render();
    expect(read).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Carregando");
    await act(async () => finishWrites());
    expect(read).toHaveBeenCalledOnce();
    expect(container.textContent).toContain("Nenhuma sessão registrada hoje");
  });
});
