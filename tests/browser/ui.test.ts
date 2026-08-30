import { afterEach, expect, test } from "vitest";
import axe from "axe-core";
import { page } from "vitest/browser";
import { mountDesignerApp, unmountDesignerApp } from "../../src/editor/ui/mount";
import { EXPORT_DISCLAIMER, TRANSPARENT_WARNING } from "../../src/project/export";
import { IMPORT_UNSUPPORTED_MESSAGE } from "../../src/editor/import";
import { PATTERN_TOO_SMALL_MESSAGE } from "../../src/compositor/compose";
import { ITEM_CAP_MESSAGE, PREVIEW_UNAVAILABLE_MESSAGE } from "../../src/editor/ui/text";
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

async function waitFor(condition: () => boolean, what: string, timeout = 4000): Promise<void> {
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

function toolbarButton(host: HTMLElement, label: string): HTMLButtonElement {
  return requireEl(
    host.querySelector(`.toolbar [aria-label="${label}"]`),
    `toolbar ${label}`,
  ) as HTMLButtonElement;
}

function segmentedButton(host: HTMLElement, label: string): HTMLButtonElement {
  return requireEl(
    host.querySelector(`.segmented [aria-label="${label}"]`),
    `segmented ${label}`,
  ) as HTMLButtonElement;
}

function moreButton(host: HTMLElement): HTMLButtonElement {
  return requireEl(
    host.querySelector('.selection-bar [aria-label="More"]'),
    "more button",
  ) as HTMLButtonElement;
}

function dialog(host: HTMLElement, label: string): HTMLElement {
  return requireEl(
    host.querySelector(`[role="dialog"][aria-label="${label}"]`),
    `dialog ${label}`,
  );
}

async function closeSheet(host: HTMLElement, label: string, closeLabel: string): Promise<void> {
  const sheet = dialog(host, label);
  const close = requireEl(sheet.querySelector(`[aria-label="${closeLabel}"]`), closeLabel);
  (close as HTMLButtonElement).click();
  await waitFor(() => host.querySelector(`[role="dialog"][aria-label="${label}"]`) === null, `${label} closes`);
}

async function startEditing(host: HTMLElement, garment: string): Promise<void> {
  (byLabel(host, garment) as HTMLButtonElement).click();
  await waitFor(() => host.querySelector(".toolbar") !== null, "editor to mount");
}

async function addColor(host: HTMLElement, swatchIndex: number): Promise<void> {
  toolbarButton(host, "Color").click();
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

async function openItems(host: HTMLElement): Promise<HTMLElement> {
  (byLabel(host, "Items") as HTMLButtonElement).click();
  await waitFor(
    () => host.querySelector('[role="dialog"][aria-label="Items"]') !== null,
    "items sheet",
  );
  return dialog(host, "Items");
}

function itemRows(host: HTMLElement): HTMLElement[] {
  return Array.from(
    host.querySelectorAll('[role="dialog"][aria-label="Items"] .item-row'),
  ) as HTMLElement[];
}

function itemNames(host: HTMLElement): string[] {
  return itemRows(host).map(
    (row) => (requireEl(row.querySelector(".item-name"), "name input") as HTMLInputElement).value,
  );
}

function statusText(host: HTMLElement): string {
  return host.querySelector('[role="status"]')?.textContent ?? "";
}

function workspaceCanvas(host: HTMLElement): HTMLCanvasElement {
  return requireEl(host.querySelector(".workspace-canvas"), "workspace canvas") as HTMLCanvasElement;
}

function pixelAt(host: HTMLElement, x: number, y: number): number[] {
  const canvas = workspaceCanvas(host);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (ctx === null) {
    throw new Error("2d context unavailable");
  }
  return Array.from(ctx.getImageData(x, y, 1, 1).data);
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

function canvasData(host: HTMLElement): Uint8ClampedArray {
  const canvas = workspaceCanvas(host);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (ctx === null) {
    throw new Error("2d context unavailable");
  }
  return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
}

async function pngFile(
  width: number,
  height: number,
  left = "#ff0000",
  right = "#0000ff",
): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    throw new Error("2d context unavailable");
  }
  ctx.fillStyle = left;
  ctx.fillRect(0, 0, width / 2, height);
  ctx.fillStyle = right;
  ctx.fillRect(width / 2, 0, width / 2, height);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => (result === null ? reject(new Error("encode failed")) : resolve(result)), "image/png");
  });
  return new File([blob], "art.png", { type: "image/png" });
}

