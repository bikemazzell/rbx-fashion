import { expect, test } from "vitest";
import { AssetStore, pngAssetFromCanvas } from "../../src/assets/store";
import { composeProject, PATTERN_TOO_SMALL_MESSAGE } from "../../src/compositor/compose";
import { defaultTransform } from "../../src/compositor/math";
import { getTemplate } from "../../src/domain/registry";
import { createProject } from "../../src/domain/project";
import { exportRobloxPng } from "../../src/project/export";
import type { GarmentType, Layer, PlacementMode, ProjectDocument, Transform } from "../../src/domain/types";

const MAGENTA: [number, number, number, number] = [255, 0, 255, 255];
const CYAN: [number, number, number, number] = [0, 255, 255, 255];

function ctx2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (ctx === null) {
    throw new Error("2d context unavailable");
  }
  return ctx;
}

function transform(overrides?: Partial<Transform>): Transform {
  return {
    positionX: 0,
    positionY: 0,
    rotationDeg: 0,
    scaleX: 1,
    scaleY: 1,
    crop: { x: 0, y: 0, width: 1, height: 1 },
    ...overrides,
  };
}

function rasterLayer(
  id: string,
  assetId: string,
  placement: PlacementMode,
  layerTransform: Transform,
  extra?: { opacity?: number; visible?: boolean },
): Layer {
  return {
    id,
    name: id,
    kind: "raster",
    assetId,
    visible: extra?.visible ?? true,
    opacity: extra?.opacity ?? 1,
    placement,
    transform: layerTransform,
  };
}

function solidLayer(
  id: string,
  color: string,
  placement: PlacementMode,
  layerTransform: Transform,
  extra?: { opacity?: number; visible?: boolean },
): Layer {
  return {
    id,
    name: id,
    kind: "solid",
    color,
    visible: extra?.visible ?? true,
    opacity: extra?.opacity ?? 1,
    placement,
    transform: layerTransform,
  };
}

function cutoutLayer(
  id: string,
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  rotationDeg = 0,
  visible = true,
): Layer {
  return {
    id,
    name: id,
    kind: "cutout",
    visible,
    rect: { centerX, centerY, width, height, rotationDeg },
  };
}

function projectDoc(garmentType: GarmentType, layers: Layer[]): ProjectDocument {
  const doc = createProject(garmentType);
  doc.layers = layers;
  return doc;
}

function colorCanvas(width: number, height: number, color: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = ctx2d(canvas);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  return canvas;
}

function quadrantCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = ctx2d(canvas);
  ctx.fillStyle = "#ff0000";
  ctx.fillRect(0, 0, width / 2, height / 2);
  ctx.fillStyle = "#00ff00";
  ctx.fillRect(width / 2, 0, width / 2, height / 2);
  ctx.fillStyle = "#0000ff";
  ctx.fillRect(0, height / 2, width / 2, height / 2);
  ctx.fillStyle = "#ffff00";
  ctx.fillRect(width / 2, height / 2, width / 2, height / 2);
  return canvas;
}

function columnTileCanvas(size: number, left: string, right: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = ctx2d(canvas);
  ctx.fillStyle = left;
  ctx.fillRect(0, 0, size / 2, size);
  ctx.fillStyle = right;
  ctx.fillRect(size / 2, 0, size / 2, size);
  return canvas;
}

async function assetFrom(canvas: HTMLCanvasElement, id: string): Promise<AssetStore> {
  const asset = await pngAssetFromCanvas(canvas, id);
  return new AssetStore([asset]);
}

function pixel(ctx: CanvasRenderingContext2D, x: number, y: number): [number, number, number, number] {
  const data = ctx.getImageData(x, y, 1, 1).data;
  return [data[0] ?? 0, data[1] ?? 0, data[2] ?? 0, data[3] ?? 0];
}

function expectPixel(ctx: CanvasRenderingContext2D, x: number, y: number, expected: [number, number, number, number]) {
  expect(pixel(ctx, x, y), `pixel (${x},${y})`).toEqual(expected);
}

function expectTransparent(ctx: CanvasRenderingContext2D, x: number, y: number) {
  expectPixel(ctx, x, y, [0, 0, 0, 0]);
}

function captureFailure(action: () => void): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  return undefined;
}

