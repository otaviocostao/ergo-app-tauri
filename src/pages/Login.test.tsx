// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Login from "./Login";

vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ login: vi.fn(), initializationError: null }) }));
vi.mock("../components/auth/VerifiedAnimation", () => ({ default: () => null }));

describe("single registration flow", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function (this: HTMLDialogElement) { this.open = true; } });
    Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function (this: HTMLDialogElement) { this.open = false; } });
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); });

  async function render(registrationComplete = false) {
    await act(async () => root.render(<MemoryRouter initialEntries={[{ pathname: "/login", state: { registrationComplete } }]}>
      <Routes><Route path="/login" element={<Login />} /><Route path="/cadastro" element={<h1>Criar conta</h1>} /></Routes>
    </MemoryRouter>));
  }

  it("opens registration directly without asking for an account type", async () => {
    await render();
    expect(container.textContent).not.toContain("Como deseja se cadastrar?");
    expect(container.textContent).not.toContain("Cadastrar online");
    expect(container.textContent).not.toContain("Cadastrar offline");
    const register = [...container.querySelectorAll("button")].find(button => button.textContent?.includes("Cadastre-se"))!;
    await act(async () => register.click());
    expect(container.querySelector("h1")?.textContent).toBe("Criar conta");
    expect(container.querySelector("dialog[open]")).toBeNull();
  });

  it("keeps registration confirmation and returns to the login form", async () => {
    await render(true);
    expect(container.querySelector("dialog[open]")?.textContent).toContain("Cadastro realizado com sucesso");
    const login = [...container.querySelectorAll("button")].find(button => button.textContent?.includes("Fazer login"))!;
    await act(async () => login.click());
    expect(container.querySelector("dialog[open]")).toBeNull();
    expect(container.querySelector("form")).not.toBeNull();
  });
});
