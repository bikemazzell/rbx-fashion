import { expect, test } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  INITIAL_JS_GZIP_BUDGET,
  PRECACHE_RAW_BUDGET,
  PREVIEW_CHUNK_GZIP_BUDGET,
  runBundleCheck,
} from "../../scripts/check-bundle.mjs";

function prng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state;
  };
}

function entropyBytes(length: number, seed: number): Buffer {
  const next = prng(seed);
  const bytes = Buffer.alloc(length);
  for (let index = 0; index < length; index += 1) {
    bytes[index] = next() & 0xff;
  }
  return bytes;
}

interface FixtureOptions {
  mainJsBytes?: number;
  previewBytes?: number;
  icon512Bytes?: number;
  swJs?: boolean;
  strayMap?: boolean;
}

function writeDist(root: string, options: FixtureOptions = {}): string {
  const dist = join(root, "dist");
  mkdirSync(join(dist, "assets"), { recursive: true });
  writeFileSync(
    join(dist, "index.html"),
    '<!doctype html><html><head><link rel="stylesheet" href="/rbx-fashion/assets/index-T.css"></head>' +
      '<body><script type="module" crossorigin src="/rbx-fashion/assets/index-T.js"></script></body></html>',
  );
  writeFileSync(join(dist, "assets", "index-T.js"), entropyBytes(options.mainJsBytes ?? 2048, 1));
  writeFileSync(join(dist, "assets", "index-T.css"), entropyBytes(512, 2));
  writeFileSync(join(dist, "assets", "preview-T.js"), entropyBytes(options.previewBytes ?? 4096, 3));
  writeFileSync(join(dist, "manifest.webmanifest"), Buffer.from("{}"));
  writeFileSync(join(dist, "icon-192.png"), entropyBytes(64, 4));
  writeFileSync(join(dist, "icon-512.png"), entropyBytes(options.icon512Bytes ?? 128, 5));
  if (options.swJs !== false) {
    writeFileSync(join(dist, "sw.js"), Buffer.from("self"));
  }
  if (options.strayMap === true) {
    writeFileSync(join(dist, "assets", "index-T.js.map"), entropyBytes(256, 6));
  }
  return dist;
}

function withDist(run: (dist: string) => void, options: FixtureOptions = {}): void {
  const root = mkdtempSync(join(tmpdir(), "rbx-check-bundle-"));
  try {
    run(writeDist(root, options));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("budget constants are the plan values", () => {
  expect(INITIAL_JS_GZIP_BUDGET).toBe(153600);
  expect(PREVIEW_CHUNK_GZIP_BUDGET).toBe(256000);
  expect(PRECACHE_RAW_BUDGET).toBe(2097152);
});

test("a small fixture dist passes every check", () => {
  withDist((dist) => {
    const result = runBundleCheck(dist);
    expect(result.failures).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.measurements.initialJsGzip).toBeGreaterThan(0);
    expect(result.measurements.previewChunkGzip).toBeGreaterThan(0);
    expect(result.measurements.precacheRaw).toBeGreaterThan(0);
  });
});

test("an over-budget initial bundle produces the initial-js failure", () => {
  withDist(
    (dist) => {
      const result = runBundleCheck(dist);
      expect(result.ok).toBe(false);
      expect(result.failures.some((failure) => failure.startsWith("initial-js:"))).toBe(true);
      expect(result.measurements.initialJsGzip).toBeGreaterThanOrEqual(INITIAL_JS_GZIP_BUDGET);
    },
    { mainJsBytes: 154000 },
  );
});

test("an over-budget preview chunk produces the preview-chunk-size failure", () => {
  withDist(
    (dist) => {
      const result = runBundleCheck(dist);
      expect(result.ok).toBe(false);
      expect(
        result.failures.some((failure) => failure.startsWith("preview-chunk-size:")),
      ).toBe(true);
      expect(result.measurements.previewChunkGzip).toBeGreaterThanOrEqual(
        PREVIEW_CHUNK_GZIP_BUDGET,
      );
    },
    { previewBytes: 257000 },
  );
});

test("a missing preview chunk produces the preview-chunk-count failure", () => {
  const root = mkdtempSync(join(tmpdir(), "rbx-check-bundle-"));
  try {
    const dist = writeDist(root);
    rmSync(join(dist, "assets", "preview-T.js"));
    const result = runBundleCheck(dist);
    expect(result.ok).toBe(false);
    expect(
      result.failures.some((failure) => failure.startsWith("preview-chunk-count:")),
    ).toBe(true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an over-budget precache set produces the precache-total failure", () => {
  withDist(
    (dist) => {
      const result = runBundleCheck(dist);
      expect(result.ok).toBe(false);
      expect(result.failures.some((failure) => failure.startsWith("precache-total:"))).toBe(true);
      expect(result.measurements.precacheRaw).toBeGreaterThanOrEqual(PRECACHE_RAW_BUDGET);
    },
    { icon512Bytes: 2100000 },
  );
});

test("a missing dist/sw.js produces the missing-file failure", () => {
  withDist(
    (dist) => {
      const result = runBundleCheck(dist);
      expect(result.ok).toBe(false);
      expect(result.failures).toContain("missing-file: dist/sw.js");
    },
    { swJs: false },
  );
});

test("a stray .map file in dist produces the sourcemaps failure", () => {
  withDist(
    (dist) => {
      const result = runBundleCheck(dist);
      expect(result.ok).toBe(false);
      expect(result.failures.some((failure) => failure.startsWith("sourcemaps:"))).toBe(true);
    },
    { strayMap: true },
  );
});
