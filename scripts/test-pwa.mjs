import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "http://localhost:4178";
const BASE = `${ORIGIN}/rbx-fashion/`;
const PRECACHE_RAW_BUDGET = 2097152;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const errors = [];

function fail(step, message) {
  errors.push(`${step}: ${message}`);
}

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status < 400) {
        return true;
      }
    } catch {}
    if (Date.now() > deadline) {
      return false;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
}

let page;
let context;
let summary = { precacheEntries: 0, precacheBytes: 0 };

async function step(name, body) {
  try {
    await body();
  } catch (error) {
    fail(name, error instanceof Error ? error.message : String(error));
  }
}

async function openItemsSheet() {
  await page.getByRole("button", { name: "Items" }).click();
  await page.locator(".item-row").first().waitFor({ state: "visible", timeout: 15000 });
}

async function run() {
  if (
    !existsSync(join(repoRoot, "dist", "index.html")) ||
    !existsSync(join(repoRoot, "dist", "sw.js"))
  ) {
    console.error("test:pwa: dist/ or dist/sw.js is missing — run npm run build first");
    process.exitCode = 1;
    return;
  }
  const tmpDir = mkdtempSync(join(tmpdir(), "rbx-test-pwa-"));
  let server = null;
  let browser = null;
  let swSourceOnline = "";
  try {
    server = spawn(join(repoRoot, "node_modules", ".bin", "vite"), [
      "preview",
      "--port",
      "4178",
      "--strictPort",
    ], { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"] });
    let serverLog = "";
    server.stdout.on("data", (chunk) => {
      serverLog += chunk.toString();
    });
    server.stderr.on("data", (chunk) => {
      serverLog += chunk.toString();
    });
    if (!(await waitForServer(BASE, 30000))) {
      fail("preview-server", `vite preview did not serve ${BASE}\n${serverLog.slice(-2000)}`);
      return;
    }
    browser = await chromium.launch();
    context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    page = await context.newPage();
    page.setDefaultTimeout(15000);
    const networkFailures = [];
    page.on("requestfailed", (request) => {
      const url = new URL(request.url());
      if (url.origin === ORIGIN && url.pathname.startsWith("/rbx-fashion/assets/")) {
        networkFailures.push(url.pathname);
      }
    });

    await step("seed-caches", async () => {
      await page.goto(`${BASE}manifest.webmanifest`, { waitUntil: "load", timeout: 30000 });
      await page.evaluate(async () => {
        const foreign = await caches.open("other-project-v1");
        await foreign.put("/", new Response("x"));
        const stale = await caches.open("rbx-fashion-v-stale");
        await stale.put("/", new Response("x"));
      });
    });

    await step("sw-install", async () => {
      await page.goto(BASE, { waitUntil: "load", timeout: 30000 });
      await page.evaluate(() => navigator.serviceWorker.ready);
      await page.reload({ waitUntil: "load", timeout: 30000 });
      const controlled = await page.evaluate(() => navigator.serviceWorker.controller !== null);
      if (!controlled) {
        fail("sw-install", "page is not controlled by the service worker after reload");
      }
      await page
        .getByRole("heading", { level: 1, name: "Roblox Clothing Designer" })
        .waitFor({ state: "visible", timeout: 15000 });
    });

    await step("precache", async () => {
      swSourceOnline = await page.evaluate(async () => (await fetch("sw.js")).text());
      const urlsMatch = /const URLS = (\[[^\n]*\]);/.exec(swSourceOnline);
      if (urlsMatch === null) {
        fail("precache", "sw.js does not declare a URLS list");
        return;
      }
      const precachePaths = new Set(
        JSON.parse(urlsMatch[1]).map((url) => new URL(url, BASE).pathname),
      );
      const state = await page.evaluate(async () => {
        const keys = await caches.keys();
        const appKeys = keys.filter((key) => key.startsWith("rbx-fashion-v"));
        const entries = [];
        let totalBytes = 0;
        if (appKeys.length === 1) {
          const cache = await caches.open(appKeys[0]);
          for (const request of await cache.keys()) {
            const response = await cache.match(request);
            const bytes = (await response.arrayBuffer()).byteLength;
            entries.push({ path: new URL(request.url).pathname, bytes });
            totalBytes += bytes;
          }
        }
        return { keys, appKeys, entries, totalBytes };
      });
      summary = { precacheEntries: state.entries.length, precacheBytes: state.totalBytes };
      if (state.appKeys.length !== 1) {
        fail("precache", `expected exactly 1 rbx-fashion cache, found ${state.appKeys.length}`);
      }
      if (!state.keys.includes("other-project-v1")) {
        fail("precache", "activation deleted the foreign cache other-project-v1");
      }
      if (state.keys.includes("rbx-fashion-v-stale")) {
        fail("precache", "activation kept the stale app cache rbx-fashion-v-stale");
      }
      for (const entry of state.entries) {
        if (!precachePaths.has(entry.path)) {
          fail("precache", `cached entry outside the precache set: ${entry.path}`);
        }
      }
      if (state.entries.length !== precachePaths.size) {
        fail(
          "precache",
          `expected ${precachePaths.size} cached entries matching the precache set, found ${state.entries.length}`,
        );
      }
      if (state.totalBytes >= PRECACHE_RAW_BUDGET) {
        fail("precache", `total cached bytes ${state.totalBytes} >= ${PRECACHE_RAW_BUDGET}`);
      }
    });

    await step("offline-shell", async () => {
      await context.setOffline(true);
      await page.reload({ waitUntil: "load", timeout: 30000 });
      await page
        .getByRole("heading", { level: 1, name: "Roblox Clothing Designer" })
        .waitFor({ state: "visible", timeout: 15000 });
      if ((await page.getByText("Generate a Pattern").count()) !== 0) {
        fail("offline-shell", "Generate affordance is visible without VITE_PATTERN_PROXY_URL");
      }
      if ((await page.getByText("Parent Settings").count()) !== 0) {
        fail("offline-shell", "Parent Settings is visible without VITE_PATTERN_PROXY_URL");
      }
    });

    await step("offline-editing", async () => {
      await page.getByRole("button", { name: "Shirt", exact: true }).click();
      await page
        .locator(".project-name")
        .filter({ hasText: "My Shirt" })
        .waitFor({ state: "attached", timeout: 15000 });
      await page.getByRole("button", { name: "Color" }).click();
      await page.getByRole("button", { name: "Red", exact: true }).click();
      if (await page.getByRole("button", { name: "Undo" }).isDisabled()) {
        fail("offline-editing", "Undo is disabled after adding a color item");
      }
      await openItemsSheet();
      const rowCount = await page.locator(".item-row").count();
      if (rowCount !== 1) {
        fail("offline-editing", `expected 1 item in the Items sheet, found ${rowCount}`);
      }
      await page.getByLabel("Item name").fill("Offline Red");
      await page.keyboard.press("Enter");
      await page.getByRole("button", { name: "Done" }).click();
    });

    await step("offline-export", async () => {
      const downloadPromise = page.waitForEvent("download", { timeout: 20000 });
      downloadPromise.catch(() => {});
      await page.getByRole("button", { name: "Export" }).click();
      const download = await downloadPromise;
      if (download.suggestedFilename() !== "My Shirt.png") {
        fail("offline-export", `unexpected export filename ${download.suggestedFilename()}`);
      }
      const bytes = readFileSync(await download.path());
      if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
        fail("offline-export", "exported bytes do not start with a PNG signature");
      }
      const width = bytes.readUInt32BE(16);
      const height = bytes.readUInt32BE(20);
      if (width !== 585 || height !== 559) {
        fail("offline-export", `exported PNG is ${width}x${height}, expected 585x559`);
      }
      await page.getByRole("button", { name: "Okay" }).click();
    });

    await step("offline-projects", async () => {
      const downloadPromise = page.waitForEvent("download", { timeout: 20000 });
      downloadPromise.catch(() => {});
      await page.getByRole("button", { name: "Save" }).click();
      const download = await downloadPromise;
      if (!download.suggestedFilename().endsWith(".rbxcloth.zip")) {
        fail("offline-projects", `unexpected save filename ${download.suggestedFilename()}`);
      }
      const zipPath = join(tmpDir, "project.rbxcloth.zip");
      await download.saveAs(zipPath);
      const chooserPromise = page.waitForEvent("filechooser", { timeout: 15000 });
      chooserPromise.catch(() => {});
      await page.getByRole("button", { name: "Open" }).click();
      const chooser = await chooserPromise;
      await chooser.setFiles(zipPath);
      await page.waitForFunction(() => {
        const undo = document.querySelector('button[aria-label="Undo"]');
        return undo !== null && undo.disabled;
      }, undefined, { timeout: 20000 });
      await openItemsSheet();
      const itemName = await page.getByLabel("Item name").inputValue();
      if (itemName !== "Offline Red") {
        fail("offline-projects", `reopened item name is ${JSON.stringify(itemName)}`);
      }
      const rowCount = await page.locator(".item-row").count();
      if (rowCount !== 1) {
        fail("offline-projects", `expected 1 item after reopen, found ${rowCount}`);
      }
      await page.getByRole("button", { name: "Done" }).click();
    });

    await step("offline-preview", async () => {
      await page
        .locator('nav[aria-label="View"]')
        .getByRole("button", { name: "Preview" })
        .click();
      await page.locator(".preview-stage canvas").waitFor({ state: "visible", timeout: 30000 });
      if ((await page.getByText("Preview isn't available").count()) !== 0) {
        fail("offline-preview", "preview rendered its unavailable message");
      }
      if (networkFailures.length !== 0) {
        fail("offline-preview", `asset requests failed offline: ${networkFailures.join(", ")}`);
      }
    });

    await step("sw-source", async () => {
      let source = null;
      try {
        source = await page.evaluate(async () => (await fetch("sw.js")).text());
      } catch {
        source = swSourceOnline;
      }
      if (source.includes("skipWaiting") || source.includes("clients.claim")) {
        fail("sw-source", "sw.js contains skipWaiting or clients.claim");
      }
    });

    await context.setOffline(false).catch(() => {});
  } finally {
    if (context !== undefined) {
      await context.close().catch(() => {});
    }
    if (browser !== undefined) {
      await browser.close().catch(() => {});
    }
    if (server !== null && server.exitCode === null) {
      server.kill("SIGTERM");
    }
    rmSync(tmpDir, { recursive: true, force: true });
  }
  if (errors.length === 0) {
    console.log(
      `test:pwa: PASS — offline install/precache/shell/editing/export/save-open/preview verified (${summary.precacheEntries} precache entries, ${summary.precacheBytes} bytes cached)`,
    );
  } else {
    console.log(`test:pwa: FAILED (${errors.length} problem(s)):`);
    for (const error of errors) {
      console.log(`  - ${error}`);
    }
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(`test:pwa: crashed — ${error instanceof Error ? error.stack : String(error)}`);
  process.exitCode = 1;
});