function shirtPanels() {
  const template = getTemplate("shirt");
  if (template.garment === "tshirt") {
    throw new Error("expected shirt entry");
  }
  return template.panels;
}

test("full-map quadrant fills the 512x512 tshirt canvas with exact colors", async () => {
  const source = quadrantCanvas(512, 512);
  const store = await assetFrom(source, "quad");
  const defaults = defaultTransform("full-map", { width: 512, height: 512 }, getTemplate("tshirt"));
  const doc = projectDoc(
    "tshirt",
    [rasterLayer("quad", "quad", "full-map", transform(defaults))],
  );
  const { canvas, tileDraws } = composeProject({ document: doc, assets: store });
  expect(canvas.width).toBe(512);
  expect(canvas.height).toBe(512);
  expect(tileDraws).toBe(0);
  const ctx = ctx2d(canvas);
  expectPixel(ctx, 128, 128, [255, 0, 0, 255]);
  expectPixel(ctx, 384, 128, [0, 255, 0, 255]);
  expectPixel(ctx, 128, 384, [0, 0, 255, 255]);
  expectPixel(ctx, 384, 384, [255, 255, 0, 255]);
});

test("full-map canonical-size source on shirt keeps scale 1 and exact quadrant colors", async () => {
  const source = quadrantCanvas(585, 559);
  const store = await assetFrom(source, "quad");
  const defaults = defaultTransform("full-map", { width: 585, height: 559 }, getTemplate("shirt"));
  expect(defaults.scaleX).toBe(1);
  expect(defaults.scaleY).toBe(1);
  const doc = projectDoc("shirt", [rasterLayer("quad", "quad", "full-map", transform(defaults))]);
  const { canvas } = composeProject({ document: doc, assets: store });
  expect(canvas.width).toBe(585);
  expect(canvas.height).toBe(559);
  const ctx = ctx2d(canvas);
  expectPixel(ctx, 146, 139, [255, 0, 0, 255]);
  expectPixel(ctx, 438, 139, [0, 255, 0, 255]);
  expectPixel(ctx, 146, 419, [0, 0, 255, 255]);
  expectPixel(ctx, 438, 419, [255, 255, 0, 255]);
});

test("decal draws only inside the panel union at the placed position", async () => {
  const source = colorCanvas(8, 8, "#ff0000");
  const store = await assetFrom(source, "dot");
  const doc = projectDoc(
    "shirt",
    [rasterLayer("dot", "dot", "decal", transform({ positionX: 295, positionY: 138 }))],
  );
  const { canvas } = composeProject({ document: doc, assets: store });
  const ctx = ctx2d(canvas);
  expectPixel(ctx, 295, 138, [255, 0, 0, 255]);
  expectPixel(ctx, 291, 134, [255, 0, 0, 255]);
  expectPixel(ctx, 298, 141, [255, 0, 0, 255]);
  expectTransparent(ctx, 290, 137);
  expectTransparent(ctx, 299, 137);
  expectTransparent(ctx, 295, 133);
  expectTransparent(ctx, 295, 142);
  expectTransparent(ctx, 250, 100);
  expectTransparent(ctx, 5, 5);
});

test("decal placed outside the panel union draws nothing", async () => {
  const source = colorCanvas(8, 8, "#ff0000");
  const store = await assetFrom(source, "dot");
  const doc = projectDoc(
    "shirt",
    [rasterLayer("dot", "dot", "decal", transform({ positionX: 295, positionY: 300 }))],
  );
  const { canvas } = composeProject({ document: doc, assets: store });
  const ctx = ctx2d(canvas);
  expectTransparent(ctx, 295, 300);
  expectTransparent(ctx, 292, 297);
  expectTransparent(ctx, 298, 303);
});

test("solid decal fills its transformed square clipped to the union", async () => {
  const doc = projectDoc(
    "shirt",
    [solidLayer("block", "#00ff00", "decal", transform({ positionX: 231, positionY: 74, scaleX: 64, scaleY: 64 }))],
  );
  const { canvas } = composeProject({ document: doc, assets: new AssetStore() });
  const ctx = ctx2d(canvas);
  expectPixel(ctx, 240, 60, [0, 255, 0, 255]);
  expectPixel(ctx, 240, 80, [0, 255, 0, 255]);
  expectPixel(ctx, 262, 105, [0, 255, 0, 255]);
  expectTransparent(ctx, 230, 60);
  expectTransparent(ctx, 265, 80);
  expectTransparent(ctx, 240, 110);
});

