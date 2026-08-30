import { expect, test } from "vitest";
import { Zip, ZipPassThrough, zipSync } from "fflate";
import { sha256Hex } from "../../src/assets/hash";
import { createProject } from "../../src/domain/project";
import { LIMITS } from "../../src/domain/types";
import type {
  AssetManifestEntry,
  Layer,
  ProjectDocument,
  Transform,
} from "../../src/domain/types";
import { isValidProjectDocument } from "../../src/editor/state";
import {
  isAllowedEntryPath,
  openProject,
  saveProject,
  ZIP_LIMIT_DEFAULTS,
} from "../../src/project/archive";
import {
  OPEN_INVALID_MESSAGE,
  OPEN_TOO_BIG_MESSAGE,
  SAVE_INVALID_MESSAGE,
  SAVE_TOO_BIG_MESSAGE,
} from "../../src/editor/ui/text";

function fakePng(width: number, height: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13, false);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  bytes.set([8, 6, 0, 0, 0], 24);
  return bytes;
}

async function manifestEntry(
  id: string,
  bytes: Uint8Array<ArrayBuffer>,
): Promise<AssetManifestEntry> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    id,
    path: `assets/${id}.png`,
    originalName: `${id}.png`,
    sourceMimeType: "image/png",
    byteLength: bytes.length,
    width: view.getUint32(16, false),
    height: view.getUint32(20, false),
    sha256: await sha256Hex(bytes),
    source: "imported",
  };
}

function rasterLayer(id: string, assetId: string): Layer {
  return {
    id,
    name: `Picture ${id}`,
    kind: "raster",
    assetId,
    visible: true,
    opacity: 1,
    placement: "decal",
    transform: identityTransform(),
  };
}

function solidLayer(id: string): Layer {
  return {
    id,
    name: `Color ${id}`,
    kind: "solid",
    color: "#3366cc",
    visible: true,
    opacity: 1,
    placement: "pattern",
    transform: identityTransform(),
  };
}

function identityTransform(): Transform {
  return {
    positionX: 0,
    positionY: 0,
    rotationDeg: 0,
    scaleX: 1,
    scaleY: 1,
    crop: { x: 0, y: 0, width: 1, height: 1 },
  };
}

async function validProject(): Promise<{
  document: ProjectDocument;
  assetBytes: Uint8Array<ArrayBuffer>;
}> {
  const assetBytes = fakePng(32, 16);
  const document = createProject("tshirt", "Probe");
  document.layers = [rasterLayer("layer-1", "asset-1"), solidLayer("layer-2")];
  document.assets = [await manifestEntry("asset-1", assetBytes)];
  return { document, assetBytes };
}

function projectZip(
  document: ProjectDocument,
  assetBytes: Uint8Array,
  extra: Record<string, Uint8Array> = {},
  omit: readonly string[] = [],
): Uint8Array<ArrayBuffer> {
  const entries: Record<string, Uint8Array> = { ...extra };
  if (!omit.includes("project.json")) {
    entries["project.json"] = new TextEncoder().encode(JSON.stringify(document));
  }
  for (const entry of document.assets) {
    const key = `assets/${entry.id}.png`;
    if (!omit.includes(key)) {
      entries[key] = assetBytes;
    }
  }
  return zipSync(entries);
}

function retype(value: unknown): ProjectDocument {
  return value as ProjectDocument;
}

function fileOf(bytes: Uint8Array<ArrayBuffer>, name = "project.rbxcloth.zip"): File {
  return new File([bytes], name, { type: "application/zip" });
}

function assetFreeZip(document: unknown): Uint8Array<ArrayBuffer> {
  return zipSync({
    "project.json": new TextEncoder().encode(JSON.stringify(document)),
  });
}

