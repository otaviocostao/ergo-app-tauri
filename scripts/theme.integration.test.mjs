import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { after, afterEach, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { JSDOM } from "jsdom";
import ts from "typescript";
import React, { act } from "react";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
});
const originalGlobals = new Map();
for (const [name, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
})) {
  originalGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
// Load React DOM after installing the DOM so its event support is detected correctly.
const { createRoot } = await import("react-dom/client");
const { MemoryRouter } = await import("react-router-dom");
const require = createRequire(import.meta.url);
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const modules = new Map();
let session;
let readPreference;
let savePreference;
let calls;
let reminders;

function authenticated(userId) {
  return { kind: "authenticated", user: {
    id: userId, externalId: null, firstName: `User ${userId}`, lastName: "Test",
    birthDate: "1990-01-01", email: `${userId}@example.com`, phone: "11999999999",
    photo: null, createdAt: "2026-01-01", updatedAt: "2026-01-01",
  } };
}

async function invoke(command, payload) {
  calls.push({ command, payload });
  switch (command) {
    case "get_session": return session;
    case "login_local": session = authenticated(Number(payload.email.split("@")[0])); return session;
    case "logout": session = { kind: "anonymous" }; return;
    case "get_user_theme_preference": return readPreference();
    case "update_user_theme_preference": return savePreference(payload.payload.theme);
    case "is_local_user": return true;
    case "get_companies":
    case "get_workspaces": return [];
    case "get_reminders": return reminders.map((reminder) => ({ ...reminder }));
    case "update_reminder": {
      const reminder = reminders.find(({ id }) => id === payload.payload.id);
      assert.ok(reminder, "The reminder must exist before updating it");
      Object.assign(reminder, payload.payload);
      return { ...reminder };
    }
    default: assert.fail(`Unexpected Tauri command: ${command}`);
  }
}

// Keep the real auth/theme providers, routes, layout and Settings page. Unrelated
// pages are placeholders so camera/model initialization is outside these tests.
const placeholderPages = new Set([
  "Dashboard", "Reports", "Reminders", "Monitoring", "Register", "Login",
].map((name) => path.join(projectRoot, "src", "pages", `${name}.tsx`)));

function loadSource(filename) {
  if (modules.has(filename)) return modules.get(filename).exports;
  if (placeholderPages.has(filename)) {
    return { __esModule: true, default: () => React.createElement("h1", null, path.basename(filename)) };
  }
  const module = { exports: {} };
  modules.set(filename, module);
  const { outputText } = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    },
  });
  const localRequire = (specifier) => {
    if (specifier === "@tauri-apps/api/core") return { invoke, isTauri: () => true };
    if (specifier === "@tauri-apps/api/event") return { listen: async () => () => {} };
    if (!specifier.startsWith(".")) return require(specifier);
    const base = path.resolve(path.dirname(filename), specifier);
    const resolved = [`${base}.tsx`, `${base}.ts`, path.join(base, "index.tsx"), path.join(base, "index.ts")]
      .find((candidate) => ts.sys.fileExists(candidate));
    assert.ok(resolved, `Cannot resolve ${specifier} from ${filename}`);
    return loadSource(resolved);
  };
  vm.runInThisContext(`(function(require, module, exports) {\n${outputText}\n})`, { filename })(
    localRequire, module, module.exports,
  );
  return module.exports;
}

const { AuthProvider, useAuth } = loadSource(path.join(projectRoot, "src/auth/AuthContext.tsx"));
const { ThemeProvider, useTheme } = loadSource(path.join(projectRoot, "src/theme/ThemeContext.tsx"));
const { default: AppRoutes } = loadSource(path.join(projectRoot, "src/routes/AppRoutes.tsx"));
let root;
let auth;
let theme;
let media;

function Probe() {
  auth = useAuth();
  theme = useTheme();
  return null;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>';
  document.documentElement.className = "";
  document.documentElement.style.colorScheme = "";
  session = { kind: "anonymous" };
  calls = [];
  reminders = [
    {
      id: "system-reminder:1:VISUAL_BREAK", systemType: "VISUAL_BREAK", userId: 1,
      title: "Faça uma pausa visual", message: "Descanse os olhos", category: "Pausa Visual",
      interval: 20, period: "08:00 - 18:00", frequency: "BUSINESS_DAYS", notificationTone: true,
      status: "inativo", startTime: "08:00", endTime: "18:00",
    },
    {
      id: "custom-reminder", userId: 1, title: "Meu lembrete personalizado", message: "Beba água",
      category: "Hidratação", interval: 60, period: "08:00 - 18:00", frequency: "DAILY",
      notificationTone: true, status: "ativo", startTime: "08:00", endTime: "18:00",
    },
  ];
  readPreference = () => Promise.resolve("system");
  savePreference = (preference) => Promise.resolve(preference);
  media = new dom.window.EventTarget();
  media.matches = false;
  window.matchMedia = () => media;
  root = createRoot(document.getElementById("root"));
});