test("pattern tiles continuously across torso seam-adjacent columns and leaves gutters empty", async () => {
  const source = columnTileCanvas(64, "#ff00ff", "#00ffff");
  const store = await assetFrom(source, "tile");
  const doc = projectDoc(
    "shirt",
    [rasterLayer("tile", "tile", "pattern", transform({ positionX: 16, positionY: 32 }))],
  );
  const { canvas, tileDraws } = composeProject({ document: doc, assets: store });
  expect(tileDraws).toBe(66);
  const ctx = ctx2d(canvas);
  expectPixel(ctx, 212, 84, CYAN);
  expectPixel(ctx, 278, 84, CYAN);
  expectPixel(ctx, 228, 84, MAGENTA);
  expectPixel(ctx, 231, 84, MAGENTA);
  expectPixel(ctx, 232, 84, MAGENTA);
  expectPixel(ctx, 220, 360, MAGENTA);
  expectTransparent(ctx, 230, 30);
  expectTransparent(ctx, 295, 300);
  expectTransparent(ctx, 5, 5);
});

test("solid pattern fills every panel exactly and leaves gutters untouched", async () => {
  const doc = projectDoc("shirt", [solidLayer("fill", "#3366cc", "pattern", transform())]);
  const { canvas } = composeProject({ document: doc, assets: new AssetStore() });
  expect(canvas.width).toBe(585);
  expect(canvas.height).toBe(559);
  const ctx = ctx2d(canvas);
  const image = ctx.getImageData(0, 0, 585, 559).data;
  const panels = shirtPanels();
  const mismatches: string[] = [];
  for (let y = 0; y < 559; y++) {
    for (let x = 0; x < 585; x++) {
      const index = (y * 585 + x) * 4;
      const inside = panels.some(
        (panel) =>
          x >= panel.atlasRect.x &&
          x < panel.atlasRect.x + panel.atlasRect.width &&
          y >= panel.atlasRect.y &&
          y < panel.atlasRect.y + panel.atlasRect.height,
      );
      const expected = inside ? [51, 102, 204, 255] : [0, 0, 0, 0];
      const actual = [image[index] ?? 0, image[index + 1] ?? 0, image[index + 2] ?? 0, image[index + 3] ?? 0];
      if (actual[0] !== expected[0] || actual[1] !== expected[1] || actual[2] !== expected[2] || actual[3] !== expected[3]) {
        if (mismatches.length < 10) {
          mismatches.push(`(${x},${y}) expected ${expected.join(",")} got ${actual.join(",")}`);
        }
      }
    }
  }
  expect(mismatches).toEqual([]);
});

test("solid full-map with document defaults for a 1x1 source covers the whole canvas", () => {
  const defaults = defaultTransform("full-map", { width: 1, height: 1 }, getTemplate("shirt"));
  expect(defaults.scaleX).toBe(585);
  expect(defaults.scaleY).toBe(559);
  const doc = projectDoc("shirt", [solidLayer("green", "#00ff00", "full-map", transform(defaults))]);
  const { canvas } = composeProject({ document: doc, assets: new AssetStore() });
  const ctx = ctx2d(canvas);
  expectPixel(ctx, 0, 0, [0, 255, 0, 255]);
  expectPixel(ctx, 292, 279, [0, 255, 0, 255]);
  expectPixel(ctx, 584, 558, [0, 255, 0, 255]);
});

test("solid full-map with a scale-1 transform paints exactly one pixel", () => {
  const doc = projectDoc(
    "tshirt",
    [solidLayer("dot", "#ff0000", "full-map", transform({ positionX: 10.5, positionY: 20.5 }))],
  );
  const { canvas } = composeProject({ document: doc, assets: new AssetStore() });
  const ctx = ctx2d(canvas);
  expectPixel(ctx, 10, 20, [255, 0, 0, 255]);
  expectTransparent(ctx, 11, 20);
  expectTransparent(ctx, 10, 21);
  expectTransparent(ctx, 9, 20);
  expectTransparent(ctx, 256, 256);
});