function concat(parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

async function zipWithDuplicateNames(): Promise<Uint8Array<ArrayBuffer>> {
  const parts: Uint8Array[] = [];
  let done: () => void = () => {};
  const finished = new Promise<void>((resolve) => {
    done = resolve;
  });
  const zip = new Zip();
  zip.ondata = (err, data, final) => {
    if (err !== null) {
      throw err;
    }
    parts.push(data);
    if (final) {
      done();
    }
  };
  for (const payload of [
    new Uint8Array([1, 2, 3]),
    new Uint8Array([4, 5, 6]),
  ]) {
    const file = new ZipPassThrough("assets/x.png");
    zip.add(file);
    file.push(payload, true);
  }
  zip.end();
  await finished;
  return concat(parts);
}

function expectInvalid(result: Awaited<ReturnType<typeof openProject>>): void {
  expect(result).toEqual({ ok: false, kind: "invalid", message: OPEN_INVALID_MESSAGE });
}

test("zip limit defaults are the real LIMITS constants", () => {
  expect(ZIP_LIMIT_DEFAULTS.compressed).toBe(LIMITS.ZIP_MAX_COMPRESSED);
  expect(ZIP_LIMIT_DEFAULTS.expanded).toBe(LIMITS.ZIP_MAX_EXPANDED);
  expect(ZIP_LIMIT_DEFAULTS.entries).toBe(LIMITS.ZIP_MAX_ENTRIES);
});

test("open migrates an asset-free v1 project to the current v2 schema", async () => {
  const legacy = {
    format: "rbx-fashion-project",
    schemaVersion: 1,
    name: "Legacy Shirt",
    garmentType: "shirt",
    layers: [solidLayer("legacy-color")],
    assets: [],
  };

  const result = await openProject(fileOf(assetFreeZip(legacy)));
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.document).toEqual({ ...legacy, schemaVersion: 2 });
    expect(result.assets).toEqual([]);
  }
});

test("an asset-free v2 project saves and reopens deterministically", async () => {
  const document = {
    format: "rbx-fashion-project" as const,
    schemaVersion: 2 as const,
    name: "Cutout Ready",
    garmentType: "pants" as const,
    layers: [],
    assets: [],
  };

  const first = await saveProject(document, () => {
    throw new Error("asset callback must not run");
  });
  const second = await saveProject(document, () => {
    throw new Error("asset callback must not run");
  });
  expect(first.ok).toBe(true);
  expect(second.ok).toBe(true);
  if (first.ok && second.ok) {
    expect(new Uint8Array(await first.blob.arrayBuffer())).toEqual(
      new Uint8Array(await second.blob.arrayBuffer()),
    );
    const reopened = await openProject(fileOf(new Uint8Array(await first.blob.arrayBuffer())));
    expect(reopened.ok).toBe(true);
    if (reopened.ok) {
      expect(reopened.document).toEqual(document);
    }
  }
});

test("open rejects unknown schemas and strict cutout hybrids", async () => {
  const base = {
    format: "rbx-fashion-project",
    schemaVersion: 2,
    name: "Strict",
    garmentType: "shirt",
    layers: [
      {
        id: "cutout-1",
        name: "Cut Out 1",
        kind: "cutout",
        visible: true,
        rect: { centerX: 100, centerY: 100, width: 80, height: 60, rotationDeg: 0 },
      },
    ],
    assets: [],
  };

  expectInvalid(await openProject(fileOf(assetFreeZip({ ...base, schemaVersion: 99 }))));
  expectInvalid(
    await openProject(
      fileOf(assetFreeZip({ ...base, layers: [{ ...base.layers[0], opacity: 1 }] })),
    ),
  );
  expectInvalid(
    await openProject(
      fileOf(
        assetFreeZip({
          ...base,
          layers: [
            {
              ...base.layers[0],
              rect: { ...base.layers[0]?.rect, unexpected: true },
            },
          ],
        }),
      ),
    ),
  );
});

test("v2 validation rejects a raster layer without a matching manifest asset", () => {
  const document = createProject("shirt", "Missing");
  document.layers = [rasterLayer("layer-1", "missing")];
  expect(isValidProjectDocument(document)).toBe(false);
});

test("message constants are nonempty strings", () => {
  for (const message of [SAVE_TOO_BIG_MESSAGE, OPEN_TOO_BIG_MESSAGE, OPEN_INVALID_MESSAGE]) {
    expect(typeof message).toBe("string");
    expect(message.length).toBeGreaterThan(10);
  }
});