async function choosePicture(host: HTMLElement, file: File): Promise<void> {
  toolbarButton(host, "Add").click();
  await waitFor(() => host.querySelector('[role="dialog"][aria-label="Add"]') !== null, "add sheet");
  const input = requireEl(
    host.querySelector('[role="dialog"][aria-label="Add"] input[type="file"]'),
    "file input",
  ) as HTMLInputElement;
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function commitNumberInput(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

test("start screen offers three garments and a fresh editor starts empty with disabled history", async () => {
  const host = mountApp();
  expect(requireEl(host.querySelector("h1"), "heading").textContent).toBe("Roblox Clothing Designer");
  for (const label of ["T-Shirt", "Shirt", "Pants"]) {
    expect(byLabel(host, label)).toBeTruthy();
  }
  expect(host.textContent).toContain("A picture on the front");
  expect(host.textContent).toContain("Wraps the body and arms");
  expect(host.textContent).toContain("Covers the waist and legs");
  expect(byLabel(host, "Open Saved Project")).toBeTruthy();
  (byLabel(host, "Shirt") as HTMLButtonElement).click();
  await waitFor(() => host.querySelector(".toolbar") !== null, "editor to mount");
  expect(requireEl(host.querySelector(".project-name"), "project name").textContent).toBe("My Shirt");
  const undo = byLabel(host, "Undo") as HTMLButtonElement;
  const redo = byLabel(host, "Redo") as HTMLButtonElement;
  expect(undo.disabled).toBe(true);
  expect(undo.getAttribute("aria-disabled")).toBe("true");
  expect(redo.disabled).toBe(true);
  expect(redo.getAttribute("aria-disabled")).toBe("true");
  await openItems(host);
  expect(itemRows(host)).toHaveLength(0);
  expect(host.querySelector(".segmented")).toBeNull();
  await closeSheet(host, "Items", "Done");
});

test("a new editor points to Add and disables Repeat until a visible picture is selected", async () => {
  const host = mountApp();
  await startEditing(host, "Shirt");
  expect(host.querySelector(".workspace-empty")?.textContent).toBe(
    "Tap Add to add a picture or color.",
  );
  expect(toolbarButton(host, "Repeat").disabled).toBe(true);

  await addColor(host, 0);
  expect(host.querySelector(".workspace-empty")).toBeNull();
  expect(toolbarButton(host, "Repeat").disabled).toBe(true);
  moreButton(host).click();
  await waitFor(() => host.querySelector('[role="dialog"][aria-label="More"]') !== null, "more");
  const more = dialog(host, "More");
  expect(Array.from(more.querySelectorAll("input")).map((input) => input.getAttribute("aria-label"))).toEqual([
    "See-through",
  ]);
});

test("cutouts have focused controls, visible transparency, and no dead reorder buttons", async () => {
  const host = mountApp();
  await startEditing(host, "Shirt");
  await addColor(host, 0);
  toolbarButton(host, "Add").click();
  await waitFor(() => host.querySelector('[role="dialog"][aria-label="Add"]') !== null, "add sheet");
  (byLabel(host, "Cut Out") as HTMLButtonElement).click();
  await waitFor(() => host.querySelector(".cutout-instruction") !== null, "draw mode");
  expect(getComputedStyle(requireEl(host.querySelector(".cutout-instruction"), "instruction")).pointerEvents).toBe("none");
  expect(getComputedStyle(byLabel(host, "Cancel Cut Out")).pointerEvents).toBe("auto");
  const overlay = requireEl(host.querySelector(".workspace-overlay"), "overlay") as HTMLCanvasElement;
  const rect = overlay.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  overlay.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, clientX: x, clientY: y }));
  overlay.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1, clientX: x, clientY: y }));
  await waitFor(() => host.querySelector(".cutout-selection-label") !== null, "cutout selected");
  expect(host.querySelector(".segmented")).toBeNull();
  expect(getComputedStyle(workspaceCanvas(host)).backgroundImage).not.toBe("none");
  await waitFor(() => pixelAt(host, 292, 279)[3] === 0, "cutout clears center");

  moreButton(host).click();
  await waitFor(() => host.querySelector('[role="dialog"][aria-label="More"]') !== null, "cutout more");
  expect(Array.from(dialog(host, "More").querySelectorAll("input")).map((input) => input.getAttribute("aria-label"))).toEqual([
    "Left/Right", "Up/Down", "Turn", "Size", "Wide", "Tall",
  ]);
  await closeSheet(host, "More", "Done");
  await openItems(host);
  expect(itemNames(host)[0]).toBe("Cut Out 1");
  expect(itemRows(host)[0]?.querySelector('[aria-label="Move Up"]')).toBeNull();
  expect(itemRows(host)[0]?.querySelector('[aria-label="Move Down"]')).toBeNull();
  const paintUp = itemRows(host)[1]?.querySelector<HTMLButtonElement>('[aria-label="Move Up"]');
  expect(paintUp?.disabled).toBe(true);
}, 10000);

test("adding paint above an existing cutout selects the new paint, and Preview cancels draw mode", async () => {
  const host = mountApp();
  await startEditing(host, "Shirt");
  toolbarButton(host, "Add").click();
  await waitFor(() => host.querySelector('[role="dialog"][aria-label="Add"]') !== null, "add sheet");
  (byLabel(host, "Cut Out") as HTMLButtonElement).click();
  await waitFor(() => host.querySelector(".cutout-instruction") !== null, "draw mode");
  const overlay = requireEl(host.querySelector(".workspace-overlay"), "overlay") as HTMLCanvasElement;
  const rect = overlay.getBoundingClientRect();
  overlay.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }));
  overlay.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }));
  await waitFor(() => host.querySelector(".cutout-selection-label") !== null, "cutout selected");
  await addColor(host, 0);
  await waitFor(() => host.querySelector(".segmented") !== null, "new paint selected");
  expect(host.querySelector(".cutout-selection-label")).toBeNull();

  toolbarButton(host, "Add").click();
  await waitFor(() => host.querySelector('[role="dialog"][aria-label="Add"]') !== null, "second add sheet");
  (byLabel(host, "Cut Out") as HTMLButtonElement).click();
  await waitFor(() => host.querySelector(".cutout-instruction") !== null, "second draw mode");
  const view = requireEl(host.querySelector('nav[aria-label="View"]'), "view navigation");
  (requireEl(view.querySelector('[aria-pressed="false"]'), "preview tab") as HTMLButtonElement).click();
  await waitFor(() => host.querySelector(".cutout-instruction") === null, "preview tab cancels draw mode");
}, 10000);

