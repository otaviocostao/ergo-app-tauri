import { beforeEach, describe, expect, it, vi } from "vitest";
import { sessionHistoryService } from "./sessionHistoryService";

const ipc = vi.hoisted(() => ({ invoke: vi.fn(), desktop: true }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: ipc.invoke, isTauri: () => ipc.desktop }));

describe("session history IPC", () => {
  beforeEach(() => { ipc.invoke.mockReset(); ipc.desktop = true; });
  it("lets Rust select the authenticated owner instead of accepting a client user ID", async () => {
    const result = { session: null, timeline: [] }; ipc.invoke.mockResolvedValue(result);
    expect(await sessionHistoryService.get()).toBe(result);
    expect(ipc.invoke).toHaveBeenCalledWith("get_session_history");
  });
  it("does not fabricate history in browser previews and propagates database read failures", async () => {
    ipc.desktop = false; await expect(sessionHistoryService.get()).rejects.toThrow("Abra o aplicativo");
    expect(ipc.invoke).not.toHaveBeenCalled();
    ipc.desktop = true; ipc.invoke.mockRejectedValue(new Error("database read failed"));
    await expect(sessionHistoryService.get()).rejects.toThrow("database read failed");
  });
});
