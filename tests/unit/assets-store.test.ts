import { expect, test, vi } from "vitest";
import { AssetStore, type NormalizedPngAsset } from "../../src/assets/store";

function asset(id: string): NormalizedPngAsset {
  return { id, bytes: new Uint8Array(8), width: 1, height: 1, drawable: {} as ImageBitmap };
}

function bitmapAsset(id: string): { asset: NormalizedPngAsset; close: ReturnType<typeof vi.fn> } {
  const close = vi.fn();
  const asset = {
    id,
    bytes: new Uint8Array(8),
    width: 1,
    height: 1,
    drawable: { close } as unknown as ImageBitmap,
  };
  return { asset, close };
}

test("retainOnly keeps referenced assets and drops the rest", () => {
  const store = new AssetStore([asset("a"), asset("b"), asset("c")]);
  store.retainOnly(new Set(["a", "c"]));
  expect(store.has("a")).toBe(true);
  expect(store.has("b")).toBe(false);
  expect(store.has("c")).toBe(true);
  expect(store.size).toBe(2);
});

test("retainOnly is idempotent", () => {
  const store = new AssetStore([asset("a"), asset("b")]);
  store.retainOnly(new Set(["a"]));
  store.retainOnly(new Set(["a"]));
  expect(store.size).toBe(1);
  expect(store.has("a")).toBe(true);
});

test("retainOnly with an empty set clears the store", () => {
  const store = new AssetStore([asset("a"), asset("b")]);
  store.retainOnly(new Set());
  expect(store.size).toBe(0);
});

test("retainOnly accepts any iterable of ids", () => {
  const store = new AssetStore([asset("a"), asset("b")]);
  store.retainOnly(["b"]);
  expect(store.size).toBe(1);
  expect(store.has("b")).toBe(true);
});

test("remove deletes an asset and closes its bitmap", () => {
  const store = new AssetStore();
  const { asset, close } = bitmapAsset("a");
  store.add(asset);
  expect(store.remove("a")).toBe(true);
  expect(store.has("a")).toBe(false);
  expect(close).toHaveBeenCalledTimes(1);
});

test("remove returns false for a missing id without throwing", () => {
  const store = new AssetStore();
  expect(store.remove("nope")).toBe(false);
});

test("remove leaves canvas drawables untouched", () => {
  const store = new AssetStore();
  const canvasAsset: NormalizedPngAsset = {
    id: "canvas-asset",
    bytes: new Uint8Array(8),
    width: 1,
    height: 1,
    drawable: {} as HTMLCanvasElement,
  };
  store.add(canvasAsset);
  expect(() => store.remove("canvas-asset")).not.toThrow();
  expect(store.size).toBe(0);
});

test("retainOnly closes the bitmaps of dropped assets", () => {
  const store = new AssetStore();
  const kept = bitmapAsset("kept");
  const dropped = bitmapAsset("dropped");
  store.add(kept.asset);
  store.add(dropped.asset);
  store.retainOnly(["kept"]);
  expect(kept.close).not.toHaveBeenCalled();
  expect(dropped.close).toHaveBeenCalledTimes(1);
});
