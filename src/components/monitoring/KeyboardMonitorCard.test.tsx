// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import KeyboardMonitorCard from "./KeyboardMonitorCard";

describe("KeyboardMonitorCard", () => {
  let root: Root;
  let container: HTMLDivElement;

  const render = (enabled?: boolean) => act(async () => root.render(<KeyboardMonitorCard enabled={enabled} />));
  const type = (count: number) => act(async () => {
    for (let index = 0; index < count; index++) window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
  });

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount()); container.remove();
  });

  it("counts keys while the typing module is enabled", async () => {
    await render();
    await type(3);
    expect(container.querySelector("[data-module-inactive]")).toBeNull();
    expect(container.textContent).toContain("Digitando");
    expect(container.textContent).toContain("Teclas3");
  });

  it("shows the module as inactive and ignores the keyboard when disabled", async () => {
    await render(false);
    await type(3);
    expect(container.querySelector("[data-module-inactive]")).not.toBeNull();
    expect(container.textContent).toContain("Módulo inativo");
    expect(container.textContent).toContain("Análise de digitação desativada em Configurações → Módulos");
    expect(container.textContent).not.toContain("Digitando");

    await render(true);
    await type(2);
    expect(container.textContent).toContain("Teclas2");
  });
});
