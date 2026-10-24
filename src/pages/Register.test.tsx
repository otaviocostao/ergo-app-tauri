// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Register from "./Register";
import { authService } from "../auth/authService";

vi.mock("../auth/authService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../auth/authService")>();
  return { ...actual, authService: { ...actual.authService, register: vi.fn() } };
});

describe("registration fields and birth date input", () => {
  let root: Root;
  let container: HTMLDivElement;

  function input(name: string) {
    return container.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
  }

  function error(name: string) {
    return container.querySelector(`#${CSS.escape(input(name).id)}-error`)?.textContent;
  }

  async function fill(name: string, value: string) {
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input(name), value);
      input(name).dispatchEvent(new Event("input", { bubbles: true }));
      input(name).dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  async function blur(name: string) {
    await act(async () => { input(name).focus(); input(name).blur(); });
  }

  async function submit() {
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  }

  async function fillRequired() {
    for (const [name, value] of Object.entries({
      firstName: "Ana", lastName: "Silva", email: "ana@example.com",
      password: "Senha-segura-123!", confirmation: "Senha-segura-123!",
    })) await fill(name, value);
  }

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 20, 12));
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.mocked(authService.register).mockReset().mockResolvedValue({
      id: 1, externalId: null, firstName: "Ana", lastName: "Silva", email: "ana@example.com",
      birthDate: "", phone: "", photo: null, createdAt: "", updatedAt: "",
    });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root.render(
      <MemoryRouter initialEntries={["/cadastro"]}>
        <Routes>
          <Route path="/cadastro" element={<Register />} />
          <Route path="/login" element={<p>Cadastro concluído</p>} />
        </Routes>
      </MemoryRouter>,
    ));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("marks only required fields with an asterisk and removes optional helper text", () => {
    for (const name of ["firstName", "lastName", "email", "password", "confirmation"]) {
      expect(input(name).required).toBe(true);
      expect(container.querySelector(`label[for="${input(name).id}"]`)?.textContent).toContain("*");
      expect(input(name).getAttribute("aria-invalid")).toBe("false");
    }
    for (const name of ["birthDate", "phone"]) {
      expect(input(name).required).toBe(false);
      expect(container.querySelector(`label[for="${input(name).id}"]`)?.textContent).not.toContain("*");
    }
    expect(container.textContent).not.toMatch(/opcional|Se informar, use uma data/);
  });

  it.each([
    ["firstName", "Informe seu nome.", "Ana"],
    ["lastName", "Informe seu sobrenome.", "Silva"],
    ["email", "Informe um e-mail válido.", "ana@example.com"],
    ["password", "Informe sua senha.", "Senha-segura-123!"],
    ["confirmation", "Confirme sua senha.", "Senha-segura-123!"],
  ])("validates the required %s field on blur and accepts a correction", async (name, message, corrected) => {
    if (name === "confirmation") await fill("password", corrected);
    await blur(name);
    expect(error(name)).toBe(message);
    expect(input(name).getAttribute("aria-invalid")).toBe("true");
    await fill(name, corrected); await blur(name);
    expect(error(name)).toBeUndefined();
  });

  it("validates malformed email, weak password and mismatched confirmation on blur", async () => {
    await fill("email", "ana"); await blur("email");
    expect(error("email")).toBe("Informe um e-mail válido.");
    await fill("password", "12345678"); await blur("password");
    expect(error("password")).toContain("Inclua uma letra maiúscula");
    await fill("confirmation", "outra-senha"); await blur("confirmation");
    expect(error("confirmation")).toBe("As senhas devem ser iguais.");
  });

  it("restores the native date input and restricts both input and calendar to the age bounds", async () => {
    expect(input("birthDate").type).toBe("date");
    expect(input("birthDate").min).toBe("1925-10-21");
    expect(input("birthDate").max).toBe("2012-10-20");
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Escolher data de nascimento no calendário"]')!.click());
    expect(container.querySelector('[data-day="21"]')!.getAttribute("aria-disabled")).toBe("true");
    await act(async () => container.querySelector<HTMLButtonElement>('[data-day="20"]')!.click());
    expect(input("birthDate").value).toBe("2012-10-20");
  });

  it.each([
    ["2012-10-20", "Próximo mês", "Mês anterior", "Setembro"],
    ["1925-10-21", "Mês anterior", "Próximo mês", "Novembro"],
  ])("keeps the calendar open when clicking the blocked arrow at %s", async (value, blockedLabel, allowedLabel, nextMonth) => {
    await fill("birthDate", value);
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="Escolher data de nascimento no calendário"]')!.click();
      vi.advanceTimersByTime(20);
    });
    const blocked = container.querySelector<HTMLButtonElement>(`[aria-label="${blockedLabel}"]`)!;
    expect(blocked.getAttribute("aria-disabled")).toBe("true");
    await act(async () => { blocked.focus(); blocked.click(); });
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Mês de nascimento"]')?.textContent).toContain("Outubro");
    expect(input("birthDate").value).toBe(value);
    await act(async () => container.querySelector<HTMLButtonElement>(`[aria-label="${allowedLabel}"]`)!.click());
    expect(container.querySelector('[aria-label="Mês de nascimento"]')?.textContent).toContain(nextMonth);
  });

  it.each([
    ["2012-10-20", 21, 19, "2012-10-19"],
    ["1925-10-21", 20, 22, "1925-10-22"],
  ])("keeps the calendar open and the value unchanged when clicking an invalid day near %s", async (value, invalidDay, validDay, expected) => {
    await fill("birthDate", value);
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Escolher data de nascimento no calendário"]')!.click());
    await act(async () => vi.advanceTimersByTime(20));
    const invalid = container.querySelector<HTMLButtonElement>(`[data-day="${invalidDay}"]`)!;
    await act(async () => { invalid.focus(); invalid.click(); });
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(container.contains(document.activeElement)).toBe(true);
    expect(input("birthDate").value).toBe(value);
    expect(invalid.tabIndex).toBe(-1);
    await act(async () => container.querySelector<HTMLButtonElement>(`[data-day="${validDay}"]`)!.click());
    expect(input("birthDate").value).toBe(expected);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it.each([
    ["2012-10-21", "A data de nascimento deve indicar pelo menos 14 anos."],
    ["1925-10-20", "A data de nascimento não pode indicar mais de 100 anos."],
    ["2026-10-21", "A data de nascimento não pode estar no futuro."],
  ])("rejects an out-of-range date %s on blur and on submit", async (value, message) => {
    await fillRequired(); await fill("birthDate", value); await blur("birthDate");
    expect(error("birthDate")).toBe(message);
    await submit();
    expect(authService.register).not.toHaveBeenCalled();
  });

  it("rejects a native incomplete or impossible date even when its exposed value is empty", async () => {
    await fillRequired();
    vi.spyOn(input("birthDate"), "validity", "get").mockReturnValue({ badInput: true } as ValidityState);
    expect(input("birthDate").value).toBe("");
    await submit();
    expect(error("birthDate")).toContain("Informe uma data de nascimento válida");
    expect(authService.register).not.toHaveBeenCalled();
    await blur("birthDate");
    expect(error("birthDate")).toContain("Informe uma data de nascimento válida");
  });

  it("allows empty optional fields and submits valid required fields", async () => {
    await fillRequired(); await blur("birthDate"); await blur("phone"); await submit();
    expect(authService.register).toHaveBeenCalledWith(expect.objectContaining({ birthDate: "", phone: "" }));
    expect(container.textContent).toBe("Cadastro concluído");
  });

  it("submits a leap-day birth date in ISO format", async () => {
    await fillRequired(); await fill("birthDate", "2000-02-29"); await submit();
    expect(authService.register).toHaveBeenCalledWith(expect.objectContaining({ birthDate: "2000-02-29" }));
  });

  it("validates a filled optional phone without requiring an empty one", async () => {
    await fill("phone", "7599"); await blur("phone");
    expect(error("phone")).toBe("Informe o telefone com DDD e 9 dígitos.");
    await fill("phone", ""); await blur("phone");
    expect(error("phone")).toBeUndefined();
  });

  it("validates untouched required fields when the form is submitted", async () => {
    await submit();
    for (const name of ["firstName", "lastName", "email", "password", "confirmation"]) expect(error(name)).toBeTruthy();
    expect(error("birthDate")).toBeUndefined();
    expect(error("phone")).toBeUndefined();
    expect(authService.register).not.toHaveBeenCalled();
  });
});
