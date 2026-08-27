import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { gzipSync } from "node:zlib";
import { collectPrecache, extractIndexAssets } from "./build-sw.mjs";

export const INITIAL_JS_GZIP_BUDGET = 153600;
export const PREVIEW_CHUNK_GZIP_BUDGET = 256000;
export const PRECACHE_RAW_BUDGET = 2097152;

const BASE_PATH = "/rbx-fashion/";

function distRelative(url) {
  if (!url.startsWith(BASE_PATH)) {
    return null;
  }
  return url.slice(BASE_PATH.length);
}

function gzipSize(path) {
  return gzipSync(readFileSync(path), { level: 9 }).length;
}

function previewChunks(distDir) {
  try {
    return readdirSync(join(distDir, "assets")).filter(
      (file) => file.startsWith("preview-") && file.endsWith(".js"),
    );
  } catch {
    return [];
  }
}

function collectMapFiles(dir, found) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectMapFiles(path, found);
    } else if (entry.name.endsWith(".map")) {
      found.push(path);
    }
  }
}

export function runBundleCheck(distDir) {
  const failures = [];
  const measurements = {};

  const indexHtmlPath = join(distDir, "index.html");
  const swPath = join(distDir, "sw.js");
  if (!existsSync(indexHtmlPath)) {
    failures.push("missing-file: dist/index.html");
  }
  if (!existsSync(swPath)) {
    failures.push("missing-file: dist/sw.js");
  }

  if (existsSync(indexHtmlPath)) {
    const { scripts } = extractIndexAssets(readFileSync(indexHtmlPath, "utf8"));
    let initial = 0;
    for (const src of scripts) {
      if (basename(src).startsWith("preview-")) {
        continue;
      }
      const rel = distRelative(src);
      if (rel === null) {
        failures.push(`initial-js: script src ${src} is outside ${BASE_PATH}`);
        continue;
      }
      initial += gzipSize(join(distDir, rel));
    }
    measurements.initialJsGzip = initial;
    if (initial >= INITIAL_JS_GZIP_BUDGET) {
      failures.push(`initial-js: ${initial} bytes gzip >= ${INITIAL_JS_GZIP_BUDGET} budget`);
    }
  }

  const previews = previewChunks(distDir);
  if (previews.length !== 1) {
    failures.push(
      `preview-chunk-count: expected exactly 1 preview-*.js in dist/assets, found ${previews.length}`,
    );
  }
  if (previews.length >= 1) {
    const size = gzipSize(join(distDir, "assets", previews[0]));
    measurements.previewChunkGzip = size;
    if (size >= PREVIEW_CHUNK_GZIP_BUDGET) {
      failures.push(`preview-chunk-size: ${size} bytes gzip >= ${PREVIEW_CHUNK_GZIP_BUDGET} budget`);
    }
  }

  const collected = collectPrecache(distDir);
  if (!collected.ok) {
    failures.push(`precache-scan: ${collected.error}`);
  } else {
    let total = 0;
    for (const entry of collected.entries) {
      total += statSync(entry.path).size;
    }
    measurements.precacheRaw = total;
    if (total >= PRECACHE_RAW_BUDGET) {
      failures.push(`precache-total: ${total} bytes >= ${PRECACHE_RAW_BUDGET} budget`);
    }
  }

  const maps = [];
  collectMapFiles(distDir, maps);
  if (maps.length > 0) {
    failures.push(`sourcemaps: ${maps.length} .map file(s) in dist (first: ${maps[0]})`);
  }

  return { ok: failures.length === 0, failures, measurements };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = runBundleCheck(process.argv[2] ?? "dist");
  if (result.ok) {
    console.log("check:bundle: ok");
    console.log(`  initial-js gzip    ${result.measurements.initialJsGzip} / ${INITIAL_JS_GZIP_BUDGET} bytes`);
    console.log(`  preview-chunk gzip ${result.measurements.previewChunkGzip} / ${PREVIEW_CHUNK_GZIP_BUDGET} bytes`);
    console.log(`  precache raw       ${result.measurements.precacheRaw} / ${PRECACHE_RAW_BUDGET} bytes`);
  } else {
    console.log(`check:bundle: FAILED (${result.failures.length} problem(s)):`);
    for (const failure of result.failures) {
      console.log(`  - ${failure}`);
    }
    process.exitCode = 1;
  }
}