test("save accepts when the expanded payload equals the limit and rejects one byte above", async () => {
  const { document, assetBytes } = await validProject();
  const getAssetBytes = () => assetBytes;
  const jsonLength = new TextEncoder().encode(JSON.stringify(document)).length;
  const expanded = jsonLength + assetBytes.length;
  const atLimit = await saveProject(document, getAssetBytes, { expanded });
  expect(atLimit.ok).toBe(true);
  const overLimit = await saveProject(document, getAssetBytes, { expanded: expanded - 1 });
  expect(overLimit).toEqual({
    ok: false,
    kind: "too-large",
    message: SAVE_TOO_BIG_MESSAGE,
  });
});

test("save rejects on expanded payload before compressing highly compressible input", async () => {
  const zeros = new Uint8Array(1024 * 1024);
  const document = createProject("tshirt", "Zeros");
  document.layers = [];
  document.assets = [
    {
      id: "asset-1",
      path: "assets/asset-1.png",
      originalName: "zeros.png",
      sourceMimeType: "image/png",
      byteLength: zeros.length,
      width: 1024,
      height: 1024,
      sha256: await sha256Hex(zeros),
      source: "imported",
    },
  ];
  const result = await saveProject(document, () => zeros, {
    expanded: 100 * 1024,
    compressed: LIMITS.ZIP_MAX_COMPRESSED,
  });
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.kind).toBe("too-large");
    expect(result.message).toBe(SAVE_TOO_BIG_MESSAGE);
  }
});

test("save rejects when the compressed result exceeds its limit", async () => {
  const { document, assetBytes } = await validProject();
  const result = await saveProject(document, () => assetBytes, { compressed: 10 });
  expect(result).toEqual({
    ok: false,
    kind: "too-large",
    message: SAVE_TOO_BIG_MESSAGE,
  });
});

test("save is deterministic: identical document and bytes produce identical zips", async () => {
  const { document, assetBytes } = await validProject();
  const first = await saveProject(document, () => assetBytes);
  const second = await saveProject(document, () => assetBytes);
  expect(first.ok).toBe(true);
  expect(second.ok).toBe(true);
  if (first.ok && second.ok) {
    const a = new Uint8Array(await first.blob.arrayBuffer());
    const b = new Uint8Array(await second.blob.arrayBuffer());
    expect(a.length).toBe(b.length);
    expect(a.every((byte, index) => byte === b[index])).toBe(true);
  }
});

test("save does not mutate the document on any path", async () => {
  const { document, assetBytes } = await validProject();
  const before = JSON.stringify(document);
  await saveProject(document, () => assetBytes, { expanded: 1 });
  await saveProject(document, () => assetBytes, { compressed: 1 });
  await saveProject(document, () => assetBytes);
  expect(JSON.stringify(document)).toBe(before);
});

test("isAllowedEntryPath accepts only project.json and flat assets/*.png", () => {
  expect(isAllowedEntryPath("project.json")).toBe(true);
  expect(isAllowedEntryPath("assets/9f2c.png")).toBe(true);
  expect(isAllowedEntryPath("assets/a-b_C9.png")).toBe(true);
  for (const bad of [
    "",
    "..",
    "../evil.png",
    "/abs/x.png",
    "assets/../../x.png",
    "assets\\x.png",
    "assets/x\\y.png",
    "C:\\evil.png",
    "c:/evil.png",
    "assets/sub/x.png",
    "assets/x.jpg",
    "assets/.png",
    "assets//x.png",
    "assets/./x.png",
    "assets/..",
    "folder/x.png",
    "project.json/x",
  ]) {
    expect(isAllowedEntryPath(bad)).toBe(false);
  }
});

test("open rejects duplicate entry paths", async () => {
  const bytes = await zipWithDuplicateNames();
  expectInvalid(await openProject(fileOf(bytes)));
});

test("open rejects zips with more than the entry limit", async () => {
  const entries: Record<string, Uint8Array> = { "project.json": new TextEncoder().encode("{}") };
  for (let index = 0; index < LIMITS.ZIP_MAX_ENTRIES; index += 1) {
    entries[`assets/e${index}.png`] = fakePng(4, 4);
  }
  expectInvalid(await openProject(fileOf(zipSync(entries))));
});