test("adding a color creates one undoable item and Fill Clothing shows active", async () => {
  const host = mountApp();
  await startEditing(host, "T-Shirt");
  await addColor(host, 0);
  await openItems(host);
  expect(itemNames(host)).toEqual(["Color 1"]);
  expect(requireEl(host.querySelector(".project-name"), "name").textContent).toBe("My T-shirt");
  await closeSheet(host, "Items", "Done");
  const undo = byLabel(host, "Undo") as HTMLButtonElement;
  const redo = byLabel(host, "Redo") as HTMLButtonElement;
  expect(undo.disabled).toBe(false);
  expect(undo.getAttribute("aria-disabled")).toBe("false");
  undo.click();
  await openItems(host);
  await waitFor(() => itemRows(host).length === 0, "undo removes item");
  await closeSheet(host, "Items", "Done");
  expect(redo.disabled).toBe(false);
  redo.click();
  await openItems(host);
  await waitFor(() => itemNames(host).length === 1, "redo restores item");
  expect(itemNames(host)).toEqual(["Color 1"]);
  expect(segmentedButton(host, "Fill Clothing").getAttribute("aria-pressed")).toBe("true");
  expect(segmentedButton(host, "Sticker").getAttribute("aria-pressed")).toBe("false");
  expect(segmentedButton(host, "Repeat").getAttribute("aria-pressed")).toBe("false");
}, 10000);

