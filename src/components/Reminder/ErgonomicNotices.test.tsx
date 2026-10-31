// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReminderList from "./ReminderList";
import type { ReminderItem, SystemReminderType } from "../../services/reminderService";
import { ReminderFrequency } from "../../enums";

const ipc = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: ipc.invoke, isTauri: () => false }));

function notice(systemType: SystemReminderType, title: string, interval: number): ReminderItem {
  return {
    id: `system-reminder:1:${systemType}`, userId: 1, systemType, title, message: `${title}.`,
    category: "Postura", interval, period: "00:00 - 23:59", frequency: ReminderFrequency.DAILY,
    notificationTone: true, status: "inativo", startTime: "00:00", endTime: "23:59",
  };
}

const custom: ReminderItem = {
  id: "custom-reminder", userId: 1, title: "Beber água", message: "Beba 250ml", category: "Hidratação",
  interval: 60, period: "08:00 - 18:00", frequency: ReminderFrequency.BUSINESS_DAYS,
  notificationTone: true, status: "ativo", startTime: "08:00", endTime: "18:00",
};

describe("Avisos de ergonomia em Configurações", () => {
  let root: Root;
  let container: HTMLDivElement;
  let reminders: ReminderItem[];

  const cards = () => [...container.querySelectorAll("article")];
  const card = (title: string) => cards().find((article) => article.textContent?.includes(title))!;
  const switchOf = (title: string) => card(title).querySelector<HTMLInputElement>('input[role="switch"]')!;
  const updates = () => ipc.invoke.mock.calls.filter(([command]) => command === "update_reminder").map(([, args]) => args.payload);

  async function render(kind: "system" | "custom" = "system") {
    await act(async () => root.render(<ReminderList kind={kind} />));
  }

  async function toggle(title: string) {
    await act(async () => switchOf(title).click());
  }

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    reminders = [
      notice("POSTURE_CHECK", "Revise sua postura", 30),
      notice("VISUAL_BREAK", "Faça uma pausa visual", 20),
      notice("MOVEMENT_BREAK", "Mude de posição", 60),
      custom,
    ];
    ipc.invoke.mockImplementation(async (command: string, args?: { payload?: Partial<ReminderItem> }) => {
      if (command === "get_reminders") return reminders;
      if (command === "update_reminder") {
        const current = reminders.find((reminder) => reminder.id === args!.payload!.id)!;
        return { ...current, ...args!.payload };
      }
      throw new Error(`Unexpected command ${command}`);
    });
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount()); container.remove(); ipc.invoke.mockReset();
  });

  it("mostra os três avisos com frequência diária e o dia inteiro, sem opção de configurar", async () => {
    await render();
    expect(cards().map((article) => article.querySelector("h3")!.textContent)).toEqual([
      "Revise sua postura", "Faça uma pausa visual", "Mude de posição",
    ]);
    for (const article of cards()) {
      const details = Object.fromEntries([...article.querySelectorAll("dl > div")].map((row) => [
        row.querySelector("dt")!.textContent!.trim(), row.querySelector("dd")!.textContent,
      ]));
      expect(details).toMatchObject({ "Horário": "00:00 - 23:59", "Frequência": "Diariamente", "Notificação": "Com som" });
    }
    expect(card("Faça uma pausa visual").textContent).toContain("20 min");
    expect(container.textContent).not.toContain("Configurar");
    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(container.textContent).not.toContain("Beber água");
    expect(document.querySelector("form")).toBeNull();
  });

  it("ativa e desativa um aviso enviando apenas o status", async () => {
    await render();
    await toggle("Revise sua postura");
    expect(switchOf("Revise sua postura").checked).toBe(true);
    expect(card("Revise sua postura").textContent).toContain("Ativo");
    expect(switchOf("Mude de posição").checked).toBe(false);

    reminders[0] = { ...reminders[0], status: "ativo" };
    await toggle("Revise sua postura");
    expect(switchOf("Revise sua postura").checked).toBe(false);
    expect(updates()).toEqual([
      { id: "system-reminder:1:POSTURE_CHECK", status: "ativo" },
      { id: "system-reminder:1:POSTURE_CHECK", status: "inativo" },
    ]);
  });

  it("restaura o estado anterior e informa o erro quando a gravação falha", async () => {
    await render();
    ipc.invoke.mockRejectedValueOnce("System reminders are managed by the system; only the status can be changed");
    vi.spyOn(console, "error").mockImplementation(() => {});
    await toggle("Faça uma pausa visual");
    expect(switchOf("Faça uma pausa visual").checked).toBe(false);
    expect(container.querySelector('[role="alert"]')!.textContent).toContain("Não foi possível alterar o aviso");
    vi.restoreAllMocks();
  });

  it("mantém a edição apenas para os lembretes personalizados", async () => {
    await render("custom");
    expect(container.textContent).toContain("Beber água");
    expect(container.textContent).not.toContain("Revise sua postura");
    await act(async () => container.querySelector<HTMLButtonElement>('button[title="Editar lembrete"]')!.click());
    expect(document.body.textContent).toContain("Editar Lembrete");
    expect(document.body.textContent).not.toContain("Aviso de Ergonomia");
  });
});
