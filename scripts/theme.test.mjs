import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function loadModule(file, globals, imports = {}) {
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports,
    require(name) {
      assert.ok(name in imports, `Unexpected import: ${name}`);
      return imports[name];
    },
    ...globals,
  });
  return exports;
}

function environment({ cached = null, systemDark = false, storageBlocked = false } = {}) {
  const classes = new Set();
  const values = new Map(cached === null ? [] : [["ergo.initial-theme", cached]]);
  const document = { documentElement: {
    classList: { toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); } },
    style: {},
  } };
  const localStorage = {
    getItem(key) { if (storageBlocked) throw new Error("Storage blocked"); return values.get(key) ?? null; },
    setItem(key, value) { if (storageBlocked) throw new Error("Storage blocked"); values.set(key, value); },
  };
  const matchMedia = () => ({ matches: systemDark });
  return {
    globals: { document, localStorage, matchMedia, window: { localStorage, matchMedia } },
    classes, values,
  };
}

const bootstrap = readFileSync(new URL("../index.html", import.meta.url), "utf8")
  .match(/<script>([\s\S]*?)<\/script>/)[1];

for (const scenario of [
  { name: "uncached dark system", systemDark: true, expected: "dark" },
  { name: "uncached light system", expected: "light" },
  { name: "ignores the previous account dark cache on a light system", cached: "dark", expected: "light" },
  { name: "ignores the previous account light cache on a dark system", cached: "light", systemDark: true, expected: "dark" },
  { name: "automatic preference after the system turns dark", cached: "system", systemDark: true, expected: "dark" },
  { name: "automatic preference after the system turns light", cached: "system", expected: "light" },
  { name: "invalid cache", cached: "invalid", systemDark: true, expected: "dark" },
  { name: "blocked storage", storageBlocked: true, systemDark: true, expected: "dark" },
]) {
  test(`initial HTML and React bootstrap agree: ${scenario.name}`, () => {
    const env = environment(scenario);
    vm.runInNewContext(bootstrap, env.globals);
    assert.equal(env.globals.document.documentElement.style.colorScheme, scenario.expected);
    assert.equal(env.classes.has("dark"), scenario.expected === "dark");
    const { initializeTheme } = loadModule("../src/theme/theme.ts", env.globals);
    initializeTheme();
    assert.equal(env.globals.document.documentElement.style.colorScheme, scenario.expected);
    assert.equal(env.classes.has("dark"), scenario.expected === "dark");
  });
}

test("startup resets a previous account appearance to the computer theme", () => {
  const env = environment();
  const theme = loadModule("../src/theme/theme.ts", env.globals);
  theme.applyTheme("dark");
  assert.equal(env.globals.document.documentElement.style.colorScheme, "dark");
  theme.initializeTheme();
  assert.equal(env.globals.document.documentElement.style.colorScheme, "light");
});

test("theme services resolve in a browser without accessing the Tauri bridge", async () => {
  const { userThemeService } = loadModule("../src/services/userThemeService.ts", {}, {
    "@tauri-apps/api/core": { isTauri: () => false, invoke: () => assert.fail("Browser invoked Tauri") },
  });
  assert.equal(await userThemeService.getPreference(), "system");
  assert.equal(await userThemeService.updatePreference("system"), "system");
});

test("desktop theme services preserve the command names and update payload", async () => {
  const calls = [];
  const { userThemeService } = loadModule("../src/services/userThemeService.ts", {}, {
    "@tauri-apps/api/core": {
      isTauri: () => true,
      invoke: async (command, payload) => { calls.push([command, payload]); return "dark"; },
    },
  });
  assert.equal(await userThemeService.getPreference(), "dark");
  assert.equal(await userThemeService.updatePreference("dark"), "dark");
  assert.deepEqual(calls.map(([command]) => command), [
    "get_user_theme_preference", "update_user_theme_preference",
  ]);
  assert.equal(JSON.stringify(calls[1][1]), JSON.stringify({ payload: { theme: "dark" } }));
});
