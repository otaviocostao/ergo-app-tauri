import { beforeEach, describe, expect, it, vi } from "vitest";
import { dashboardService } from "./dashboardService";

const ipc = vi.hoisted(() => ({ desktop: true, invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => ipc.desktop, invoke: ipc.invoke }));
const filter = { startTime: "2026-11-02T03:00:00Z", endTime: "2026-11-04T03:00:00Z" };

describe("dashboard IPC", () => {
  beforeEach(() => { ipc.desktop = true; ipc.invoke.mockReset(); });
  it("requests only a period, with ownership decided by Rust", async () => {
    const data = { sessions: [], snapshots: [], alerts: [] };
    ipc.invoke.mockResolvedValue(data);
    expect(await dashboardService.getData(filter)).toBe(data);
    expect(ipc.invoke).toHaveBeenCalledWith("get_dashboard_data", { filter });
  });
  it("does not fabricate data in web previews or swallow IPC failures", async () => {
    ipc.desktop = false;
    await expect(dashboardService.getData(filter)).rejects.toThrow("aplicativo Ergo");
    expect(ipc.invoke).not.toHaveBeenCalled();
    ipc.desktop = true;
    ipc.invoke.mockRejectedValue(new Error("database unavailable"));
    await expect(dashboardService.getData(filter)).rejects.toThrow("database unavailable");
  });
});
