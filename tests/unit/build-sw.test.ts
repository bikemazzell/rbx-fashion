import { expect, test } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main, renderServiceWorker } from "../../scripts/build-sw.mjs";

const PRECACHE_URLS = ["./index.html", "./assets/index-a1b2.js", "./assets/preview-c3d4.js"];

test("renderServiceWorker embeds the precache list, version, and cache name", () => {
  const source = renderServiceWorker(PRECACHE_URLS, "deadbeefcafe0123");
  for (const url of PRECACHE_URLS) {
    expect(source.includes(`"${url}"`)).toBe(true);
  }
  expect(source.includes('const VERSION = "deadbeefcafe0123"')).toBe(true);
  expect(source.includes("caches.open(PRECACHE + VERSION)")).toBe(true);
});

test("install precaches with addAll and waits", () => {
  const source = renderServiceWorker(PRECACHE_URLS, "deadbeefcafe0123");
  expect(source.includes("addEventListener(\"install\"")).toBe(true);
  expect(source.includes("event.waitUntil(")).toBe(true);
  expect(source.includes("addAll(URLS)")).toBe(true);
});

test("activate deletes only this app's stale caches, never foreign caches on the same origin", () => {
  const source = renderServiceWorker(PRECACHE_URLS, "deadbeefcafe0123");
  expect(source.includes("addEventListener(\"activate\"")).toBe(true);
  expect(source.includes("caches.keys()")).toBe(true);
  expect(source.includes("k.startsWith(PRECACHE)")).toBe(true);
  expect(source.includes("k !== PRECACHE + VERSION")).toBe(true);
  expect(source.includes("caches.delete(k)")).toBe(true);
});

test("fetch handles navigations and precache hits", () => {
  const source = renderServiceWorker(PRECACHE_URLS, "deadbeefcafe0123");
  expect(source.includes("addEventListener(\"fetch\"")).toBe(true);
  expect(source.includes("\"navigate\"")).toBe(true);
  expect(source.includes("caches.match(")).toBe(true);
});

test("the worker source never forces activation", () => {
  const source = renderServiceWorker(PRECACHE_URLS, "deadbeefcafe0123");
  expect(source.includes("skipWaiting")).toBe(false);
  expect(source.includes("clients.claim")).toBe(false);
});

function writeFixtureDist(root: string): void {
  mkdirSync(join(root, "assets"), { recursive: true });
  writeFileSync(
    join(root, "index.html"),
    '<!doctype html><html><head><link rel="stylesheet" href="/rbx-fashion/assets/index-T.css"></head>' +
      '<body><script type="module" crossorigin src="/rbx-fashion/assets/index-T.js"></script></body></html>',
  );
  writeFileSync(join(root, "assets", "index-T.js"), "export const a = 1;");
  writeFileSync(join(root, "assets", "index-T.css"), "body { margin: 0 }");
  writeFileSync(join(root, "assets", "preview-T.js"), "export const p = 1;");
  writeFileSync(join(root, "manifest.webmanifest"), "{}");
  writeFileSync(join(root, "icon-192.png"), "png-192");
  writeFileSync(join(root, "icon-512.png"), "png-512");
}

test("main writes dist/sw.js from a valid fixture dist", () => {
  const root = mkdtempSync(join(tmpdir(), "rbx-build-sw-"));
  try {
    writeFixtureDist(root);
    expect(main(root)).toBe(0);
    const swPath = join(root, "sw.js");
    expect(existsSync(swPath)).toBe(true);
    const source = readFileSync(swPath, "utf8");
    expect(source.includes('"./index.html"')).toBe(true);
    expect(source.includes('"./assets/index-T.js"')).toBe(true);
    expect(source.includes('"./assets/index-T.css"')).toBe(true);
    expect(source.includes('"./assets/preview-T.js"')).toBe(true);
    expect(source.includes('"./manifest.webmanifest"')).toBe(true);
    expect(source.includes('"./icon-192.png"')).toBe(true);
    expect(source.includes('"./icon-512.png"')).toBe(true);
    expect(source).toMatch(/const VERSION = "[0-9a-f]{16}"/);
    expect(source.includes("skipWaiting")).toBe(false);
    expect(source.includes("clients.claim")).toBe(false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("main fails with exit code 1 when dist is missing", () => {
  const root = mkdtempSync(join(tmpdir(), "rbx-build-sw-"));
  try {
    expect(main(join(root, "nope"))).toBe(1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("main fails with exit code 1 when the preview chunk is missing", () => {
  const root = mkdtempSync(join(tmpdir(), "rbx-build-sw-"));
  try {
    writeFixtureDist(root);
    rmSync(join(root, "assets", "preview-T.js"));
    expect(main(root)).toBe(1);
    expect(existsSync(join(root, "sw.js"))).toBe(false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
