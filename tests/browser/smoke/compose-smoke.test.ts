import { expect, test } from "vitest";
import { AssetStore, pngAssetFromCanvas } from "../../../src/assets/store";
import { composeProject } from "../../../src/compositor/compose";
import { defaultTransform } from "../../../src/compositor/math";
import { getTemplate } from "../../../src/domain/registry";
import { createProject } from "../../../src/domain/project";
import type { Layer, Transform } from "../../../src/domain/types";

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

function rasterLayer(id: string, assetId: string, layerTransform: Transform): Layer {
  return {
    id,
    name: id,
    kind: "raster",
    assetId,
    visible: true,
    opacity: 1,
    placement: "full-map",
    transform: layerTransform,
  };
}

function expectColorNear(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  expected: readonly [number, number, number],
) {
  const data = ctx.getImageData(x, y, 1, 1).data;
  const actual: [number, number, number] = [data[0] ?? 0, data[1] ?? 0, data[2] ?? 0];
  for (const channel of [0, 1, 2]) {
    expect(Math.abs((actual[channel] ?? 0) - (expected[channel] ?? 0))).toBeLessThanOrEqual(2);
  }
}

test("full-map quadrant anchors land with correct canvas dimensions and alpha bounds", async () => {
  const tshirtSource = quadrantCanvas(512, 512);
  const tshirtAsset = await pngAssetFromCanvas(tshirtSource, "quad");
  const tshirtDoc = createProject("tshirt");
  const tshirtDefaults = defaultTransform("full-map", { width: 512, height: 512 }, getTemplate("tshirt"));
  tshirtDoc.layers = [rasterLayer("quad", "quad", transform(tshirtDefaults))];
  const tshirt = composeProject({ document: tshirtDoc, assets: new AssetStore([tshirtAsset]) });
  expect(tshirt.canvas.width).toBe(512);
  expect(tshirt.canvas.height).toBe(512);
  const tshirtCtx = ctx2d(tshirt.canvas);
  expectColorNear(tshirtCtx, 128, 128, [255, 0, 0]);
  expectColorNear(tshirtCtx, 384, 128, [0, 255, 0]);
  expectColorNear(tshirtCtx, 128, 384, [0, 0, 255]);
  expectColorNear(tshirtCtx, 384, 384, [255, 255, 0]);

  const shirtSource = quadrantCanvas(585, 559);
  const shirtAsset = await pngAssetFromCanvas(shirtSource, "quad");
  const shirtDoc = createProject("shirt");
  const shirtDefaults = defaultTransform("full-map", { width: 585, height: 559 }, getTemplate("shirt"));
  shirtDoc.layers = [rasterLayer("quad", "quad", transform(shirtDefaults))];
  const shirt = composeProject({ document: shirtDoc, assets: new AssetStore([shirtAsset]) });
  expect(shirt.canvas.width).toBe(585);
  expect(shirt.canvas.height).toBe(559);
  const shirtCtx = ctx2d(shirt.canvas);
  expectColorNear(shirtCtx, 146, 139, [255, 0, 0]);
  expectColorNear(shirtCtx, 438, 139, [0, 255, 0]);
  expectColorNear(shirtCtx, 146, 419, [0, 0, 255]);
  expectColorNear(shirtCtx, 438, 419, [255, 255, 0]);

  for (const ctx of [tshirtCtx, shirtCtx]) {
    const image = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height).data;
    let opaque = 0;
    let minAlpha = 255;
    let maxAlpha = 0;
    for (let index = 3; index < image.length; index += 4) {
      const alpha = image[index] ?? 0;
      minAlpha = Math.min(minAlpha, alpha);
      maxAlpha = Math.max(maxAlpha, alpha);
      if (alpha > 0) {
        opaque++;
      }
    }
    expect(minAlpha).toBeGreaterThanOrEqual(0);
    expect(maxAlpha).toBeLessThanOrEqual(255);
    expect(opaque).toBeGreaterThan(0);
  }
});

test("solid pattern fills panels and leaves gutters transparent", () => {
  const doc = createProject("shirt");
  doc.layers = [
    {
      id: "fill",
      name: "fill",
      kind: "solid",
      color: "#3366cc",
      visible: true,
      opacity: 1,
      placement: "pattern",
      transform: transform(),
    },
  ];
  const { canvas } = composeProject({ document: doc, assets: new AssetStore() });
  expect(canvas.width).toBe(585);
  expect(canvas.height).toBe(559);
  const ctx = ctx2d(canvas);
  expectColorNear(ctx, 295, 138, [51, 102, 204]);
  const gutter = ctx.getImageData(5, 5, 1, 1).data;
  expect(gutter[3] ?? 255).toBe(0);
});