test("items sheet supports rename, duplicate, visibility, reorder, and delete", async () => {
  const host = mountApp();
  await startEditing(host, "Shirt");
  await addColor(host, 0);
  await openItems(host);
  const firstRow = requireEl(itemRows(host)[0], "first item row");
  const visibleEye = requireEl(
    firstRow.querySelector<HTMLButtonElement>('[aria-label="Hide"]'),
    "visible eye",
  );
  expect(visibleEye.getAttribute("aria-pressed")).toBe("true");
  expect(visibleEye.querySelector('path[d="M3 3l18 18"]')).toBeNull();
  visibleEye.click();
  await waitFor(() => firstRow.querySelector('[aria-label="Show"]') !== null, "hidden eye state");
  const hiddenEye = requireEl(
    firstRow.querySelector<HTMLButtonElement>('[aria-label="Show"]'),
    "hidden eye",
  );
  expect(hiddenEye.getAttribute("aria-pressed")).toBe("false");
  expect(hiddenEye.querySelector('path[d="M3 3l18 18"]')).not.toBeNull();
  expect(Number.parseFloat(getComputedStyle(hiddenEye).opacity)).toBeLessThan(0.6);
  hiddenEye.click();
  await waitFor(() => firstRow.querySelector('[aria-label="Hide"]') !== null, "visible eye restored");

  const firstCopy = requireEl(
    firstRow.querySelector<HTMLButtonElement>('[aria-label="Copy item"]'),
    "copy item",
  );
  expect((firstCopy.textContent ?? "").trim()).toBe("Copy");
  expect(firstCopy.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
  expect(firstCopy.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
  expect(firstRow.scrollWidth).toBeLessThanOrEqual(firstRow.clientWidth);
  firstCopy.click();
  await waitFor(() => itemRows(host).length === 2, "second item");
  expect(itemNames(host)).toEqual(["Color 2", "Color 1"]);

  const nameInput = requireEl(itemRows(host)[1]?.querySelector(".item-name"), "name input") as HTMLInputElement;
  nameInput.value = "My Red";
  nameInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await closeSheet(host, "Items", "Done");
  (byLabel(host, "Undo") as HTMLButtonElement).click();
  await openItems(host);
  await waitFor(() => itemNames(host)[1] === "Color 1", "rename undo");
  await closeSheet(host, "Items", "Done");
  (byLabel(host, "Redo") as HTMLButtonElement).click();
  await openItems(host);
  await waitFor(() => itemNames(host)[1] === "My Red", "rename redo");

  const renameRow = itemRows(host)[1];
  (requireEl(renameRow?.querySelector('[aria-label="Copy item"]'), "copy item") as HTMLButtonElement).click();
  await waitFor(() => itemRows(host).length === 3, "duplicate adds item");
  expect(itemNames(host)).toEqual(["Color 3", "Color 2", "My Red"]);

  await waitFor(() => countOpaque(canvasData(host)) > 1000, "solid fills canvas");
  const eyeButtons = (): HTMLButtonElement[] =>
    itemRows(host).map(
      (row) => requireEl(row.querySelector('[aria-pressed]'), "eye toggle") as HTMLButtonElement,
    );
  for (const eye of eyeButtons()) {
    eye.click();
  }
  await waitFor(() => countOpaque(canvasData(host)) === 0, "hide empties canvas");
  for (const eye of eyeButtons()) {
    eye.click();
  }
  await waitFor(() => countOpaque(canvasData(host)) > 1000, "show refills canvas");

  (requireEl(itemRows(host)[2]?.querySelector('[aria-label="Move Up"]'), "move up") as HTMLButtonElement).click();
  await waitFor(
    () => itemNames(host).join("|") === "Color 3|My Red|Color 2",
    "move up reorders",
  );
  (requireEl(itemRows(host)[0]?.querySelector('[aria-label="Move Down"]'), "move down") as HTMLButtonElement).click();
  await waitFor(
    () => itemNames(host).join("|") === "My Red|Color 3|Color 2",
    "move down reorders",
  );

  itemRows(host)[0]?.click();
  await waitFor(() => host.querySelector(".segmented") !== null, "selection shows segmented");
  (requireEl(itemRows(host)[0]?.querySelector('[aria-label="Delete"]'), "delete") as HTMLButtonElement).click();
  await waitFor(() => itemRows(host).length === 2, "delete removes item");
  expect(host.querySelector(".segmented")).toBeNull();
}, 15000);

test("ninth add is refused with a friendly message", async () => {
  const host = mountApp();
  await startEditing(host, "Shirt");
  await addColor(host, 0);
  await openItems(host);
  for (let index = 1; index < 8; index += 1) {
    (requireEl(itemRows(host)[0]?.querySelector('[aria-label="Copy item"]'), "copy item") as HTMLButtonElement).click();
    await waitFor(() => itemRows(host).length === index + 1, `item ${index + 1}`);
  }
  expect(itemRows(host)).toHaveLength(8);
  (requireEl(itemRows(host)[0]?.querySelector('[aria-label="Copy item"]'), "copy item") as HTMLButtonElement).click();
  await waitFor(() => statusText(host).includes(ITEM_CAP_MESSAGE), "cap message");
  expect(itemRows(host)).toHaveLength(8);
}, 20000);

test("picture imports as a sticker and Fill Clothing changes composited pixels", async () => {
  const host = mountApp();
  await startEditing(host, "T-Shirt");
  await choosePicture(host, await pngFile(400, 300));
  await waitFor(() => host.querySelector(".segmented") !== null, "segmented appears");
  expect(segmentedButton(host, "Sticker").getAttribute("aria-pressed")).toBe("true");
  expect(segmentedButton(host, "Fill Clothing").getAttribute("aria-pressed")).toBe("false");
  expect(toolbarButton(host, "Repeat").disabled).toBe(false);
  await openItems(host);
  expect(itemNames(host)).toEqual(["Picture 1"]);
  await closeSheet(host, "Items", "Done");
  await openItems(host);
  (requireEl(itemRows(host)[0]?.querySelector('[aria-pressed]'), "eye toggle") as HTMLButtonElement).click();
  await closeSheet(host, "Items", "Done");
  await waitFor(() => toolbarButton(host, "Repeat").disabled === true, "repeat disabled while hidden");
  await openItems(host);
  (requireEl(itemRows(host)[0]?.querySelector('[aria-pressed]'), "eye toggle") as HTMLButtonElement).click();
  await closeSheet(host, "Items", "Done");
  await waitFor(() => toolbarButton(host, "Repeat").disabled === false, "repeat enabled when shown");
  await waitFor(() => pixelAt(host, 10, 10)[3] === 0, "decal leaves corner empty");
  segmentedButton(host, "Fill Clothing").click();
  await waitFor(() => {
    const pixel = pixelAt(host, 10, 10);
    return pixel[3] === 255 && (pixel[0] ?? 0) > 200 && (pixel[2] ?? 0) < 80;
  }, "fill clothing paints corner red");
  expect(segmentedButton(host, "Fill Clothing").getAttribute("aria-pressed")).toBe("true");
  (byLabel(host, "Undo") as HTMLButtonElement).click();
  await waitFor(() => pixelAt(host, 10, 10)[3] === 0, "undo returns to sticker");
  expect(segmentedButton(host, "Sticker").getAttribute("aria-pressed")).toBe("true");
}, 10000);

test("switching a picture to Repeat is one undo step", async () => {
  const host = mountApp();
  await startEditing(host, "T-Shirt");
  await choosePicture(host, await pngFile(400, 300));
  await waitFor(() => host.querySelector(".segmented") !== null, "segmented appears");
  segmentedButton(host, "Repeat").click();
  await waitFor(
    () => segmentedButton(host, "Repeat").getAttribute("aria-pressed") === "true",
    "repeat pressed",
  );
  (byLabel(host, "Undo") as HTMLButtonElement).click();
  await waitFor(
    () => segmentedButton(host, "Sticker").getAttribute("aria-pressed") === "true",
    "undo restores sticker",
  );
});

test("more sheet ignores inside clicks, closes on backdrop and Escape, and keeps Done reachable", async () => {
  const host = mountApp();
  try {
    await startEditing(host, "Shirt");
    await choosePicture(host, await pngFile(400, 300));
    await waitFor(() => host.querySelector(".segmented") !== null, "segmented appears");
    moreButton(host).click();
    await waitFor(() => host.querySelector('[role="dialog"][aria-label="More"]') !== null, "more sheet");
    const sizeInput = requireEl(
      host.querySelector('[role="dialog"][aria-label="More"] [aria-label="Size"]'),
      "size input",
    ) as HTMLInputElement;
    commitNumberInput(sizeInput, "120");

    (requireEl(host.querySelector('[role="dialog"][aria-label="More"] .sheet-title'), "sheet title") as HTMLElement).click();
    expect(host.querySelector('[role="dialog"][aria-label="More"]')).not.toBeNull();

    (requireEl(host.querySelector(".sheet-backdrop"), "backdrop") as HTMLElement).click();
    await waitFor(() => host.querySelector('[role="dialog"][aria-label="More"]') === null, "backdrop closes more");

    moreButton(host).click();
    await waitFor(() => host.querySelector('[role="dialog"][aria-label="More"]') !== null, "more reopens");
    const reopenedSize = requireEl(
      host.querySelector('[role="dialog"][aria-label="More"] [aria-label="Size"]'),
      "size input",
    ) as HTMLInputElement;
    expect(reopenedSize.value).toBe("120");

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await waitFor(() => host.querySelector('[role="dialog"][aria-label="More"]') === null, "escape closes more");

    await page.viewport(390, 844);
    moreButton(host).click();
    await waitFor(() => host.querySelector('[role="dialog"][aria-label="More"]') !== null, "more at phone size");
    const done = requireEl(
      dialog(host, "More").querySelector(".sheet-done"),
      "done button",
    );
    expect(done.getBoundingClientRect().bottom).toBeLessThanOrEqual(window.innerHeight);
  } finally {
    await page.viewport(414, 896);
  }
}, 15000);

test("pattern too small surfaces the exact child message near the toolbar", async () => {
  const host = mountApp();
  await startEditing(host, "T-Shirt");
  await choosePicture(host, await pngFile(400, 300));
  await waitFor(() => host.querySelector(".segmented") !== null, "segmented appears");
  toolbarButton(host, "Repeat").click();
  await waitFor(
    () => segmentedButton(host, "Repeat").getAttribute("aria-pressed") === "true",
    "repeat pressed",
  );
  moreButton(host).click();
  await waitFor(() => host.querySelector('[role="dialog"][aria-label="More"]') !== null, "more sheet");
  const sizeInput = requireEl(
    host.querySelector('[role="dialog"][aria-label="More"] [aria-label="Size"]'),
    "size input",
  ) as HTMLInputElement;
  commitNumberInput(sizeInput, "1");
  await waitFor(
    () => statusText(host).includes(PATTERN_TOO_SMALL_MESSAGE),
    "pattern too small message",
  );
  await closeSheet(host, "More", "Done");
  (byLabel(host, "Undo") as HTMLButtonElement).click();
  await waitFor(() => statusText(host) === "", "message clears after undo");
}, 10000);

test("export downloads the project png and shows the disclaimer sheet", async () => {
  const host = mountApp();
  await startEditing(host, "T-Shirt");
  await addColor(host, 0);
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
  try {
    toolbarButton(host, "Export").click();
    await waitFor(() => host.querySelector('[role="dialog"][aria-label="Download ready"]') !== null, "disclaimer");
    expect(downloads).toEqual(["My T-shirt.png"]);
    expect(dialog(host, "Download ready").textContent).toContain(EXPORT_DISCLAIMER);
    (byLabel(host, "Okay") as HTMLButtonElement).click();
    await waitFor(
      () => host.querySelector('[role="dialog"][aria-label="Download ready"]') === null,
      "disclaimer closes",
    );
  } finally {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    document.removeEventListener("click", onClickCapture, true);
  }
}, 10000);

test("exporting an empty project shows the see-through warning", async () => {
  const host = mountApp();
  await startEditing(host, "Shirt");
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
  try {
    toolbarButton(host, "Export").click();
    await waitFor(() => statusText(host).includes(TRANSPARENT_WARNING), "transparent warning");
    expect(downloads).toEqual(["My Shirt.png"]);
    await waitFor(
      () => host.querySelector('[role="dialog"][aria-label="Download ready"]') !== null,
      "disclaimer",
    );
  } finally {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    document.removeEventListener("click", onClickCapture, true);
  }
}, 10000);

test("dirty projects confirm before starting new; clean projects switch immediately", async () => {
  const host = mountApp();
  await startEditing(host, "Shirt");
  (byLabel(host, "New") as HTMLButtonElement).click();
  await waitFor(() => host.querySelector("h1")?.textContent === "Roblox Clothing Designer", "clean start");
  (byLabel(host, "Shirt") as HTMLButtonElement).click();
  await waitFor(() => host.querySelector(".toolbar") !== null, "editor remounts");
  await addColor(host, 2);
  (byLabel(host, "New") as HTMLButtonElement).click();
  await waitFor(
    () => host.querySelector('[role="dialog"][aria-label="Start a new project?"]') !== null,
    "unsaved dialog",
  );
  const unsaved = dialog(host, "Start a new project?");
  expect(unsaved.textContent).toContain("Start a new project? Your changes will be lost.");
  await waitFor(() => document.activeElement?.textContent === "Keep Editing", "keep editing receives focus");
  const startNew = byText(host, "Start New");
  expect(getComputedStyle(startNew).backgroundColor).toBe("rgb(29, 78, 216)");
  expect(getComputedStyle(startNew).color).toBe("rgb(255, 255, 255)");
  byText(host, "Keep Editing").click();
  await waitFor(
    () => host.querySelector('[role="dialog"][aria-label="Start a new project?"]') === null,
    "dialog closes",
  );
  expect(host.querySelector(".toolbar")).toBeTruthy();
  (byLabel(host, "New") as HTMLButtonElement).click();
  await waitFor(
    () => host.querySelector('[role="dialog"][aria-label="Start a new project?"]') !== null,
    "unsaved dialog again",
  );
  byText(host, "Start New").click();
  await waitFor(() => host.querySelector("h1")?.textContent === "Roblox Clothing Designer", "start screen");
  (byLabel(host, "T-Shirt") as HTMLButtonElement).click();
  await waitFor(() => host.querySelector(".toolbar") !== null, "tshirt editor");
  expect(requireEl(host.querySelector(".project-name"), "name").textContent).toBe("My T-shirt");
  await openItems(host);
  expect(itemRows(host)).toHaveLength(0);
  expect((byLabel(host, "Undo") as HTMLButtonElement).disabled).toBe(true);
  await closeSheet(host, "Items", "Done");
}, 15000);

test("a 585x559 picture asks Shirt or Pants and builds the chosen project", async () => {
  const host = mountApp();
  await startEditing(host, "Shirt");
  await choosePicture(host, await pngFile(585, 559));
  await waitFor(
    () => host.querySelector('[role="dialog"][aria-label="Is this a Shirt or Pants?"]') !== null,
    "question sheet",
  );
  expect(dialog(host, "Is this a Shirt or Pants?").textContent).toContain("Is this a Shirt or Pants?");
  (byLabel(host, "Pants") as HTMLButtonElement).click();
  await waitFor(
    () => requireEl(host.querySelector(".project-name"), "name").textContent === "My Pants",
    "pants project",
  );
  await openItems(host);
  expect(itemNames(host)).toEqual(["Picture 1"]);
  expect(segmentedButton(host, "Fill Clothing").getAttribute("aria-pressed")).toBe("true");
}, 10000);

test("unsupported imports show the child message and change nothing", async () => {
  const host = mountApp();
  await startEditing(host, "Shirt");
  const bytes = new TextEncoder().encode("GIF89a definitely not a png payload");
  await choosePicture(host, new File([bytes], "tricky.png", { type: "image/png" }));
  await waitFor(
    () => statusText(host).includes(IMPORT_UNSUPPORTED_MESSAGE),
    "unsupported message",
  );
  await waitFor(
    () => host.querySelector('[role="dialog"][aria-label="Add"]') === null,
    "add sheet closes after failure",
  );
  await openItems(host);
  expect(itemRows(host)).toHaveLength(0);
});

test("preview tab mounts the lazy 3D preview or reports it unavailable", async () => {
  const host = mountApp();
  await startEditing(host, "Shirt");
  const previewPane = requireEl(host.querySelector<HTMLElement>(".pane-preview"), "preview pane");
  toolbarButton(host, "Preview").click();
  await waitFor(
    () =>
      previewPane.querySelector("canvas") !== null ||
      (previewPane.querySelector('[role="status"]')?.textContent ?? "").includes(PREVIEW_UNAVAILABLE_MESSAGE),
    "preview canvas or unavailable message",
    8000,
  );
  const probe = document.createElement("canvas");
  const gl = probe.getContext("webgl2") ?? probe.getContext("webgl");
  if (gl !== null) {
    const canvas = requireEl(
      previewPane.querySelector<HTMLCanvasElement>("canvas"),
      "chromium with WebGL preview canvas",
    );
    expect(getComputedStyle(canvas).position).toBe("absolute");
  }
}, 12000);

test("preview Reset button is labeled, sized, and keeps working", async () => {
  const host = mountApp();
  await startEditing(host, "Shirt");
  toolbarButton(host, "Preview").click();
  const previewPane = requireEl(host.querySelector<HTMLElement>(".pane-preview"), "preview pane");
  await waitFor(() => previewPane.querySelector("canvas") !== null, "preview canvas", 8000);
  const reset = requireEl(previewPane.querySelector('[aria-label="Reset view"]'), "reset button");
  const rect = reset.getBoundingClientRect();
  expect(rect.width).toBeGreaterThanOrEqual(44);
  expect(rect.height).toBeGreaterThanOrEqual(44);
  expect((reset.textContent ?? "").trim()).toBe("Reset");
  expect(previewPane.querySelectorAll("button").length).toBe(1);
  (reset as HTMLButtonElement).click();
  await waitFor(() => previewPane.querySelector("canvas") !== null, "canvas survives reset");
}, 12000);

test("switching garments after visiting Preview keeps editing, undo, and export working", async () => {
  const host = mountApp();
  await startEditing(host, "Shirt");
  toolbarButton(host, "Preview").click();
  const previewPane = requireEl(host.querySelector<HTMLElement>(".pane-preview"), "preview pane");
  await waitFor(() => previewPane.querySelector("canvas") !== null, "preview canvas", 8000);
  await addColor(host, 0);
  expect((byLabel(host, "Undo") as HTMLButtonElement).disabled).toBe(false);
  (byLabel(host, "New") as HTMLButtonElement).click();
  await waitFor(
    () => host.querySelector('[role="dialog"][aria-label="Start a new project?"]') !== null,
    "unsaved dialog",
  );
  byText(host, "Start New").click();
  await waitFor(
    () => host.querySelector("h1")?.textContent === "Roblox Clothing Designer",
    "start screen",
  );
  (byLabel(host, "Pants") as HTMLButtonElement).click();
  await waitFor(
    () => host.querySelector(".project-name")?.textContent === "My Pants",
    "pants editor",
  );
  expect((byLabel(host, "Undo") as HTMLButtonElement).disabled).toBe(true);
  await addColor(host, 1);
  expect((byLabel(host, "Undo") as HTMLButtonElement).disabled).toBe(false);
  const stub = stubDownloads();
  try {
    toolbarButton(host, "Export").click();
    await waitFor(
      () => host.querySelector('[role="dialog"][aria-label="Download ready"]') !== null,
      "disclaimer",
    );
    expect(stub.downloads).toEqual(["My Pants.png"]);
    (byLabel(host, "Okay") as HTMLButtonElement).click();
    await waitFor(
      () => host.querySelector('[role="dialog"][aria-label="Download ready"]') === null,
      "disclaimer closes",
    );
  } finally {
    stub.restore();
  }
}, 20000);

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

test("an import finishing after a project switch is dropped", async () => {
  const host = mountApp();
  await startEditing(host, "Shirt");
  await addColor(host, 0);
  const originalBitmap = window.createImageBitmap;
  let hold = true;
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = () => resolve();
  });
  window.createImageBitmap = (async (...args: Parameters<typeof originalBitmap>) => {
    if (hold) {
      await gate;
    }
    return originalBitmap(...args);
  }) as typeof window.createImageBitmap;
  try {
    await choosePicture(host, await pngFile(400, 300));
    await new Promise<void>((resolve) => setTimeout(resolve, 200));
    (byLabel(host, "New") as HTMLButtonElement).click();
    await waitFor(
      () => host.querySelector('[role="dialog"][aria-label="Start a new project?"]') !== null,
      "unsaved dialog",
    );
    byText(host, "Start New").click();
    await waitFor(
      () => host.querySelector("h1")?.textContent === "Roblox Clothing Designer",
      "start screen after confirm",
    );
    hold = false;
    release();
    await new Promise<void>((resolve) => setTimeout(resolve, 300));
    expect(requireEl(host.querySelector("h1"), "heading").textContent).toBe("Roblox Clothing Designer");
    expect(host.querySelector(".toolbar")).toBeNull();
    await startEditing(host, "T-Shirt");
    await openItems(host);
    expect(itemRows(host)).toHaveLength(0);
    expect((byLabel(host, "Undo") as HTMLButtonElement).disabled).toBe(true);
    await closeSheet(host, "Items", "Done");
  } finally {
    window.createImageBitmap = originalBitmap;
  }
}, 15000);

