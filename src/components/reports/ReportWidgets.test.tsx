// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { ReportChart } from "./ReportWidgets";

describe("shared chart units", () => {
  it.each(["posture", "score"] as const)("labels %s values without conflating score and posture time", async metric => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement("div");
    const root = createRoot(container);
    try {
      await act(async () => root.render(<ReportChart metric={metric} report={{ period: "day", start: "2026-11-03", end: "2026-11-03", points: [{ label: "10h", value: 80 }, { label: "11h", value: null }] }} />));
      expect(container.textContent).toContain(metric === "score" ? "80.0/100" : "80%");
      expect(container.textContent).toContain("Sem leituras");
      if (metric === "score") expect(container.textContent).not.toContain("Percentual do tempo");
    } finally { await act(async () => root.unmount()); }
  });
});
