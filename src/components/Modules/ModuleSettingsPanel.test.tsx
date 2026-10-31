// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ModuleSettingsPanel from "./ModuleSettingsPanel";
import type { ModuleSettings } from "../../services/settingsService";

const ipc = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: ipc.invoke, isTauri: () => true }));
const auth = vi.hoisted(() => ({ userId: 1 as number | null }));
vi.mock("../../auth/AuthContext", () => ({
  useOptionalAuth: () => ({
    session: auth.userId === null ? { kind: "guest" } : { kind: "authenticated", user: { id: auth.userId } },
  }),
}));

describe("Configurações → Módulos", () => {
  let root: Root;
  let container: HTMLDivElement;
  let stored: ModuleSettings;

  const titles = () => [...container.querySelectorAll("article h3")].map((title) => title.textContent);
  const switchOf = (label: string) => container.querySelector<HTMLInputElement>(`input[aria-label="Módulo: ${label}"]`)!;
  const commands = (name: string) => ipc.invoke.mock.calls.filter(([command]) => command === name).map(([, args]) => args);

  async function render() {
    await act(async () => root.render(<ModuleSettingsPanel />));
  }

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    auth.userId = 1;
    stored = {
      id: 1, userId: 1, posturalAnalysis: true, ocularAnalysis: true, typingAnalysis: true,
      createdAt: "2026-10-31T00:00:00Z", updatedAt: "2026-10-31T00:00:00Z",
    };
    ipc.invoke.mockImplementation(async (command: string, args?: { payload: { module: string; enabled: boolean } }) => {
      if (command === "get_settings") return stored;
      if (command === "set_module_enabled") {
        const field = { postural_analysis: "posturalAnalysis", ocular_analysis: "ocularAnalysis", typing_analysis: "typingAnalysis" }[args!.payload.module]!;
        stored = { ...stored, [field]: args!.payload.enabled };
        return stored;
      }
      throw new Error(`Unexpected command ${command}`);
    });
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount()); container.remove(); ipc.invoke.mockReset(); vi.restoreAllMocks();
  });

  it("mostra um card por módulo, todos ativos por padrão, com os efeitos da desativação", async () => {
    await render();
    expect(titles()).toEqual(["Análise postural", "Análise ocular", "Análise de digitação"]);
    for (const label of titles()) {
      expect(switchOf(label!).checked).toBe(true);
    }
    expect(container.textContent).toContain("“Revise sua postura” e “Mude de posição”");
    expect(container.textContent).toContain("“Faça uma pausa visual”");
    expect(container.textContent).toContain("card de atividade de digitação do Monitoramento fica inativo");
  });

  it("desativa e reativa um módulo pelo command de ativação", async () => {
    await render();
    await act(async () => switchOf("Análise postural").click());
    expect(switchOf("Análise postural").checked).toBe(false);
    expect(switchOf("Análise ocular").checked).toBe(true);
    expect(container.querySelector("article")!.textContent).toContain("Inativo");

    await act(async () => switchOf("Análise de digitação").click());
    await act(async () => switchOf("Análise postural").click());
    expect(commands("set_module_enabled")).toEqual([
      { payload: { module: "postural_analysis", enabled: false } },
      { payload: { module: "typing_analysis", enabled: false } },
      { payload: { module: "postural_analysis", enabled: true } },
    ]);
    expect(switchOf("Análise postural").checked).toBe(true);
    expect(switchOf("Análise de digitação").checked).toBe(false);
  });

  it("restaura o estado anterior e informa o erro quando a gravação falha", async () => {
    await render();
    vi.spyOn(console, "error").mockImplementation(() => {});
    ipc.invoke.mockRejectedValueOnce("database locked");
    await act(async () => switchOf("Análise ocular").click());
    expect(switchOf("Análise ocular").checked).toBe(true);
    expect(container.querySelector('[role="alert"]')!.textContent).toContain("Não foi possível alterar o módulo");
  });

  it("oferece recarregar quando a leitura falha", async () => {
    ipc.invoke.mockRejectedValueOnce("database locked");
    await render();
    expect(titles()).toEqual([]);
    expect(container.querySelector('[role="alert"]')!.textContent).toContain("Não foi possível carregar os módulos");
    await act(async () => container.querySelector<HTMLButtonElement>('[role="alert"] button')!.click());
    expect(titles()).toHaveLength(3);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("não consulta o backend sem uma conta conectada", async () => {
    auth.userId = null;
    await render();
    expect(container.textContent).toContain("Entre com uma conta para escolher os módulos");
    expect(ipc.invoke).not.toHaveBeenCalled();
  });
});