test("opacity 0.5 over a white base blends within 1 of the expected value", async () => {
  const defaults = defaultTransform("full-map", { width: 1, height: 1 }, getTemplate("shirt"));
  const doc = projectDoc("shirt", [
    solidLayer("base", "#ffffff", "full-map", transform(defaults)),
    solidLayer("top", "#ff0000", "full-map", transform(defaults), { opacity: 0.5 }),
  ]);
  const { canvas } = composeProject({ document: doc, assets: new AssetStore() });
  const ctx = ctx2d(canvas);
  const [r, g, b, a] = pixel(ctx, 292, 279);
  expect(r).toBe(255);
  expect(Math.abs(g - 127.5)).toBeLessThanOrEqual(1);
  expect(Math.abs(b - 127.5)).toBeLessThanOrEqual(1);
  expect(a).toBe(255);
});

test("hidden layers are skipped at compose", async () => {
  const defaults = defaultTransform("full-map", { width: 1, height: 1 }, getTemplate("shirt"));
  const doc = projectDoc("shirt", [
    solidLayer("red", "#ff0000", "full-map", transform(defaults)),
    solidLayer("blue", "#0000ff", "full-map", transform(defaults), { visible: false }),
  ]);
  const { canvas } = composeProject({ document: doc, assets: new AssetStore() });
  expectPixel(ctx2d(canvas), 10, 10, [255, 0, 0, 255]);
});

test("later layers composite over earlier layers", async () => {
  const defaults = defaultTransform("full-map", { width: 1, height: 1 }, getTemplate("shirt"));
  const doc = projectDoc("shirt", [
    solidLayer("red", "#ff0000", "full-map", transform(defaults)),
    solidLayer("blue", "#0000ff", "full-map", transform(defaults)),
  ]);
  const { canvas } = composeProject({ document: doc, assets: new AssetStore() });
  expectPixel(ctx2d(canvas), 10, 10, [0, 0, 255, 255]);
});

test.each(["tshirt", "shirt", "pants"] as const)(
  "a visible cutout clears %s after all artwork while preserving exterior pixels",
  (garment) => {
    const template = getTemplate(garment);
    const defaults = defaultTransform("full-map", { width: 1, height: 1 }, template);
    const centerX = Math.floor(template.width / 2);
    const centerY = Math.floor(template.height / 2);
    const doc = projectDoc(garment, [
      solidLayer("red", "#ff0000", "full-map", transform(defaults)),
      cutoutLayer("hole", centerX, centerY, 80, 60),
    ]);
    const { canvas } = composeProject({ document: doc, assets: new AssetStore() });
    const ctx = ctx2d(canvas);
    expectTransparent(ctx, centerX, centerY);
    expectPixel(ctx, 2, 2, [255, 0, 0, 255]);
  },
);

test("cutouts are final masks regardless of array order and hidden cutouts do nothing", () => {
  const defaults = defaultTransform("full-map", { width: 1, height: 1 }, getTemplate("tshirt"));
  const adversarial = projectDoc("tshirt", [
    cutoutLayer("hole", 256, 256, 100, 100),
    solidLayer("later", "#00ff00", "full-map", transform(defaults)),
  ]);
  expectTransparent(
    ctx2d(composeProject({ document: adversarial, assets: new AssetStore() }).canvas),
    256,
    256,
  );

  const hidden = projectDoc("tshirt", [
    solidLayer("green", "#00ff00", "full-map", transform(defaults)),
    cutoutLayer("hidden", 256, 256, 100, 100, 0, false),
  ]);
  expectPixel(
    ctx2d(composeProject({ document: hidden, assets: new AssetStore() }).canvas),
    256,
    256,
    [0, 255, 0, 255],
  );
});

test("overlapping rotated cutouts erase their union", () => {
  const defaults = defaultTransform("full-map", { width: 1, height: 1 }, getTemplate("tshirt"));
  const doc = projectDoc("tshirt", [
    solidLayer("base", "#0000ff", "full-map", transform(defaults)),
    cutoutLayer("straight", 220, 256, 80, 40),
    cutoutLayer("rotated", 292, 256, 80, 40, 90),
  ]);
  const ctx = ctx2d(composeProject({ document: doc, assets: new AssetStore() }).canvas);
  expectTransparent(ctx, 220, 256);
  expectTransparent(ctx, 292, 256);
  expectTransparent(ctx, 292, 280);
  expectPixel(ctx, 20, 20, [0, 0, 255, 255]);
});

