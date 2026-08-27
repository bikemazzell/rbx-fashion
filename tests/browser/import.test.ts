import { expect, test } from "vitest";
import { AssetStore } from "../../src/assets/store";
import { sha256Hex } from "../../src/assets/hash";
import {
  IMPORT_DECODE_FAILED_MESSAGE,
  IMPORT_TOO_LARGE_MESSAGE,
  IMPORT_TOO_MANY_PIXELS_MESSAGE,
  IMPORT_UNSUPPORTED_MESSAGE,
  importImage,
  type ImportOutcome,
} from "../../src/editor/import";
import { LIMITS } from "../../src/domain/types";

function ctx2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (ctx === null) {
    throw new Error("2d context unavailable");
  }
  return ctx;
}

function halvesCanvas(width: number, height: number, left: string, right: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = ctx2d(canvas);
  ctx.fillStyle = left;
  ctx.fillRect(0, 0, width / 2, height);
  ctx.fillStyle = right;
  ctx.fillRect(width / 2, 0, width / 2, height);
  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => (result === null ? reject(new Error("encode failed")) : resolve(result)), mime);
  });
}

async function canvasFile(
  width: number,
  height: number,
  mime: string,
  name: string,
  left = "#ff0000",
  right = "#0000ff",
): Promise<File> {
  const blob = await canvasToBlob(halvesCanvas(width, height, left, right), mime);
  return new File([blob], name, { type: mime });
}

async function fixtureFile(): Promise<File> {
  const response = await fetch(new URL("../fixtures/orientation-6.jpg", import.meta.url));
  const bytes = new Uint8Array(await response.arrayBuffer());
  return new File([bytes], "orientation-6.jpg", { type: "image/jpeg" });
}

function isPng(bytes: Uint8Array): boolean {
  return (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  );
}

async function samplePixels(bytes: Uint8Array<ArrayBuffer>, points: readonly [number, number][]): Promise<number[][]> {
  const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = ctx2d(canvas);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return points.map(([x, y]) => Array.from(ctx.getImageData(x, y, 1, 1).data));
}

function expectChannel(actual: number, expected: number): void {
  expect(Math.abs(actual - expected), `channel ${actual} vs ${expected}`).toBeLessThanOrEqual(24);
}

function expectReddish(rgba: number[]): void {
  expectChannel(rgba[0] ?? 0, 255);
  expectChannel(rgba[1] ?? 0, 0);
  expectChannel(rgba[2] ?? 0, 0);
}

function expectBluish(rgba: number[]): void {
  expectChannel(rgba[0] ?? 0, 0);
  expectChannel(rgba[1] ?? 0, 0);
  expectChannel(rgba[2] ?? 0, 255);
}

function requireOk(outcome: ImportOutcome): Extract<ImportOutcome, { ok: true }> {
  if (!outcome.ok) {
    throw new Error(`expected ok outcome, got ${outcome.kind}: ${outcome.message}`);
  }
  return outcome;
}

function requireFail(outcome: ImportOutcome): Extract<ImportOutcome, { ok: false }> {
  if (outcome.ok) {
    throw new Error("expected failed outcome");
  }
  return outcome;
}

test("PNG import normalizes to stored PNG bytes with an exact manifest", async () => {
  const file = await canvasFile(10, 6, "image/png", "art.png");
  const assets = new AssetStore();
  const outcome = await importImage(file, { assets, importedMegapixels: 0 });
  const result = requireOk(outcome);
  expect(result.route).toBe("add-item");
  expect(result.placement).toBe("decal");
  expect(result.megapixels).toBe(60 / 1_000_000);
  expect(result.asset).toEqual({
    id: expect.any(String),
    path: `assets/${result.asset.id}.png`,
    originalName: "art.png",
    sourceMimeType: "image/png",
    byteLength: expect.any(Number),
    width: 10,
    height: 6,
    sha256: expect.any(String),
    source: "imported",
  });
  const stored = assets.get(result.asset.id);
  expect(stored).toBeDefined();
  expect(stored?.width).toBe(10);
  expect(stored?.height).toBe(6);
  const bytes = stored?.bytes;
  expect(bytes).toBeDefined();
  if (bytes === undefined) {
    throw new Error("stored bytes missing");
  }
  expect(isPng(bytes)).toBe(true);
  expect(result.asset.byteLength).toBe(bytes.length);
  expect(result.asset.sha256).toBe(await sha256Hex(bytes));
  const pixels = await samplePixels(bytes, [
    [2, 3],
    [8, 3],
  ]);
  expect(pixels[0]).toEqual([255, 0, 0, 255]);
  expect(pixels[1]).toEqual([0, 0, 255, 255]);
});