test("open rejects a file larger than the compressed limit before inflating", async () => {
  const bytes = new Uint8Array(64);
  const result = await openProject(fileOf(bytes), { compressed: 32 });
  expect(result).toEqual({
    ok: false,
    kind: "too-large",
    message: OPEN_TOO_BIG_MESSAGE,
  });
});

test("open rejects bad json, wrong format, wrong schema version, bad garment, and nine layers", async () => {
  const badJson = zipSync({ "project.json": new TextEncoder().encode("not json at all") });
  expectInvalid(await openProject(fileOf(badJson)));

  const document = createProject("tshirt", "Probe");
  const mutants: [string, unknown][] = [
    ["format", "rbx-fashion-projectX"],
    ["schemaVersion", 3],
    ["garmentType", "hat"],
  ];
  for (const [key, value] of mutants) {
    const mutated = retype({ ...document, [key]: value });
    expectInvalid(await openProject(fileOf(projectZip(mutated, new Uint8Array()))));
  }

  const nineLayers = retype({
    ...document,
    layers: Array.from({ length: 9 }, (_, index) => solidLayer(`layer-${index}`)),
  });
  expectInvalid(await openProject(fileOf(projectZip(nineLayers, new Uint8Array()))));
});

test("open rejects layers referencing unknown asset ids", async () => {
  const { document, assetBytes } = await validProject();
  const mutated = retype({
    ...document,
    layers: [rasterLayer("layer-1", "ghost")],
  });
  expectInvalid(await openProject(fileOf(projectZip(mutated, assetBytes))));
});

test("open rejects documents that fail the schema validator", async () => {
  const { document, assetBytes } = await validProject();
  expect(isValidProjectDocument(document)).toBe(true);
  const mutants: unknown[] = [
    { ...document, name: 42 },
    { ...document, layers: "nope" },
    { ...document, assets: [{ ...document.assets[0], sha256: "zz" }] },
    { ...document, layers: [{ ...rasterLayer("layer-1", "asset-1"), visible: "yes" }] },
    { ...document, layers: [{ ...rasterLayer("layer-1", "asset-1"), opacity: 2 }] },
    { ...document, layers: [{ ...solidLayer("layer-2"), color: undefined }] },
  ];
  for (const mutant of mutants) {
    expect(isValidProjectDocument(mutant)).toBe(false);
    expectInvalid(await openProject(fileOf(projectZip(retype(mutant), assetBytes))));
  }
});

test("open rejects manifest and file mismatches", async () => {
  const { document, assetBytes } = await validProject();
  const base = document.assets[0];
  if (base === undefined) {
    throw new Error("fixture must have one asset");
  }

  const missingFile = projectZip(document, assetBytes, {}, [`assets/${base.id}.png`]);
  expectInvalid(await openProject(fileOf(missingFile)));

  const extraFile = projectZip(document, assetBytes, { "assets/extra.png": fakePng(8, 8) });
  expectInvalid(await openProject(fileOf(extraFile)));

  const wrongDims = retype({
    ...document,
    assets: [{ ...base, width: 64, height: 64 }],
  });
  expectInvalid(await openProject(fileOf(projectZip(wrongDims, assetBytes))));

  const wrongByteLength = retype({
    ...document,
    assets: [{ ...base, byteLength: base.byteLength + 1 }],
  });
  expectInvalid(await openProject(fileOf(projectZip(wrongByteLength, assetBytes))));

  const wrongSha = retype({
    ...document,
    assets: [{ ...base, sha256: "0".repeat(64) }],
  });
  expectInvalid(await openProject(fileOf(projectZip(wrongSha, assetBytes))));

  const noProjectJson = projectZip(document, assetBytes, {}, ["project.json"]);
  expectInvalid(await openProject(fileOf(noProjectJson)));
});

