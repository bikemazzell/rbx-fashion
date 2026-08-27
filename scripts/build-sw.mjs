import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const BASE_PATH = "/rbx-fashion/";
const PRECACHE_NAME = "rbx-fashion-v";

export function extractIndexAssets(html) {
  const scripts = [];
  const styles = [];
  for (const match of html.matchAll(/<script\b([^>]*)><\/script>/g)) {
    const attrs = match[1];
    if (!/\btype="module"/.test(attrs)) {
      continue;
    }
    const src = /\bsrc="([^"]+)"/.exec(attrs);
    if (src !== null) {
      scripts.push(src[1]);
    }
  }
  for (const match of html.matchAll(/<link\b([^>]*)>/g)) {
    const attrs = match[1];
    if (!/\brel="stylesheet"/.test(attrs)) {
      continue;
    }
    const href = /\bhref="([^"]+)"/.exec(attrs);
    if (href !== null) {
      styles.push(href[1]);
    }
  }
  return { scripts, styles };
}

function distRelative(url) {
  if (!url.startsWith(BASE_PATH)) {
    return null;
  }
  return url.slice(BASE_PATH.length);
}

function fileExists(path) {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

export function collectPrecache(distDir) {
  const htmlPath = join(distDir, "index.html");
  if (!fileExists(htmlPath)) {
    return { ok: false, error: "dist/index.html is missing (run vite build first)" };
  }
  const entries = new Map();
  const addFromIndex = (url) => {
    const rel = distRelative(url);
    if (rel === null) {
      return `index.html references ${url} outside ${BASE_PATH}`;
    }
    const path = join(distDir, rel);
    if (!fileExists(path)) {
      return `dist/${rel} is missing but referenced from index.html`;
    }
    entries.set(`./${rel}`, path);
    return null;
  };
  const { scripts, styles } = extractIndexAssets(readFileSync(htmlPath, "utf8"));
  for (const src of scripts) {
    const error = addFromIndex(src);
    if (error !== null) {
      return { ok: false, error };
    }
  }
  for (const href of styles) {
    const error = addFromIndex(href);
    if (error !== null) {
      return { ok: false, error };
    }
  }
  let assetFiles;
  try {
    assetFiles = readdirSync(join(distDir, "assets"));
  } catch {
    return { ok: false, error: "dist/assets is missing (run vite build first)" };
  }
  const previews = assetFiles.filter((file) => file.startsWith("preview-") && file.endsWith(".js"));
  if (previews.length === 0) {
    return { ok: false, error: "no preview-*.js chunk found in dist/assets" };
  }
  for (const file of previews) {
    entries.set(`./assets/${file}`, join(distDir, "assets", file));
  }
  for (const extra of ["manifest.webmanifest", "icon-192.png", "icon-512.png"]) {
    const path = join(distDir, extra);
    if (!fileExists(path)) {
      return { ok: false, error: `dist/${extra} is missing (public/ artifact not built)` };
    }
    entries.set(`./${extra}`, path);
  }
  entries.set("./index.html", htmlPath);
  const list = [...entries.entries()]
    .map(([url, path]) => ({ url, path }))
    .sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0));
  return { ok: true, entries: list };
}

export function computeVersion(paths) {
  const hash = createHash("sha256");
  for (const path of paths) {
    hash.update(readFileSync(path));
  }
  return hash.digest("hex").slice(0, 16);
}

export function renderServiceWorker(precacheUrls, version) {
  const urls = JSON.stringify([...precacheUrls]);
  return `const VERSION = ${JSON.stringify(version)};
const PRECACHE = ${JSON.stringify(PRECACHE_NAME)};
const URLS = ${urls};
const ABS = new Set(URLS.map((u) => new URL(u, self.location.href).href));

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(PRECACHE + VERSION).then((cache) => cache.addAll(URLS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((ks) =>
      Promise.all(
        ks
          .filter((k) => k.startsWith(PRECACHE) && k !== PRECACHE + VERSION)
          .map((k) => caches.delete(k)),
      ),
    ),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.mode === "navigate") {
    event.respondWith(
      caches
        .open(PRECACHE + VERSION)
        .then((cache) => cache.match(new URL("./index.html", self.location.href)))
        .then((response) => (response !== undefined ? response : fetch(request))),
    );
    return;
  }
  if (request.method !== "GET") {
    return;
  }
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !ABS.has(url.href)) {
    return;
  }
  event.respondWith(
    caches.match(request.url).then((response) => (response !== undefined ? response : fetch(request))),
  );
});
`;
}

export function main(distDir) {
  const collected = collectPrecache(distDir);
  if (!collected.ok) {
    console.error(`build-sw: ${collected.error}`);
    return 1;
  }
  const version = computeVersion(collected.entries.map((entry) => entry.path));
  const source = renderServiceWorker(
    collected.entries.map((entry) => entry.url),
    version,
  );
  writeFileSync(join(distDir, "sw.js"), source);
  let total = 0;
  for (const entry of collected.entries) {
    const bytes = statSync(entry.path).size;
    total += bytes;
    console.log(`build-sw: precache ${entry.url} (${bytes} bytes)`);
  }
  console.log(
    `build-sw: ${collected.entries.length} entries, ${total} bytes total, version ${version}, wrote ${basename(distDir)}/sw.js`,
  );
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = main(process.argv[2] ?? "dist");
}