test("JPEG import normalizes to PNG bytes preserving sampled colors", async () => {
  const file = await canvasFile(16, 16, "image/jpeg", "photo.jpg");
  const assets = new AssetStore();
  const result = requireOk(await importImage(file, { assets, importedMegapixels: 0 }));
  expect(result.asset.sourceMimeType).toBe("image/jpeg");
  expect(result.asset.width).toBe(16);
  expect(result.asset.height).toBe(16);
  const bytes = assets.get(result.asset.id)?.bytes;
  if (bytes === undefined) {
    throw new Error("stored bytes missing");
  }
  expect(isPng(bytes)).toBe(true);
  const pixels = await samplePixels(bytes, [
    [4, 8],
    [12, 8],
  ]);
  expectReddish(pixels[0] ?? []);
  expectBluish(pixels[1] ?? []);
});

test("WebP import normalizes to PNG bytes preserving sampled colors", async () => {
  const file = await canvasFile(16, 16, "image/webp", "drawing.webp");
  const assets = new AssetStore();
  const result = requireOk(await importImage(file, { assets, importedMegapixels: 0 }));
  expect(result.asset.sourceMimeType).toBe("image/webp");
  expect(result.asset.width).toBe(16);
  expect(result.asset.height).toBe(16);
  const bytes = assets.get(result.asset.id)?.bytes;
  if (bytes === undefined) {
    throw new Error("stored bytes missing");
  }
  expect(isPng(bytes)).toBe(true);
  const pixels = await samplePixels(bytes, [
    [4, 8],
    [12, 8],
  ]);
  expectReddish(pixels[0] ?? []);
  expectBluish(pixels[1] ?? []);
});

test("EXIF orientation 6 fixture decodes once-oriented as 8x16 red-top blue-bottom", async () => {
  const file = await fixtureFile();
  const assets = new AssetStore();
  const result = requireOk(await importImage(file, { assets, importedMegapixels: 0 }));
  expect(result.asset.width).toBe(8);
  expect(result.asset.height).toBe(16);
  expect(result.asset.sourceMimeType).toBe("image/jpeg");
  const bytes = assets.get(result.asset.id)?.bytes;
  if (bytes === undefined) {
    throw new Error("stored bytes missing");
  }
  expect(isPng(bytes)).toBe(true);
  const pixels = await samplePixels(bytes, [
    [2, 4],
    [2, 12],
  ]);
  expectReddish(pixels[0] ?? []);
  expectBluish(pixels[1] ?? []);
});

test("falls back to <img> decoding when createImageBitmap rejects, applying orientation once", async () => {
  const file = await fixtureFile();
  const assets = new AssetStore();
  const original = window.createImageBitmap;
  let rejectedOnce = false;
  window.createImageBitmap = ((...args: Parameters<typeof original>) => {
    if (!rejectedOnce) {
      rejectedOnce = true;
      return Promise.reject(new TypeError("createImageBitmap unavailable"));
    }
    return original(...args);
  }) as typeof window.createImageBitmap;
  let outcome: ImportOutcome;
  try {
    outcome = await importImage(file, { assets, importedMegapixels: 0 });
  } finally {
    window.createImageBitmap = original;
  }
  const result = requireOk(outcome);
  expect(result.asset.width).toBe(8);
  expect(result.asset.height).toBe(16);
  const bytes = assets.get(result.asset.id)?.bytes;
  if (bytes === undefined) {
    throw new Error("stored bytes missing");
  }
  const pixels = await samplePixels(bytes, [
    [2, 4],
    [2, 12],
  ]);
  expectReddish(pixels[0] ?? []);
  expectBluish(pixels[1] ?? []);
});

test("512x512 routes to a new tshirt project as full-map", async () => {
  const file = await canvasFile(512, 512, "image/png", "classic.png");
  const result = requireOk(await importImage(file, { assets: new AssetStore(), importedMegapixels: 0 }));
  expect(result.route).toBe("new-project-tshirt");
  expect(result.placement).toBe("full-map");
});

test("585x559 routes to the shirt-or-pants question as full-map", async () => {
  const file = await canvasFile(585, 559, "image/png", "atlas.png");
  const result = requireOk(await importImage(file, { assets: new AssetStore(), importedMegapixels: 0 }));
  expect(result.route).toBe("shirt-or-pants-question");
  expect(result.placement).toBe("full-map");
});

test("400x300 routes to add-item as a decal", async () => {
  const file = await canvasFile(400, 300, "image/png", "sticker.png");
  const result = requireOk(await importImage(file, { assets: new AssetStore(), importedMegapixels: 0 }));
  expect(result.route).toBe("add-item");
  expect(result.placement).toBe("decal");
});

test("rejects a file over 20 MiB before decoding and leaves the store untouched", async () => {
  const file = new File([new Uint8Array(0)], "huge.png", { type: "image/png" });
  Object.defineProperty(file, "size", { value: LIMITS.IMPORT_MAX_BYTES + 1 });
  const assets = new AssetStore();
  const failure = requireFail(await importImage(file, { assets, importedMegapixels: 0 }));
  expect(failure).toEqual({ ok: false, kind: "too-large", message: IMPORT_TOO_LARGE_MESSAGE });
  expect(assets.size).toBe(0);
});

