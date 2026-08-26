import { afterEach, expect, test, vi } from "vitest";
import { Zip, ZipDeflate, zipSync } from "fflate";
import { AssetStore, pngAssetFromCanvas } from "../../src/assets/store";
import { sha256Hex } from "../../src/assets/hash";
import { defaultTransform } from "../../src/compositor/math";
import { composeProject } from "../../src/compositor/compose";
import { createProject } from "../../src/domain/project";
import { getTemplate } from "../../src/domain/registry";
import type {
  AssetManifestEntry,
  GarmentType,
  Layer,
  ProjectDocumentV1,
} from "../../src/domain/types";
import { createSessionFromDocument } from "../../src/editor/state";
import { mountDesignerApp, unmountDesignerApp } from "../../src/editor/ui/mount";
import { OPEN_INVALID_MESSAGE, OPEN_TOO_BIG_MESSAGE } from "../../src/editor/ui/text";
import { exportRobloxPng } from "../../src/project/export";
import { openProject, saveProject } from "../../src/project/archive";
import type { OpenResult } from "../../src/project/archive";
import "../../src/styles.css";

let hosts: HTMLElement[] = [];

function requireEl<T extends Element>(element: T | null | undefined, what: string): T {
  if (element === null || element === undefined) {
    throw new Error(`missing ${what}`);
  }
  return element;
}

function mountApp(): HTMLElement {
  document.documentElement.lang = "en";
  const host = document.createElement("div");
  document.body.appendChild(host);
  mountDesignerApp(host);
  hosts.push(host);
  return host;
}

function unmountHosts(): void {
  for (const host of hosts) {
    unmountDesignerApp(host);
    host.remove();
  }
  hosts = [];
}

afterEach(() => {
  unmountHosts();
});

