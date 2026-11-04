import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import test from "node:test";
import { createServer } from "vite";

const repo = fileURLToPath(new URL("../", import.meta.url));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const browserPath = [process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
].find(candidate => candidate && existsSync(candidate));

test("camera layout remains stable at scrollbar thresholds", { timeout: 90000 }, async t => {
  assert.ok(browserPath, "Install Chrome/Edge or set CHROME_PATH to an existing browser executable.");
  const profile = await mkdtemp(path.join(os.tmpdir(), "ergo-camera-layout-"));
  let server, browser, socket;
  const pending = new Map();
  try {
    server = await createServer({ root: repo, logLevel: "error", server: { host: "127.0.0.1", port: 0, strictPort: false, open: false, hmr: false } });
    await server.listen();
    const port = server.httpServer.address().port;
    browser = spawn(browserPath, ["--headless=new", "--remote-debugging-port=0", "--no-first-run", "--no-default-browser-check",
      "--disable-background-networking", "--disable-component-update", "--disable-sync", "--disable-extensions",
      "--user-data-dir=" + profile, "about:blank"], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
    const endpoint = await new Promise((resolve, reject) => {
      let output = "";
      const timer = setTimeout(() => reject(new Error("Browser startup timed out.")), 15000);
      browser.stderr.on("data", chunk => {
        output += chunk;
        const match = output.match(/DevTools listening on (ws:\/\/\S+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
      browser.once("error", error => { clearTimeout(timer); reject(error); });
      browser.once("exit", code => { clearTimeout(timer); reject(new Error("Browser exited: " + code)); });
    });
    socket = new WebSocket(endpoint);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let nextId = 0;
    const exceptions = [];
    socket.onmessage = event => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const entry = pending.get(message.id);
        pending.delete(message.id);
        clearTimeout(entry?.timer);
        if (message.error) entry?.reject(new Error(JSON.stringify(message.error)));
        else entry?.resolve(message.result);
      } else if (message.method === "Runtime.exceptionThrown") exceptions.push(message.params.exceptionDetails.text);
    };
    const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error("CDP timed out: " + method)); }, 15000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
    const target = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
    const viewport = (width, height) => send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
    const evaluate = async expression => {
      const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId);
      assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    await send("Runtime.enable", {}, sessionId);
    await viewport(880, 1003);
    await send("Page.navigate", { url: `http://127.0.0.1:${port}/scripts/fixtures/camera-layout.html` }, sessionId);
    let ready = false;
    for (let attempt = 0; attempt < 150; attempt++) {
      if (await evaluate("window.cameraLayoutFixture?.ready")) { ready = true; break; }
      assert.deepEqual(exceptions, [], "Browser fixture failed to initialize.");
      await delay(100);
    }
    assert.ok(ready, "Browser fixture did not initialize.");

    await t.test("does not alternate between two sizes during repeated camera switches", async () => {
      const unstable = [];
      const sourceSizes = new Set();
      for (const height of [970, 980, 990, 995, 998, 1000, 1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1010, 1012, 1015, 1020, 1030, 1040]) {
        await viewport(880, height);
        await evaluate("window.cameraLayoutFixture.switchCamera()");
        const sample = await evaluate("window.cameraLayoutFixture.sample()");
        sample.frames.forEach(frame => sourceSizes.add(frame.source.join("x")));
        if (sample.transitions) unstable.push({ height, transitions: sample.transitions });
      }
      assert.deepEqual([...sourceSizes].sort(), ["1280x720", "640x480"], "Both camera resolutions must really be played.");
      assert.deepEqual(unstable, [], "Layout changes between consecutive frames with unchanged detection.");
    });

    await t.test("keeps the monitoring viewport width when main content starts and stops overflowing", async () => {
      await viewport(1440, 2000);
      await evaluate("window.cameraLayoutFixture.closeCalibration()");
      const before = await evaluate("window.cameraLayoutFixture.sample()");
      await evaluate("window.cameraLayoutFixture.setScrollPressure(true)");
      const overflowing = await evaluate("window.cameraLayoutFixture.sample()");
      await evaluate("window.cameraLayoutFixture.setScrollPressure(false)");
      const restored = await evaluate("window.cameraLayoutFixture.sample()");
      assert.equal(before.frames[0].hasOverflow, false, "The initial monitoring page must fit the viewport.");
      assert.equal(overflowing.frames[0].hasOverflow, true, "Scroll pressure must actually overflow the page.");
      assert.equal(restored.frames[0].hasOverflow, false, "Removing pressure must remove the overflow.");
      assert.deepEqual(overflowing.frames[0].video, before.frames[0].video, "Adding a scrollbar changes camera dimensions.");
      assert.deepEqual(restored.frames[0].video, before.frames[0].video, "Removing a scrollbar changes camera dimensions.");
    });
    assert.deepEqual(exceptions, [], "Browser runtime errors.");
    await evaluate("window.cameraLayoutFixture.stop()");
    await send("Browser.close");
  } finally {
    for (const entry of pending.values()) clearTimeout(entry.timer);
    socket?.close();
    if (browser?.exitCode === null) {
      await Promise.race([new Promise(resolve => browser.once("exit", resolve)), delay(2000)]);
      if (browser.exitCode === null) browser.kill();
    }
    await server?.close();
    assert.equal(path.dirname(profile), os.tmpdir());
    assert.ok(path.basename(profile).startsWith("ergo-camera-layout-"));
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