test("open rejects a pixel budget above the megapixel limit", async () => {
  const big1 = fakePng(4096, 4096);
  const big2 = fakePng(4096, 4096);
  const document = createProject("shirt", "Big");
  document.layers = [rasterLayer("layer-1", "big-1"), rasterLayer("layer-2", "big-2")];
  document.assets = [await manifestEntry("big-1", big1), await manifestEntry("big-2", big2)];
  const bytes = zipSync({
    "project.json": new TextEncoder().encode(JSON.stringify(document)),
    "assets/big-1.png": big1,
    "assets/big-2.png": big2,
  });
  expectInvalid(await openProject(fileOf(bytes)));
});

test("open rejects zip-slip entry names without extracting anything", async () => {
  const { document } = await validProject();
  const evil = zipSync({
    "project.json": new TextEncoder().encode(JSON.stringify(document)),
    "../evil.png": fakePng(8, 8),
  });
  expectInvalid(await openProject(fileOf(evil)));
  const absolute = zipSync({
    "project.json": new TextEncoder().encode(JSON.stringify(document)),
    "/abs/x.png": fakePng(8, 8),
  });
  expectInvalid(await openProject(fileOf(absolute)));
});

test("open rejects non-png asset bytes with an invalid signature", async () => {
  const junk = new Uint8Array(64);
  const document = createProject("tshirt", "Junk");
  document.layers = [rasterLayer("layer-1", "junk-1")];
  document.assets = [await manifestEntry("junk-1", junk)];
  const bytes = zipSync({
    "project.json": new TextEncoder().encode(JSON.stringify(document)),
    "assets/junk-1.png": junk,
  });
  expectInvalid(await openProject(fileOf(bytes)));
});

test("open rejects truncated zip bytes as invalid", async () => {
  const { document, assetBytes } = await validProject();
  const whole = projectZip(document, assetBytes);
  const truncated = whole.subarray(0, 20);
  const result = await openProject(fileOf(truncated));
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.kind).toBe("invalid");
  }
});

test("isValidProjectDocument rejects a zero byteLength manifest entry", async () => {
  const { document } = await validProject();
  const base = document.assets[0];
  if (base === undefined) {
    throw new Error("fixture must have one asset");
  }
  expect(isValidProjectDocument(document)).toBe(true);
  expect(
    isValidProjectDocument({ ...document, assets: [{ ...base, byteLength: 0 }] }),
  ).toBe(false);
});

test("saveProject rejects an invalid document before doing any work", async () => {
  const { document, assetBytes } = await validProject();
  const broken = retype({
    ...document,
    layers: [{ ...rasterLayer("layer-1", "asset-1"), opacity: 2 }],
  });
  expect(await saveProject(broken, () => assetBytes)).toEqual({
    ok: false,
    kind: "invalid",
    message: SAVE_INVALID_MESSAGE,
  });
});

test("open rejects via the local-header fast path when the declared uncompressed size exceeds the expanded limit", async () => {
  const honest = fakePng(32, 16);
  const zipped = zipSync({
    "assets/big.png": [honest, { level: 0, mtime: 315532800000 }],
  });
  const lying = zipped.slice();
  const view = new DataView(lying.buffer);
  const declared = 5 * 1024 * 1024;
  view.setUint32(22, declared, true);
  expect(view.getUint32(22, true)).toBe(declared);
  expect(honest.length).toBeLessThan(64 * 1024);
  const result = await openProject(fileOf(lying), { expanded: 1024 * 1024 });
  expect(result).toEqual({
    ok: false,
    kind: "too-large",
    message: OPEN_TOO_BIG_MESSAGE,
  });
});

test("open reports a corrupted deflate stream as invalid without throwing", async () => {
  const json = new TextEncoder().encode(JSON.stringify({ pad: "x".repeat(4000) }));
  const zipped = zipSync({ "project.json": [json, { level: 6, mtime: 315532800000 }] });
  const corrupted = zipped.slice();
  const target = corrupted[45];
  if (target === undefined) {
    throw new Error("corruption offset out of range");
  }
  corrupted[45] = target ^ 0xff;
  const result = await openProject(fileOf(corrupted));
  expect(result).toEqual({
    ok: false,
    kind: "invalid",
    message: OPEN_INVALID_MESSAGE,
  });
});
