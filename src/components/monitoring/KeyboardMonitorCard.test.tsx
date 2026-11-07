// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import KeyboardMonitorCard, { type KeyboardMonitorCardProps } from "./KeyboardMonitorCard";
import type { LiveTypingMetrics } from "../../types/typingMetricSnapshot";

const makeMetrics = (overrides: Partial<LiveTypingMetrics> = {}): LiveTypingMetrics => ({
  sessionId: "session-1",
  isMonitoringActive: true,
  isTyping: false,
  cpm: 0,
  peakCpm: 0,
  totalKeystrokes: 0,
  continuousMinutes: 0,
  dominantStatus: "good",
  ...overrides,
});

describe("KeyboardMonitorCard", () => {
  let root: Root;
  let container: HTMLDivElement;

  const render = (props: KeyboardMonitorCardProps = {}) =>
    act(async () => {
      root.render(<KeyboardMonitorCard {...props} />);
    });

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("renders live typing telemetry and active status when typing", async () => {
    await render({
      enabled: true,
      isPaused: false,
      metrics: makeMetrics({
        isTyping: true,
        cpm: 215,
        totalKeystrokes: 842,
        continuousMinutes: 8,
        dominantStatus: "good",
      }),
    });

    expect(container.querySelector("[data-module-inactive]")).toBeNull();
    expect(container.textContent).toContain("Digitando");
    expect(container.textContent).toContain("215 CPM");
    expect(container.textContent).toContain("8 min");
    expect(container.textContent).toContain("Teclas842");
    expect(container.textContent).toContain("Ritmo saudável de digitação com pausas regulares.");
  });

  it("renders idle and paused badges appropriately", async () => {
    await render({
      enabled: true,
      isPaused: false,
      metrics: makeMetrics({ isTyping: false, cpm: 40, totalKeystrokes: 100 }),
    });
    expect(container.textContent).toContain("Pausa / Inativo");

    await render({
      enabled: true,
      isPaused: true,
      metrics: makeMetrics({ isTyping: true, cpm: 180, totalKeystrokes: 450 }),
    });
    expect(container.textContent).toContain("Em pausa");
    expect(container.textContent).not.toContain("Digitando");
  });

  it("renders warning and danger ergonomic guidance based on continuous typing status", async () => {
    await render({
      enabled: true,
      metrics: makeMetrics({
        continuousMinutes: 18,
        dominantStatus: "warning",
      }),
    });
    expect(container.textContent).toContain("18 min");
    expect(container.textContent).toContain("Sessão Moderada de Digitação");
    expect(container.innerHTML).toContain("text-amber-600");

    await render({
      enabled: true,
      metrics: makeMetrics({
        continuousMinutes: 27,
        dominantStatus: "danger",
      }),
    });
    expect(container.textContent).toContain("27 min");
    expect(container.textContent).toContain("Recomendado Fazer uma Pausa!");
    expect(container.innerHTML).toContain("text-rose-600");
  });

  it("shows the module as inactive when disabled", async () => {
    await render({
      enabled: false,
      metrics: makeMetrics({ isTyping: true, cpm: 300, totalKeystrokes: 999 }),
    });

    expect(container.querySelector("[data-module-inactive]")).not.toBeNull();
    expect(container.textContent).toContain("Módulo inativo");
    expect(container.textContent).toContain(
      "Análise de digitação desativada em Configurações → Módulos",
    );
    expect(container.textContent).not.toContain("Digitando");
    expect(container.textContent).not.toContain("999");
  });
});