test("a successful edit clears the sticky notice", async () => {
  const host = mountApp();
  await startEditing(host, "Shirt");
  await addColor(host, 0);
  await openItems(host);
  for (let index = 1; index < 8; index += 1) {
    (requireEl(itemRows(host)[0]?.querySelector('[aria-label="Copy item"]'), "copy item") as HTMLButtonElement).click();
    await waitFor(() => itemRows(host).length === index + 1, `item ${index + 1}`);
  }
  (requireEl(itemRows(host)[0]?.querySelector('[aria-label="Copy item"]'), "copy item") as HTMLButtonElement).click();
  await waitFor(() => statusText(host).includes(ITEM_CAP_MESSAGE), "cap message");
  (requireEl(itemRows(host)[0]?.querySelector('[aria-label="Delete"]'), "delete") as HTMLButtonElement).click();
  await waitFor(() => statusText(host) === "", "notice cleared after delete");
  expect(itemRows(host)).toHaveLength(7);
}, 20000);

test("adding an item after export clears the see-through warning", async () => {
  const host = mountApp();
  await startEditing(host, "Shirt");
  const stub = stubDownloads();
  try {
    toolbarButton(host, "Export").click();
    await waitFor(() => statusText(host).includes(TRANSPARENT_WARNING), "warning shown");
    await waitFor(
      () => host.querySelector('[role="dialog"][aria-label="Download ready"]') !== null,
      "disclaimer",
    );
    (byLabel(host, "Okay") as HTMLButtonElement).click();
    await waitFor(
      () => host.querySelector('[role="dialog"][aria-label="Download ready"]') === null,
      "disclaimer closes",
    );
    await addColor(host, 3);
    await waitFor(
      () => !statusText(host).includes(TRANSPARENT_WARNING),
      "warning cleared after add",
    );
  } finally {
    stub.restore();
  }
}, 10000);

