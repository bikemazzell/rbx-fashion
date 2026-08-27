import { expect, test } from "vitest";
import { AssetStore, type NormalizedPngAsset } from "../../src/assets/store";

function asset(id: string): NormalizedPngAsset {
  return { id, bytes: new Uint8Array(8), width: 1, height: 1, drawable: {} as ImageBitmap };
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