async function waitFor(condition: () => boolean, what: string, timeout = 5000): Promise<void> {
  const start = performance.now();
  while (!condition()) {
    if (performance.now() - start > timeout) {
      throw new Error(`timeout waiting for ${what}`);
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}

function byLabel(host: HTMLElement, label: string): HTMLElement {
  return requireEl(host.querySelector(`[aria-label="${label}"]`), `aria-label ${label}`);
}

function byText(host: HTMLElement, text: string): HTMLButtonElement {
  const buttons = Array.from(host.querySelectorAll("button")) as HTMLButtonElement[];
  const found = buttons.find((button) => (button.textContent ?? "").trim() === text);
  if (found === undefined) {
    throw new Error(`missing button text ${text}`);
  }
  return found;
}

function statusText(host: HTMLElement): string {
  return host.querySelector('[role="status"]')?.textContent ?? "";
}

function openInput(host: HTMLElement): HTMLInputElement {
  return requireEl(
    host.querySelector('input[type="file"][accept=".rbxcloth.zip,.zip,application/zip"]'),
    "open file input",
  ) as HTMLInputElement;
}

async function startEditing(host: HTMLElement, garment: string): Promise<void> {
  (byLabel(host, garment) as HTMLButtonElement).click();
  await waitFor(() => host.querySelector(".toolbar") !== null, "editor to mount");
}

async function addColor(host: HTMLElement, swatchIndex: number): Promise<void> {
  (requireEl(host.querySelector('.toolbar [aria-label="Color"]'), "color tool") as HTMLButtonElement).click();
  await waitFor(
    () => host.querySelector('[role="dialog"][aria-label="Colors"]') !== null,
    "color sheet",
  );
  const swatches = host.querySelectorAll('[role="dialog"][aria-label="Colors"] .swatch');
  const swatch = swatches[swatchIndex];
  if (swatch === undefined) {
    throw new Error(`missing swatch ${swatchIndex}`);
  }
  (swatch as HTMLButtonElement).click();
  await waitFor(
    () => host.querySelector('[role="dialog"][aria-label="Colors"]') === null,
    "color sheet to close",
  );
}

function stubDownloads(): { downloads: string[]; restore: () => void } {
  const downloads: string[] = [];
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  URL.createObjectURL = (() => "blob:test") as typeof URL.createObjectURL;
  URL.revokeObjectURL = (() => {}) as typeof URL.revokeObjectURL;
  const onClickCapture = (event: MouseEvent) => {
    const target = event.target as HTMLAnchorElement | null;
    if (target !== null && target.tagName === "A" && target.download) {
      downloads.push(target.download);
      event.preventDefault();
      event.stopPropagation();
    }
  };
  document.addEventListener("click", onClickCapture, true);
  return {
    downloads,
    restore: () => {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      document.removeEventListener("click", onClickCapture, true);
    },
  };
}

async function chooseOpenFile(host: HTMLElement, file: File): Promise<void> {
  const input = openInput(host);
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

async function itemNames(host: HTMLElement): Promise<string[]> {
  (byLabel(host, "Items") as HTMLButtonElement).click();
  await waitFor(
    () => host.querySelector('[role="dialog"][aria-label="Items"]') !== null,
    "items sheet",
  );
  const names = Array.from(
    host.querySelectorAll('[role="dialog"][aria-label="Items"] .item-row .item-name'),
  ).map((input) => (input as HTMLInputElement).value);
  (requireEl(
    host.querySelector('[role="dialog"][aria-label="Items"] [aria-label="Done"]'),
    "done",
  ) as HTMLButtonElement).click();
  await waitFor(
    () => host.querySelector('[role="dialog"][aria-label="Items"]') === null,
    "items sheet closes",
  );
  return names;
}

function workspaceCanvas(host: HTMLElement): HTMLCanvasElement {
  return requireEl(host.querySelector(".workspace-canvas"), "workspace canvas") as HTMLCanvasElement;
}

function canvasData(canvas: HTMLCanvasElement): Uint8ClampedArray {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (ctx === null) {
    throw new Error("2d context unavailable");
  }
  return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
}

function countOpaque(data: Uint8ClampedArray): number {
  let count = 0;
  for (let index = 3; index < data.length; index += 4) {
    if ((data[index] ?? 0) > 0) {
      count += 1;
    }
  }
  return count;
}

async function garmentProject(
  garment: GarmentType,
): Promise<{ document: ProjectDocumentV1; assets: AssetStore }> {
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    throw new Error("2d context unavailable");
  }
  ctx.fillStyle = "#ff0000";
  ctx.fillRect(0, 0, 48, 64);
  ctx.fillStyle = "#0000ff";
  ctx.fillRect(48, 0, 48, 64);
  const asset = await pngAssetFromCanvas(canvas, "asset-1");
  const project = createProject(garment, `My ${garment}`);
  const raster: Layer = {
    id: "layer-1",
    name: "Picture 1",
    kind: "raster",
    assetId: "asset-1",
    visible: true,
    opacity: 1,
    placement: "decal",
    transform: {
      ...defaultTransform("decal", { width: asset.width, height: asset.height }, getTemplate(garment)),
      crop: { x: 0, y: 0, width: 1, height: 1 },
    },
  };
  const solid: Layer = {
    id: "layer-2",
    name: "Color 1",
    kind: "solid",
    color: "#3366cc",
    visible: true,
    opacity: 0.5,
    placement: "pattern",
    transform: {
      positionX: 0,
      positionY: 0,
      rotationDeg: 0,
      scaleX: 1,
      scaleY: 1,
      crop: { x: 0, y: 0, width: 1, height: 1 },
    },
  };
  project.layers = [solid, raster];
  project.assets = [
    {
      id: "asset-1",
      path: "assets/asset-1.png",
      originalName: "art.png",
      sourceMimeType: "image/png",
      byteLength: asset.bytes.length,
      width: asset.width,
      height: asset.height,
      sha256: await sha256Hex(asset.bytes),
      source: "imported",
    },
  ];
  return { document: project, assets: new AssetStore([asset]) };
}

test("each garment round-trips through save and open with identical pixels and export bytes", async () => {
  for (const garment of ["tshirt", "shirt", "pants"] as GarmentType[]) {
    const { document, assets } = await garmentProject(garment);
    const saved = await saveProject(document, (id) => {
      const asset = assets.get(id);
      if (asset === undefined) {
        throw new Error(`missing asset ${id}`);
      }
      return asset.bytes;
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) {
      continue;
    }
    const opened = await openProject(
      new File([saved.blob], `${document.name}.rbxcloth.zip`, { type: "application/zip" }),
    );
    expect(opened.ok).toBe(true);
    if (!opened.ok) {
      continue;
    }
    expect(opened.document).toEqual(document);
    expect(opened.assets).toHaveLength(1);
    const before = canvasData(composeProject({ document, assets }).canvas);
    const after = canvasData(
      composeProject({ document: opened.document, assets: new AssetStore(opened.assets) }).canvas,
    );
    expect(after.length).toBe(before.length);
    let identical = true;
    for (let index = 0; index < before.length; index += 1) {
      if (after[index] !== before[index]) {
        identical = false;
        break;
      }
    }
    expect(identical).toBe(true);
    const originalAsset = assets.get("asset-1");
    expect(originalAsset).toBeTruthy();
    if (originalAsset !== undefined) {
      expect(opened.assets[0]?.bytes.length).toBe(originalAsset.bytes.length);
      expect(
        Array.from(opened.assets[0]?.bytes ?? []).every(
          (byte, index) => byte === originalAsset.bytes[index],
        ),
      ).toBe(true);
    }
    const exportBefore = await exportRobloxPng(document, assets);
    const exportAfter = await exportRobloxPng(opened.document, new AssetStore(opened.assets));
    const bytesBefore = new Uint8Array(await exportBefore.blob.arrayBuffer());
    const bytesAfter = new Uint8Array(await exportAfter.blob.arrayBuffer());
    expect(bytesAfter.length).toBe(bytesBefore.length);
    expect(bytesAfter.every((byte, index) => byte === bytesBefore[index])).toBe(true);
  }
}, 20000);

test("createSessionFromDocument rebuilds a clean session with per-kind counters", async () => {
  const { document } = await garmentProject("tshirt");
  expect(createSessionFromDocument(document)).toEqual({
    document,
    undo: [],
    redo: [],
    pending: null,
    dirty: false,
    counters: { raster: 1, solid: 1 },
  });
  expect(createSessionFromDocument({ ...document, layers: "no" } as unknown as ProjectDocumentV1)).toBeNull();
});

test("header Save downloads <name>.rbxcloth.zip and clears dirty; double-tap saves once", async () => {
  const host = mountApp();
  await startEditing(host, "T-Shirt");
  const stub = stubDownloads();
  try {
    const save = byText(host, "Save");
    save.click();
    save.click();
    await waitFor(() => stub.downloads.length === 1, "first save download");
    expect(byLabel(host, "Save").getAttribute("aria-label")).toBe("Save");
    (byLabel(host, "New") as HTMLButtonElement).click();
    await waitFor(
      () => host.querySelector("h1")?.textContent === "Roblox Clothing Designer",
      "clean project: New goes straight to start screen",
    );
    await startEditing(host, "T-Shirt");
    await addColor(host, 0);
    (byLabel(host, "Save") as HTMLButtonElement).click();
    await waitFor(() => stub.downloads.length === 2, "second save download");
    expect(stub.downloads).toEqual(["My T-shirt.rbxcloth.zip", "My T-shirt.rbxcloth.zip"]);
    (byLabel(host, "New") as HTMLButtonElement).click();
    await waitFor(
      () => host.querySelector("h1")?.textContent === "Roblox Clothing Designer",
      "saved project: New goes straight to start screen",
    );
    await startEditing(host, "T-Shirt");
    await addColor(host, 0);
    (byLabel(host, "New") as HTMLButtonElement).click();
    await waitFor(
      () => host.querySelector('[role="dialog"][aria-label="Start a new project?"]') !== null,
      "after a fresh edit the unsaved dialog returns",
    );
    byText(host, "Keep Editing").click();
    await waitFor(
      () => host.querySelector('[role="dialog"][aria-label="Start a new project?"]') === null,
      "dialog closes",
    );
  } finally {
    stub.restore();
  }
}, 15000);

test("Open replaces the project content, store, selection, and megapixel budget", async () => {
  const host = mountApp();
  await startEditing(host, "Shirt");
  await addColor(host, 0);
  const { document, assets } = await garmentProject("tshirt");
  const saved = await saveProject(document, (id) => {
    const asset = assets.get(id);
    if (asset === undefined) {
      throw new Error(`missing asset ${id}`);
    }
    return asset.bytes;
  });
  expect(saved.ok).toBe(true);
  if (!saved.ok) {
    return;
  }
  await chooseOpenFile(
    host,
    new File([saved.blob], "round.rbxcloth.zip", { type: "application/zip" }),
  );
  await waitFor(
    () => host.querySelector(".project-name")?.textContent === document.name,
    "project name swaps to opened document",
  );
  expect(await itemNames(host)).toEqual(["Picture 1", "Color 1"]);
  await waitFor(() => host.querySelector(".segmented") !== null, "top-most layer selected");
  await waitFor(
    () => countOpaque(canvasData(workspaceCanvas(host))) > 1000,
    "opened raster paints the canvas",
  );
  (byLabel(host, "New") as HTMLButtonElement).click();
  await waitFor(
    () => host.querySelector("h1")?.textContent === "Roblox Clothing Designer",
    "opened project is clean: New skips the dialog",
  );
}, 15000);

test("Open while dirty shows the open-variant unsaved dialog; Cancel keeps editing, confirm opens the picker", async () => {
  const host = mountApp();
  await startEditing(host, "Shirt");
  await addColor(host, 0);
  const inputClickSpy = vi
    .spyOn(HTMLInputElement.prototype, "click")
    .mockImplementation(() => {});
  const dialogGone = () =>
    host.querySelector('[role="dialog"][aria-label="Open a different project?"]') === null;
  const dialogPresent = () =>
    host.querySelector('[role="dialog"][aria-label="Open a different project?"]') !== null;
  const confirmButton = (): HTMLButtonElement => {
    const dialog = requireEl(
      host.querySelector('[role="dialog"][aria-label="Open a different project?"]'),
      "open-variant dialog",
    );
    return requireEl(
      Array.from(dialog.querySelectorAll("button")).find(
        (button) => (button.textContent ?? "").trim() === "Open",
      ),
      "dialog Open button",
    ) as HTMLButtonElement;
  };
  try {
    (byLabel(host, "Open") as HTMLButtonElement).click();
    await waitFor(dialogPresent, "open-variant unsaved dialog before open");
    const unsaved = requireEl(
      host.querySelector('[role="dialog"][aria-label="Open a different project?"]'),
      "open-variant dialog",
    );
    expect(unsaved.textContent).toContain("Open a different project? Your changes will be lost.");
    expect(document.activeElement?.textContent).toBe("Keep Editing");
    expect(
      Array.from(unsaved.querySelectorAll("button")).map(
        (button) => (button.textContent ?? "").trim(),
      ),
    ).toEqual(["Keep Editing", "Open"]);
    byText(host, "Keep Editing").click();
    await waitFor(dialogGone, "dialog closes on keep editing");
    expect(inputClickSpy).toHaveBeenCalledTimes(0);
    expect(await itemNames(host)).toEqual(["Color 1"]);
    (byLabel(host, "Open") as HTMLButtonElement).click();
    await waitFor(dialogPresent, "unsaved dialog again");
    confirmButton().click();
    await waitFor(dialogGone, "dialog closes on confirm");
    expect(inputClickSpy).toHaveBeenCalledTimes(1);
    expect(await itemNames(host)).toEqual(["Color 1"]);
  } finally {
    inputClickSpy.mockRestore();
  }
}, 15000);

async function tamperedOpenResult(
  tamper: (entry: AssetManifestEntry) => AssetManifestEntry,
): Promise<OpenResult> {
  const { document, assets } = await garmentProject("tshirt");
  const asset = assets.get("asset-1");
  if (asset === undefined) {
    throw new Error("fixture asset missing");
  }
  const tampered: ProjectDocumentV1 = { ...document, assets: document.assets.map(tamper) };
  const bytes = zipSync({
    "project.json": new TextEncoder().encode(JSON.stringify(tampered)),
    "assets/asset-1.png": asset.bytes,
  });
  return openProject(new File([bytes], "tampered.rbxcloth.zip", { type: "application/zip" }));
}

test("open rejects a manifest sha256 tampered against the real png bytes", async () => {
  const result = await tamperedOpenResult((entry) => ({
    ...entry,
    sha256: entry.sha256 === "0".repeat(64) ? "1".repeat(64) : "0".repeat(64),
  }));
  expect(result).toEqual({ ok: false, kind: "invalid", message: OPEN_INVALID_MESSAGE });
});

test("open rejects manifest width and height that disagree with the png IHDR", async () => {
  const result = await tamperedOpenResult((entry) => ({ ...entry, width: 64, height: 48 }));
  expect(result).toEqual({ ok: false, kind: "invalid", message: OPEN_INVALID_MESSAGE });
});

test("open rejects a tampered manifest byteLength", async () => {
  const result = await tamperedOpenResult((entry) => ({
    ...entry,
    byteLength: entry.byteLength + 1,
  }));
  expect(result).toEqual({ ok: false, kind: "invalid", message: OPEN_INVALID_MESSAGE });
});

test("a corrupted zip shows the child notice and leaves the project untouched", async () => {
  const host = mountApp();
  await startEditing(host, "Shirt");
  await addColor(host, 3);
  await waitFor(() => host.querySelector(".segmented") !== null, "solid selected");
  await waitFor(
    () => countOpaque(canvasData(workspaceCanvas(host))) > 0,
    "canvas painted before the open attempt",
  );
  const pixelsBefore = canvasData(workspaceCanvas(host));
  const bytes = zipSync({
    "project.json": new TextEncoder().encode(JSON.stringify(createProject("tshirt"))),
  });
  const truncated = bytes.slice(0, 14);
  await chooseOpenFile(host, new File([truncated], "broken.rbxcloth.zip", { type: "application/zip" }));
  await waitFor(
    () => statusText(host).includes(OPEN_INVALID_MESSAGE),
    "invalid message shown",
  );
  expect(requireEl(host.querySelector(".project-name"), "name").textContent).toBe("My Shirt");
  expect(await itemNames(host)).toEqual(["Color 1"]);
  expect(host.querySelector(".segmented")).toBeTruthy();
  const pixelsAfter = canvasData(workspaceCanvas(host));
  expect(pixelsAfter.length).toBe(pixelsBefore.length);
  let unchanged = true;
  for (let index = 0; index < pixelsBefore.length; index += 1) {
    if (pixelsAfter[index] !== pixelsBefore[index]) {
      unchanged = false;
      break;
    }
  }
  expect(unchanged).toBe(true);
}, 15000);

test("beforeunload listener is added only while dirty and removed after save", async () => {
  const addSpy = vi.spyOn(window, "addEventListener");
  const removeSpy = vi.spyOn(window, "removeEventListener");
  const stub = stubDownloads();
  try {
    const host = mountApp();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(addSpy.mock.calls.filter(([type]) => type === "beforeunload")).toHaveLength(0);
    await startEditing(host, "Shirt");
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(addSpy.mock.calls.filter(([type]) => type === "beforeunload")).toHaveLength(0);
    await addColor(host, 0);
    await waitFor(
      () => addSpy.mock.calls.filter(([type]) => type === "beforeunload").length === 1,
      "beforeunload registered when dirty",
    );
    (byLabel(host, "Save") as HTMLButtonElement).click();
    await waitFor(() => stub.downloads.length === 1, "save download");
    await waitFor(
      () => removeSpy.mock.calls.filter(([type]) => type === "beforeunload").length === 1,
      "beforeunload removed after save",
    );
    expect(addSpy.mock.calls.filter(([type]) => type === "beforeunload")).toHaveLength(1);
  } finally {
    addSpy.mockRestore();
    removeSpy.mockRestore();
    stub.restore();
  }
}, 15000);

async function dataDescriptorZip(payload: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
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
  const file = new ZipDeflate("assets/big.png", { level: 6 });
  zip.add(file);
  file.push(payload, true);
  zip.end();
  await finished;
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

test("openProject aborts incrementally when a multi-push data-descriptor entry decodes past the expanded limit", async () => {
  const payload = new Uint8Array(512 * 1024);
  for (let index = 0; index < payload.length; index += 1) {
    payload[index] = Math.floor(Math.random() * 256);
  }
  const bytes = await dataDescriptorZip(payload);
  expect(bytes.length).toBeGreaterThan(64 * 1024);
  const flags = bytes[6] ?? 0;
  expect((flags ?? 0) & 8).toBe(8);
  const result = await openProject(
    new File([bytes], "big.rbxcloth.zip", { type: "application/zip" }),
    { expanded: 128 * 1024 },
  );
  expect(result).toEqual({
    ok: false,
    kind: "too-large",
    message: OPEN_TOO_BIG_MESSAGE,
  });
}, 10000);