test("an arbitrary-angle cutout erases only points inside its rotated rectangle", () => {
  const defaults = defaultTransform("full-map", { width: 1, height: 1 }, getTemplate("tshirt"));
  const doc = projectDoc("tshirt", [
    solidLayer("base", "#ff0000", "full-map", transform(defaults)),
    cutoutLayer("diagonal", 256, 256, 100, 40, 45),
  ]);
  const ctx = ctx2d(composeProject({ document: doc, assets: new AssetStore() }).canvas);
  expectTransparent(ctx, 256, 256);
  expectTransparent(ctx, 277, 277);
  expectPixel(ctx, 296, 256, [255, 0, 0, 255]);
});

test("a 4px tile pattern exceeds the per-layer budget and fails with the exact message", async () => {
  const source = columnTileCanvas(4, "#ff00ff", "#00ffff");
  const store = await assetFrom(source, "tiny");
  const doc = projectDoc("shirt", [rasterLayer("tiny", "tiny", "pattern", transform({ positionX: 2, positionY: 2 }))]);
  const failure = captureFailure(() => composeProject({ document: doc, assets: store }));
  expect(failure).toEqual({ kind: "pattern-too-small", message: PATTERN_TOO_SMALL_MESSAGE });
  expect(PATTERN_TOO_SMALL_MESSAGE).toBe("Pattern is too small—make it larger");
});

test("invalid documents fail with kind invalid-document", async () => {
  const source = colorCanvas(8, 8, "#ff0000");
  const store = await assetFrom(source, "dot");
  const tooMany = projectDoc(
    "shirt",
    Array.from({ length: 9 }, (_, index) => solidLayer(`l${index}`, "#ffffff", "full-map", transform())),
  );
  expect(captureFailure(() => composeProject({ document: tooMany, assets: store }))).toMatchObject({
    kind: "invalid-document",
  });
  const badScale = projectDoc("shirt", [solidLayer("s", "#ffffff", "full-map", transform({ scaleX: 0 }))]);
  expect(captureFailure(() => composeProject({ document: badScale, assets: store }))).toMatchObject({
    kind: "invalid-document",
  });
  const badOpacity = projectDoc(
    "shirt",
    [solidLayer("s", "#ffffff", "full-map", transform(), { opacity: 1.5 })],
  );
  expect(captureFailure(() => composeProject({ document: badOpacity, assets: store }))).toMatchObject({
    kind: "invalid-document",
  });
  const badCrop = projectDoc(
    "shirt",
    [rasterLayer("d", "dot", "full-map", transform({ crop: { x: 0, y: 0, width: 0, height: 1 } }))],
  );
  expect(captureFailure(() => composeProject({ document: badCrop, assets: store }))).toMatchObject({
    kind: "invalid-document",
  });
  const missingAsset = projectDoc("shirt", [rasterLayer("d", "ghost", "full-map", transform())]);
  expect(captureFailure(() => composeProject({ document: missingAsset, assets: store }))).toMatchObject({
    kind: "invalid-document",
  });
});

test("repeated export of the same document is byte-identical and pixel-identical", async () => {
  const source = quadrantCanvas(512, 512);
  const store = await assetFrom(source, "quad");
  const defaults = defaultTransform("full-map", { width: 512, height: 512 }, getTemplate("tshirt"));
  const doc = projectDoc("tshirt", [rasterLayer("quad", "quad", "full-map", transform(defaults))]);
  const results: Blob[] = [];
  for (let run = 0; run < 3; run++) {
    results.push((await exportRobloxPng(doc, store)).blob);
  }
  const bytes = await Promise.all(results.map((blob) => blob.arrayBuffer()));
  expect(bytes[1]).toEqual(bytes[0]);
  expect(bytes[2]).toEqual(bytes[0]);
  const first = await createImageBitmap(results[0] ?? new Blob());
  const last = await createImageBitmap(results[2] ?? new Blob());
  const scan = (bitmap: ImageBitmap) => {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = ctx2d(canvas);
    ctx.drawImage(bitmap, 0, 0);
    return ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
  };
  expect(scan(last)).toEqual(scan(first));
  first.close();
  last.close();
});
