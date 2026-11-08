// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTypingMetrics, type UseTypingMetricsOptions } from "./useTypingMetrics";
import { TYPING_METRICS_UPDATED_EVENT } from "../services/typingMonitorService";
import type { LiveTypingMetrics } from "../types/typingMetricSnapshot";

const ipc = vi.hoisted(() => ({
  desktop: false,
  invoke: vi.fn(),
  listeners: new Map<string, (event: { payload: LiveTypingMetrics }) => void>(),
  unlisten: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: ipc.invoke,
  isTauri: () => ipc.desktop,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (eventName: string, handler: (event: { payload: LiveTypingMetrics }) => void) => {
    ipc.listeners.set(eventName, handler);
    return ipc.unlisten;
  }),
}));

describe("useTypingMetrics", () => {
  let container: HTMLDivElement;
  let root: Root;
  let latest: ReturnType<typeof useTypingMetrics> | null = null;

  function Harness(props: UseTypingMetricsOptions) {
    latest = useTypingMetrics(props);
    return null;
  }

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    ipc.desktop = true;
    ipc.invoke.mockReset();
    ipc.listeners.clear();
    ipc.unlisten.mockReset();
    latest = null;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it("synchronizes pause state, loads initial live metrics, and reacts to backend events", async () => {
    const initialMetrics: LiveTypingMetrics = {
      sessionId: "session-1",
      isMonitoringActive: true,
      isTyping: false,
      cpm: 120,
      peakCpm: 180,
      totalKeystrokes: 350,
      continuousMinutes: 6,
      dominantStatus: "good",
    };

    ipc.invoke.mockImplementation(async (command: string) => {
      if (command === "set_typing_monitoring_paused") return initialMetrics;
      if (command === "get_live_typing_metrics") return initialMetrics;
      return undefined;
    });

    await act(async () => {
      root.render(<Harness enabled={true} isPaused={false} />);
    });

    expect(ipc.invoke).toHaveBeenCalledWith("set_typing_monitoring_paused", { paused: false });
    expect(ipc.invoke).toHaveBeenCalledWith("get_live_typing_metrics");
    expect(latest?.metrics).toEqual(initialMetrics);

    const listener = ipc.listeners.get(TYPING_METRICS_UPDATED_EVENT);
    expect(listener).toBeTypeOf("function");

    const pushedMetrics: LiveTypingMetrics = {
      sessionId: "session-1",
      isMonitoringActive: true,
      isTyping: true,
      cpm: 240,
      peakCpm: 300,
      totalKeystrokes: 590,
      continuousMinutes: 16,
      dominantStatus: "warning",
    };

    await act(async () => {
      listener?.({ payload: pushedMetrics });
    });
    expect(latest?.metrics).toEqual(pushedMetrics);
  });

  it("returns neutral metrics and skips IPC when disabled or outside Tauri", async () => {
    await act(async () => {
      root.render(<Harness enabled={false} isPaused={false} />);
    });

    expect(ipc.invoke).not.toHaveBeenCalled();
    expect(latest?.metrics.cpm).toBe(0);
    expect(latest?.metrics.totalKeystrokes).toBe(0);

    ipc.desktop = false;
    await act(async () => {
      root.render(<Harness enabled={true} isPaused={false} />);
    });

    expect(ipc.invoke).not.toHaveBeenCalled();
    expect(latest?.metrics.isMonitoringActive).toBe(false);
  });
});