test("rejects mismatched magic bytes claiming to be PNG", async () => {
  const bytes = new TextEncoder().encode("GIF89a definitely not a png payload");
  const file = new File([bytes], "tricky.png", { type: "image/png" });
  const assets = new AssetStore();
  const failure = requireFail(await importImage(file, { assets, importedMegapixels: 0 }));
  expect(failure).toEqual({ ok: false, kind: "unsupported", message: IMPORT_UNSUPPORTED_MESSAGE });
  expect(assets.size).toBe(0);
});

test("rejects a gif file as unsupported", async () => {
  const bytes = new TextEncoder().encode("GIF89a some animated gif body");
  const file = new File([bytes], "anim.gif", { type: "image/gif" });
  const assets = new AssetStore();
  const failure = requireFail(await importImage(file, { assets, importedMegapixels: 0 }));
  expect(failure).toEqual({ ok: false, kind: "unsupported", message: IMPORT_UNSUPPORTED_MESSAGE });
  expect(assets.size).toBe(0);
});

test("rejects a 4097-wide PNG as too-large", async () => {
  const file = await canvasFile(4097, 1, "image/png", "wide.png");
  const assets = new AssetStore();
  const failure = requireFail(await importImage(file, { assets, importedMegapixels: 0 }));
  expect(failure).toEqual({ ok: false, kind: "too-large", message: IMPORT_TOO_LARGE_MESSAGE });
  expect(assets.size).toBe(0);
});

test("rejects when the cumulative megapixel budget is exceeded", async () => {
  const assets = new AssetStore();
  const exhausted = requireFail(
    await importImage(await canvasFile(10, 6, "image/png", "a.png"), { assets, importedMegapixels: 32 }),
  );
  expect(exhausted).toEqual({ ok: false, kind: "too-many-pixels", message: IMPORT_TOO_MANY_PIXELS_MESSAGE });
  const overSum = requireFail(
    await importImage(await canvasFile(500, 400, "image/png", "b.png"), { assets, importedMegapixels: 31.9 }),
  );
  expect(overSum.kind).toBe("too-many-pixels");
  expect(assets.size).toBe(0);
});

test("accepts cumulative megapixel sums up to exactly 32", async () => {
  const exact = requireOk(
    await importImage(await canvasFile(2000, 1000, "image/png", "exact.png"), {
      assets: new AssetStore(),
      importedMegapixels: 30,
    }),
  );
  expect(exact.megapixels).toBe(2);
  const under = requireOk(
    await importImage(await canvasFile(250, 200, "image/png", "small.png"), {
      assets: new AssetStore(),
      importedMegapixels: 31.9,
    }),
  );
  expect(under.megapixels).toBe(0.05);
});

test("rejects undecodable bytes with a valid PNG signature as decode-failed", async () => {
  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02, 0x03]);
  const file = new File([bytes], "broken.png", { type: "image/png" });
  const assets = new AssetStore();
  const failure = requireFail(await importImage(file, { assets, importedMegapixels: 0 }));
  expect(failure).toEqual({ ok: false, kind: "decode-failed", message: IMPORT_DECODE_FAILED_MESSAGE });
  expect(assets.size).toBe(0);
});

test("returns decode-failed when the store re-decode fails, leaving the store untouched", async () => {
  const file = await canvasFile(10, 6, "image/png", "art.png");
  const assets = new AssetStore();
  const original = window.createImageBitmap;
  let calls = 0;
  window.createImageBitmap = ((...args: Parameters<typeof original>) => {
    calls += 1;
    if (calls >= 2) {
      return Promise.reject(new TypeError("re-decode failed"));
    }
    return original(...args);
  }) as typeof window.createImageBitmap;
  let outcome: ImportOutcome;
  try {
    outcome = await importImage(file, { assets, importedMegapixels: 0 });
  } finally {
    window.createImageBitmap = original;
  }
  const failure = requireFail(outcome);
  expect(failure).toEqual({ ok: false, kind: "decode-failed", message: IMPORT_DECODE_FAILED_MESSAGE });
  expect(assets.size).toBe(0);
});

test("accepts a forty-image 0.8 MP accumulation totaling exactly 32 MP despite float drift", async () => {
  let accumulated = 0;
  for (let i = 0; i < 39; i++) {
    accumulated += 0.8;
  }
  expect(accumulated + 0.8).toBeGreaterThan(32);
  const file = await canvasFile(2000, 400, "image/png", "tile39.png");
  const result = requireOk(await importImage(file, { assets: new AssetStore(), importedMegapixels: accumulated }));
  expect(result.megapixels).toBe(0.8);
});

test("rejects drifted context values whose true sum still exceeds the megapixel budget", async () => {
  const file = await canvasFile(2000, 800, "image/png", "big.png");
  const assets = new AssetStore();
  const failure = requireFail(
    await importImage(file, { assets, importedMegapixels: 31.999999999999996 }),
  );
  expect(failure).toEqual({ ok: false, kind: "too-many-pixels", message: IMPORT_TOO_MANY_PIXELS_MESSAGE });
  expect(assets.size).toBe(0);
});
