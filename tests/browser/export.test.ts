import { expect, test, vi } from "vitest";
import { AssetStore, pngAssetFromCanvas } from "../../src/assets/store";
import { defaultTransform } from "../../src/compositor/math";
import { getTemplate } from "../../src/domain/registry";
import { createProject } from "../../src/domain/project";
import {
  downloadBlob,
  EXPORT_DISCLAIMER,
  exportRobloxPng,
  TRANSPARENT_WARNING,
} from "../../src/project/export";
import type { Transform } from "../../src/domain/types";

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

test("export returns a canonical-size PNG blob with null warning for a visible project", async () => {
  const canvas = quadrantCanvas(512, 512);
  const asset = await pngAssetFromCanvas(canvas, "quad");
  const doc = createProject("tshirt");
  const defaults = defaultTransform("full-map", { width: 512, height: 512 }, getTemplate("tshirt"));
  doc.layers = [
    {
      id: "quad",
      name: "quad",
      kind: "raster",
      assetId: "quad",
      visible: true,
      opacity: 1,
      placement: "full-map",
      transform: transform(defaults),
    },
  ];
  const result = await exportRobloxPng(doc, new AssetStore([asset]));
  expect(result.blob.type).toBe("image/png");
  expect(result.warning).toBeNull();
  const bitmap = await createImageBitmap(result.blob);
  expect(bitmap.width).toBe(512);
  expect(bitmap.height).toBe(512);
  bitmap.close();
});

test("export verifies shirt canvas dimensions after re-decode", async () => {
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
  const result = await exportRobloxPng(doc, new AssetStore());
  expect(result.blob.type).toBe("image/png");
  expect(result.warning).toBeNull();
  const bitmap = await createImageBitmap(result.blob);
  expect(bitmap.width).toBe(585);
  expect(bitmap.height).toBe(559);
  bitmap.close();
});

test("a completely transparent project warns as fully-transparent", async () => {
  const doc = createProject("tshirt");
  const result = await exportRobloxPng(doc, new AssetStore());
  expect(result.warning).toBe("fully-transparent");
  expect(result.blob.type).toBe("image/png");
  const bitmap = await createImageBitmap(result.blob);
  expect(bitmap.width).toBe(512);
  expect(bitmap.height).toBe(512);
  bitmap.close();
});

test("export preserves a partially transparent cutout in an exact-size RGBA PNG", async () => {
  const doc = createProject("tshirt");
  doc.layers = [
    {
      id: "fill",
      name: "fill",
      kind: "solid",
      color: "#ff0000",
      visible: true,
      opacity: 1,
      placement: "full-map",
      transform: transform({ positionX: 256, positionY: 256, scaleX: 512, scaleY: 512 }),
    },
    {
      id: "hole",
      name: "Cut Out 1",
      kind: "cutout",
      visible: true,
      rect: { centerX: 256, centerY: 256, width: 100, height: 80, rotationDeg: 0 },
    },
  ];
  const result = await exportRobloxPng(doc, new AssetStore());
  expect(result.warning).toBeNull();
  expect(result.blob.type).toBe("image/png");
  const bitmap = await createImageBitmap(result.blob);
  try {
    expect(bitmap.width).toBe(512);
    expect(bitmap.height).toBe(512);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = ctx2d(canvas);
    ctx.drawImage(bitmap, 0, 0);
    expect(ctx.getImageData(256, 256, 1, 1).data[3]).toBe(0);
    expect(ctx.getImageData(10, 10, 1, 1).data[3]).toBe(255);
  } finally {
    bitmap.close();
  }
});

test("copy constants are nonempty and exact", () => {
  expect(EXPORT_DISCLAIMER.length).toBeGreaterThan(0);
  expect(TRANSPARENT_WARNING.length).toBeGreaterThan(0);
  expect(EXPORT_DISCLAIMER).toBe(
    "Roblox moderation and avatar compatibility aren't controlled by this app—test your image in Roblox Studio before uploading.",
  );
  expect(TRANSPARENT_WARNING).toBe(
    "Your clothing is completely see-through. Add a picture or color before downloading.",
  );
});

test("downloadBlob anchors the blob URL and revokes it", () => {
  const createSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
  const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  downloadBlob("my-shirt.png", new Blob(["x"], { type: "image/png" }));
  expect(createSpy).toHaveBeenCalledTimes(1);
  expect(clickSpy).toHaveBeenCalledTimes(1);
  const anchor = clickSpy.mock.instances[0] as HTMLAnchorElement | undefined;
  expect(anchor?.download).toBe("my-shirt.png");
  expect(anchor?.href).toBe("blob:mock");
  expect(revokeSpy).toHaveBeenCalledTimes(1);
  expect(document.querySelector("a[download='my-shirt.png']")).toBeNull();
  createSpy.mockRestore();
  revokeSpy.mockRestore();
  clickSpy.mockRestore();
});