test("double-tapping export triggers one download", async () => {
  const host = mountApp();
  await startEditing(host, "T-Shirt");
  await addColor(host, 0);
  const stub = stubDownloads();
  try {
    const exportButton = toolbarButton(host, "Export");
    exportButton.click();
    exportButton.click();
    await waitFor(
      () => host.querySelector('[role="dialog"][aria-label="Download ready"]') !== null,
      "disclaimer",
    );
    expect(stub.downloads).toEqual(["My T-shirt.png"]);
    (byLabel(host, "Okay") as HTMLButtonElement).click();
    await waitFor(
      () => host.querySelector('[role="dialog"][aria-label="Download ready"]') === null,
      "disclaimer closes",
    );
  } finally {
    stub.restore();
  }
}, 10000);

const VIEWPORTS: readonly [string, number, number][] = [
  ["portrait-phone", 390, 844],
  ["small-landscape-phone", 667, 375],
  ["landscape-phone", 844, 390],
  ["portrait-tablet", 768, 1024],
  ["desktop", 1440, 900],
];

test("toolbar stays 44px and axe reports zero violations across the viewport matrix", async () => {
  for (const [name, width, height] of VIEWPORTS) {
    await page.viewport(width, height);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const host = mountApp();
    await startEditing(host, "Shirt");
    const toolbar = requireEl(host.querySelector(".toolbar"), "toolbar");
    const buttons = Array.from(toolbar.querySelectorAll("button")) as HTMLButtonElement[];
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Add",
      "Move",
      "Repeat",
      "Color",
      "Preview",
      "Export",
    ]);
    for (const button of buttons) {
      const rect = button.getBoundingClientRect();
      expect(rect.width, `${name} ${button.getAttribute("aria-label")} width`).toBeGreaterThanOrEqual(44);
      expect(rect.height, `${name} ${button.getAttribute("aria-label")} height`).toBeGreaterThanOrEqual(44);
    }
    const tabbar = requireEl(host.querySelector<HTMLElement>(".tabbar"), "tabbar");
    const previewPane = requireEl(host.querySelector<HTMLElement>(".pane-preview"), "preview pane");
    if (name === "portrait-phone" || name === "portrait-tablet") {
      expect(tabbar.offsetParent, `${name} tabbar visible`).not.toBeNull();
      expect(previewPane.offsetParent, `${name} preview hidden`).toBeNull();
      expect(host.querySelector(".items-rail"), `${name} no rail`).toBeNull();
    }
    if (name === "small-landscape-phone") {
      expect(tabbar.offsetParent, `${name} tabbar visible`).not.toBeNull();
      expect(previewPane.offsetParent, `${name} preview hidden in Edit`).toBeNull();
      const workspace = requireEl(
        host.querySelector<HTMLElement>(".workspace-stage"),
        "workspace stage",
      );
      expect(workspace.getBoundingClientRect().height).toBeGreaterThan(80);
      expect(toolbar.getBoundingClientRect().bottom).toBeLessThanOrEqual(innerHeight + 1);
      expect(document.documentElement.scrollHeight).toBeLessThanOrEqual(innerHeight + 1);
    }
    if (name === "landscape-phone") {
      expect(tabbar.offsetParent, `${name} tabbar hidden`).toBeNull();
      expect(previewPane.offsetParent, `${name} preview pane visible`).not.toBeNull();
      await waitFor(
        () => host.querySelector(".preview-stage") !== null,
        `${name} preview stage mounted`,
      );
      const workspace = requireEl(
        host.querySelector<HTMLElement>(".workspace-stage"),
        "workspace stage",
      );
      const preview = requireEl(
        host.querySelector<HTMLElement>(".preview-stage"),
        "preview stage",
      );
      expect(workspace.getBoundingClientRect().height).toBeGreaterThan(80);
      expect(preview.getBoundingClientRect().height).toBeGreaterThan(80);
      expect(toolbar.getBoundingClientRect().bottom).toBeLessThanOrEqual(innerHeight + 1);
      expect(document.documentElement.scrollHeight).toBeLessThanOrEqual(innerHeight + 1);
    }
    if (name === "desktop") {
      expect(host.querySelector(".items-rail"), `${name} rail present`).not.toBeNull();
      expect(host.querySelector('.app-header [aria-label="Items"]'), `${name} no items button`).toBeNull();
    }
    const results = await axe.run(host);
    const violations = results.violations;
    if (violations.length > 0) {
      throw new Error(
        `axe violations at ${name} (${width}x${height}): ${JSON.stringify(
          violations.map((violation) => ({
            id: violation.id,
            impact: violation.impact,
            targets: violation.nodes.map((node) => node.target),
          })),
        )}`,
      );
    }
    unmountHosts();
  }
  await page.viewport(414, 896);
}, 60000);