afterEach(async () => { await act(async () => root.unmount()); });
after(() => {
  dom.window.close();
  for (const [name, descriptor] of originalGlobals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
});

async function mount(userId = null, initialEntry = "/settings") {
  session = userId === null ? { kind: "anonymous" } : authenticated(userId);
  await act(async () => root.render(
    React.createElement(React.StrictMode, null,
      React.createElement(MemoryRouter, { initialEntries: [initialEntry] },
        React.createElement(AuthProvider, null,
          React.createElement(ThemeProvider, null,
            React.createElement(Probe), React.createElement(AppRoutes),
          ),
        ),
      ),
    ),
  ));
}

async function changeSystem(dark) {
  await act(async () => {
    media.matches = dark;
    const event = new dom.window.Event("change");
    event.matches = dark;
    media.dispatchEvent(event);
  });
}

function assertAppearance(expected) {
  assert.equal(document.documentElement.classList.contains("dark"), expected === "dark");
  assert.equal(document.documentElement.style.colorScheme, expected);
}

test("initial account theme blocks protected pages until the read finishes", async () => {
  const pending = deferred();
  readPreference = () => pending.promise;
  await mount(1);
  assert.equal(theme.isInitializing, true);
  assert.equal(document.querySelector("main input"), null);
  assertAppearance("light");
  await act(async () => pending.resolve("dark"));
  assert.equal(theme.isInitializing, false);
  assert.equal(theme.isReady, true);
  assert.ok(document.querySelector("main input"));
  assertAppearance("dark");
});

for (const outcome of ["resolve", "reject"]) {
  test(`theme retry ${outcome} preserves the Settings form and its queries`, async () => {
    readPreference = () => Promise.reject(new Error("Read failed"));
    await mount(1);
    assert.ok(theme.error);
    const input = document.querySelector('main input[type="text"]');
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(input, "Unsaved draft");
      input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    const queries = calls.filter(({ command }) => command === "get_companies").length;
    const retry = deferred();
    readPreference = () => retry.promise;
    await act(async () => {
      [...document.querySelectorAll("button")].find((button) => button.textContent.includes("Tentar novamente")).click();
    });
    assert.equal(theme.isLoading, true);
    assert.equal(theme.isInitializing, false);
    assert.equal(document.querySelector('main input[type="text"]'), input);
    assert.equal(input.value, "Unsaved draft");
    assert.match(document.querySelector('[role="status"]').textContent, /Carregando sua preferência/);
    await act(async () => {
      if (outcome === "resolve") retry.resolve("dark");
      else retry.reject(new Error("Retry failed"));
    });
    assert.equal(document.querySelector('main input[type="text"]'), input);
    assert.equal(input.value, "Unsaved draft");
    assert.equal(calls.filter(({ command }) => command === "get_companies").length, queries);
    assert.equal(theme.isLoading, false);
    assert.equal(Boolean(theme.error), outcome === "reject");
    assertAppearance(outcome === "resolve" ? "dark" : "light");
  });
}

test("failed saves restore the saved preference and reject overlapping writes", async () => {
  readPreference = () => Promise.resolve("dark");
  await mount(1);
  const pending = deferred();
  savePreference = () => pending.promise;
  let saving;
  await act(async () => { saving = theme.setTheme("light"); });
  assert.equal(theme.isSaving, true);
  assertAppearance("light");
  await act(async () => theme.setTheme("system"));
  assert.equal(calls.filter(({ command }) => command === "update_user_theme_preference").length, 1);
  await act(async () => { pending.reject(new Error("Write failed")); await saving; });
  assert.equal(theme.isSaving, false);
  assert.equal(theme.theme, "dark");
  assert.ok(theme.error);
  assertAppearance("dark");
});

test("automatic reacts to system changes while explicit preferences stay fixed", async () => {
  await mount(1);
  assert.equal(theme.theme, "system");
  await changeSystem(true);
  assertAppearance("dark");
  await act(async () => theme.setTheme("light"));
  await changeSystem(false);
  await changeSystem(true);
  assertAppearance("light");
  await act(async () => theme.setTheme("system"));
  assertAppearance("dark");
  await changeSystem(false);
  assertAppearance("light");
});

test("logout restores the computer theme and ignores an old account read", async () => {
  const pending = deferred();
  readPreference = () => pending.promise;
  await mount(1);
  await act(async () => auth.logout());
  assert.equal(theme.isLoading, false);
  assert.equal(theme.theme, "system");
  await act(async () => pending.resolve("dark"));
  assert.equal(auth.session.kind, "anonymous");
  assert.equal(theme.theme, "system");
  assert.equal(theme.error, "");
  assertAppearance("light");
  await changeSystem(true);
  assertAppearance("dark");
});

for (const outcome of ["resolve", "reject"]) {
  test(`late save ${outcome} from another account cannot change the current theme`, async () => {
    readPreference = () => Promise.resolve("dark");
    await mount(1);
    const pending = deferred();
    savePreference = () => pending.promise;
    let saving;
    await act(async () => { saving = theme.setTheme("system"); });
    await act(async () => auth.logout());
    readPreference = () => Promise.resolve("light");
    await act(async () => auth.login("2@example.com", "password"));
    await act(async () => {
      if (outcome === "resolve") pending.resolve("system");
      else pending.reject(new Error("Old account failure"));
      await saving;
    });
    assert.equal(auth.session.user.id, 2);
    assert.equal(theme.theme, "light");
    assert.equal(theme.isReady, true);
    assert.equal(theme.isSaving, false);
    assert.equal(theme.error, "");
    assertAppearance("light");
  });
}

for (const outcome of ["resolve", "reject"]) {
  test(`switching accounts ignores an older read ${outcome}`, async () => {
    const firstRead = deferred();
    readPreference = () => firstRead.promise;
    await mount(1);
    readPreference = () => Promise.resolve("dark");
    await act(async () => auth.login("2@example.com", "password"));
    await act(async () => {
      if (outcome === "resolve") firstRead.resolve("light");
      else firstRead.reject(new Error("Old read failed"));
    });
    assert.equal(auth.session.user.id, 2);
    assert.equal(theme.theme, "dark");
    assert.equal(theme.error, "");
    assertAppearance("dark");
  });
}

test("refreshing the same account profile preserves theme without another read", async () => {
  readPreference = () => Promise.resolve("dark");
  await mount(1);
  const readCount = calls.filter(({ command }) => command === "get_user_theme_preference").length;
  session = { ...session, user: { ...session.user, firstName: "Updated" } };
  await act(async () => auth.refreshSession());
  assert.equal(auth.session.user.firstName, "Updated");
  assert.equal(calls.filter(({ command }) => command === "get_user_theme_preference").length, readCount);
  assertAppearance("dark");
});

for (const initialEntry of ["/settings?tab=notices", "/ergonomic-notices"]) {
  test(`theme and ergonomic notices work together when entering ${initialEntry}`, async () => {
    readPreference = () => Promise.resolve("dark");
    await mount(1, initialEntry);
    assertAppearance("dark");
    assert.equal(document.querySelector('main button[aria-current="page"]').textContent, "Avisos de ergonomia");
    assert.match(document.querySelector("main").textContent, /Faça uma pausa visual/);
    assert.doesNotMatch(document.querySelector("main").textContent, /Meu lembrete personalizado/);
    const noticeSwitch = document.querySelector('main input[role="switch"]');
    assert.equal(noticeSwitch.checked, false);
    await act(async () => noticeSwitch.click());
    assert.equal(noticeSwitch.checked, true);
    assert.equal(calls.filter(({ command }) => command === "update_reminder").length, 1);

    await act(async () => {
      [...document.querySelectorAll("main button")].find((button) => button.textContent === "Tema").click();
    });
    assert.equal(document.querySelector('input[name="app-theme"]:checked').value, "dark");
    await act(async () => document.querySelector('input[name="app-theme"][value="light"]').click());
    assertAppearance("light");
    assert.equal(calls.filter(({ command }) => command === "update_user_theme_preference").length, 1);

    await act(async () => {
      [...document.querySelectorAll("main button")].find((button) => button.textContent === "Avisos de ergonomia").click();
    });
    assert.equal(document.querySelector('main input[role="switch"]').checked, true);
    assertAppearance("light");
  });
}
