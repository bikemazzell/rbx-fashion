import { afterEach, expect, test } from "vitest";
import { mountDesignerApp, unmountDesignerApp } from "../../src/editor/ui/mount";
import {
  createGestureController,
  footprintGeometry,
} from "../../src/editor/ui/gestures";
import { createSession } from "../../src/editor/state";
import type { EditorAction, EditorSession } from "../../src/editor/state";
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

async function startEditing(host: HTMLElement, garment: string): Promise<void> {
  (byLabel(host, garment) as HTMLButtonElement).click();
  await waitFor(() => host.querySelector(".toolbar") !== null, "editor to mount");
}

async function pngFile(width: number, height: number): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    throw new Error("2d context unavailable");
  }
  ctx.fillStyle = "#ff0000";
  ctx.fillRect(0, 0, width, height);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => (result === null ? reject(new Error("encode failed")) : resolve(result)), "image/png");
  });
  return new File([blob], "art.png", { type: "image/png" });
}

async function importSticker(host: HTMLElement): Promise<void> {
  const file = await pngFile(400, 300);
  (byLabel(host, "Add") as HTMLButtonElement).click();
  await waitFor(() => host.querySelector('[role="dialog"][aria-label="Add"]') !== null, "add sheet");
  const input = requireEl(
    host.querySelector('[role="dialog"][aria-label="Add"] input[type="file"]'),
    "file input",
  ) as HTMLInputElement;
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await waitFor(() => host.querySelector(".segmented") !== null, "sticker imported and selected");
}

function stageEl(host: HTMLElement): HTMLElement {
  return requireEl(host.querySelector(".workspace-stage"), "stage");
}

function overlayEl(host: HTMLElement): HTMLCanvasElement {
  return requireEl(host.querySelector(".workspace-overlay"), "overlay") as HTMLCanvasElement;
}

function canvasEl(host: HTMLElement): HTMLCanvasElement {
  return requireEl(host.querySelector(".workspace-canvas"), "canvas") as HTMLCanvasElement;
}

function fitRect(host: HTMLElement): { left: number; top: number; scale: number } {
  const stage = stageEl(host);
  const canvas = canvasEl(host);
  const rect = stage.getBoundingClientRect();
  return {
    left: rect.left + canvas.offsetLeft,
    top: rect.top + canvas.offsetTop,
    scale: canvas.offsetWidth / canvas.width,
  };
}

function canvasToScreen(host: HTMLElement, x: number, y: number): { x: number; y: number } {
  const fit = fitRect(host);
  return { x: fit.left + x * fit.scale, y: fit.top + y * fit.scale };
}

function liveCanvasToScreen(host: HTMLElement, x: number, y: number): { x: number; y: number } {
  const overlay = overlayEl(host);
  const rect = overlay.getBoundingClientRect();
  return {
    x: rect.left + (x / overlay.width) * rect.width,
    y: rect.top + (y / overlay.height) * rect.height,
  };
}

function pointer(host: HTMLElement, type: string, id: number, x: number, y: number): void {
  overlayEl(host).dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      pointerId: id,
      pointerType: "touch",
      clientX: x,
      clientY: y,
      buttons: 1,
      isPrimary: id === 1,
    }),
  );
}

async function openMore(host: HTMLElement): Promise<void> {
  requireEl(host.querySelector('.selection-bar [aria-label="More"]'), "more button").dispatchEvent(
    new MouseEvent("click", { bubbles: true }),
  );
  await waitFor(() => host.querySelector('[role="dialog"][aria-label="More"]') !== null, "more sheet");
}

async function addColor(host: HTMLElement, swatchIndex: number): Promise<void> {
  (byLabel(host, "Color") as HTMLButtonElement).click();
  await waitFor(
    () => host.querySelector('[role="dialog"][aria-label="Colors"]') !== null,
    "color sheet",
  );
  const swatch = host.querySelectorAll('[role="dialog"][aria-label="Colors"] .swatch')[swatchIndex];
  if (swatch === undefined) {
    throw new Error(`missing swatch ${swatchIndex}`);
  }
  (swatch as HTMLButtonElement).click();
  await waitFor(
    () => host.querySelector('[role="dialog"][aria-label="Colors"]') === null,
    "color sheet to close",
  );
}

function moreField(host: HTMLElement, label: string): number {
  const input = requireEl(
    host.querySelector(`[role="dialog"][aria-label="More"] [aria-label="${label}"]`),
    `more field ${label}`,
  ) as HTMLInputElement;
  return Number(input.value);
}

function setMoreField(host: HTMLElement, label: string, value: string): void {
  const input = requireEl(
    host.querySelector(`[role="dialog"][aria-label="More"] [aria-label="${label}"]`),
    `more field ${label}`,
  ) as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function clickUndo(host: HTMLElement): void {
  (byLabel(host, "Undo") as HTMLButtonElement).click();
}

function undoDisabled(host: HTMLElement): boolean {
  return (byLabel(host, "Undo") as HTMLButtonElement).disabled;
}

interface StyleViewport {
  scale: number;
  panX: number;
  panY: number;
}

function readViewport(host: HTMLElement): StyleViewport {
  const overlay = overlayEl(host);
  const transform = getComputedStyle(overlay).transform;
  const matrix = transform === "none" ? new DOMMatrix() : new DOMMatrix(transform);
  return {
    scale: matrix.a,
    panX: matrix.e,
    panY: matrix.f,
  };
}

function fitCenter(host: HTMLElement): { x: number; y: number } {
  const overlay = overlayEl(host);
  const fit = fitRect(host);
  return { x: fit.left + overlay.offsetWidth / 2, y: fit.top + overlay.offsetHeight / 2 };
}

const DECAL_DEFAULT = {
  positionX: 256,
  positionY: 256,
  rotationDeg: 0,
  scaleX: 1,
  scaleY: 1,
  crop: { x: 0, y: 0, width: 1, height: 1 },
};

test("full-map and oversized artwork handles stay inside the clothing canvas", () => {
  const full = footprintGeometry(
    { ...DECAL_DEFAULT, positionX: 292.5, positionY: 279.5, scaleX: 4, scaleY: 4 },
    { width: 400, height: 300 },
    { width: 585, height: 559, inset: 16 },
  );
  for (const handle of [full.scaleHandle, full.rotateHandle]) {
    expect(handle.x).toBeGreaterThanOrEqual(16);
    expect(handle.x).toBeLessThanOrEqual(569);
    expect(handle.y).toBeGreaterThanOrEqual(16);
    expect(handle.y).toBeLessThanOrEqual(543);
  }
});

test("Add Cut Out draws one selected rectangle and a tap creates a useful default", async () => {
  const host = mountApp();
  await startEditing(host, "Shirt");
  (byLabel(host, "Add") as HTMLButtonElement).click();
  await waitFor(() => host.querySelector('[role="dialog"][aria-label="Add"]') !== null, "add sheet");
  (byLabel(host, "Cut Out") as HTMLButtonElement).click();
  await waitFor(() => host.querySelector(".cutout-instruction") !== null, "cutout instructions");

  const start = canvasToScreen(host, 120, 100);
  const end = canvasToScreen(host, 360, 280);
  pointer(host, "pointerdown", 1, start.x, start.y);
  pointer(host, "pointermove", 1, end.x, end.y);
  await waitFor(
    () => host.querySelector(".workspace-overlay")?.getAttribute("data-has-cutout-draft") === "true",
    "live cutout draft",
  );
  pointer(host, "pointerup", 1, end.x, end.y);
  await waitFor(() => host.querySelector(".cutout-instruction") === null, "drawing completes");
  expect(host.querySelector(".cutout-selection-label")?.textContent).toBe("Cut Out");
  await openMore(host);
  expect(moreField(host, "Size")).toBe(210);
  expect(moreField(host, "Left/Right")).toBe(240);
  expect(moreField(host, "Up/Down")).toBe(190);
  expect(host.querySelector('[role="dialog"][aria-label="More"] [aria-label="Wide"]')).toBeNull();
  expect(host.querySelector('[role="dialog"][aria-label="More"] [aria-label="Tall"]')).toBeNull();
  (byLabel(host, "Done") as HTMLButtonElement).click();

  (byLabel(host, "Add") as HTMLButtonElement).click();
  await waitFor(() => host.querySelector('[role="dialog"][aria-label="Add"]') !== null, "add sheet again");
  (byLabel(host, "Cut Out") as HTMLButtonElement).click();
  await waitFor(() => host.querySelector(".cutout-instruction") !== null, "tap cutout instructions");
  const tap = canvasToScreen(host, 450, 400);
  pointer(host, "pointerdown", 1, tap.x, tap.y);
  pointer(host, "pointerup", 1, tap.x, tap.y);
  await waitFor(() => host.querySelector(".cutout-instruction") === null, "tap completes");
  await openMore(host);
  expect(moreField(host, "Size")).toBeGreaterThan(20);
  expect(host.querySelector('[role="dialog"][aria-label="More"] [aria-label="Wide"]')).toBeNull();
  expect(host.querySelector('[role="dialog"][aria-label="More"] [aria-label="Tall"]')).toBeNull();
}, 10000);

test("color rectangle Size commits uniformly in pixels and undoes in one step", async () => {
  const host = mountApp();
  await startEditing(host, "T-Shirt");
  await addColor(host, 0);
  await openMore(host);
  expect(moreField(host, "Size")).toBe(180);
  expect(moreField(host, "Left/Right")).toBe(256);
  expect(moreField(host, "Up/Down")).toBe(256);
  setMoreField(host, "Size", "240");
  await waitFor(() => moreField(host, "Size") === 240, "uniform size commit");
  expect(moreField(host, "Left/Right")).toBe(256);
  expect(moreField(host, "Up/Down")).toBe(256);
  (byLabel(host, "Done") as HTMLButtonElement).click();
  await waitFor(() => host.querySelector('[role="dialog"][aria-label="More"]') === null, "more closes");
  clickUndo(host);
  await openMore(host);
  await waitFor(() => moreField(host, "Size") === 180, "undo restores the original size");
}, 10000);

test("Escape during an active cutout drag discards it even after pointer-up", async () => {
  const host = mountApp();
  await startEditing(host, "Shirt");
  (byLabel(host, "Add") as HTMLButtonElement).click();
  await waitFor(() => host.querySelector('[role="dialog"][aria-label="Add"]') !== null, "add sheet");
  (byLabel(host, "Cut Out") as HTMLButtonElement).click();
  await waitFor(() => host.querySelector(".cutout-instruction") !== null, "draw mode");
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  const start = canvasToScreen(host, 100, 100);
  const end = canvasToScreen(host, 300, 300);
  pointer(host, "pointerdown", 1, start.x, start.y);
  pointer(host, "pointermove", 1, end.x, end.y);
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await waitFor(() => host.querySelector(".cutout-instruction") === null, "escape cancels draw mode");
  pointer(host, "pointerup", 1, end.x, end.y);
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  expect(host.querySelector(".cutout-selection-label")).toBeNull();
  expect(undoDisabled(host)).toBe(true);
}, 10000);

test("wheel and keyboard transforms are ignored while drawing a cutout", async () => {
  const host = mountApp();
  await startEditing(host, "T-Shirt");
  await importSticker(host);
  (byLabel(host, "Add") as HTMLButtonElement).click();
  await waitFor(() => host.querySelector('[role="dialog"][aria-label="Add"]') !== null, "add sheet");
  (byLabel(host, "Cut Out") as HTMLButtonElement).click();
  await waitFor(() => host.querySelector(".cutout-instruction") !== null, "draw mode");
  const center = canvasToScreen(host, 256, 256);
  overlayEl(host).dispatchEvent(new WheelEvent("wheel", { deltaY: -100, clientX: center.x, clientY: center.y, cancelable: true, bubbles: true }));
  stageEl(host).dispatchEvent(new KeyboardEvent("keydown", { key: "+", bubbles: true, cancelable: true }));
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await openMore(host);
  expect(moreField(host, "Wide")).toBe(100);
  expect(moreField(host, "Tall")).toBe(100);
}, 10000);

test("move drag on the selected item is one undo step and restores on undo", async () => {
  const host = mountApp();
  await startEditing(host, "T-Shirt");
  await importSticker(host);
  await openMore(host);
  expect(moreField(host, "Left/Right")).toBe(256);
  const fit = fitRect(host);
  const start = canvasToScreen(host, 256, 256);
  pointer(host, "pointerdown", 1, start.x, start.y);
  for (let step = 1; step <= 5; step += 1) {
    pointer(host, "pointermove", 1, start.x + step * 40, start.y);
  }
  pointer(host, "pointerup", 1, start.x + 200, start.y);
  const expected = 256 + 200 / fit.scale;
  await waitFor(
    () => Math.abs(moreField(host, "Left/Right") - expected) <= 1,
    `position moved to ~${expected}`,
  );
  clickUndo(host);
  await waitFor(() => moreField(host, "Left/Right") === 256, "undo restores start position");
  expect(undoDisabled(host)).toBe(false);
  clickUndo(host);
  await waitFor(() => host.querySelector(".segmented") === null, "second undo removes the item");
}, 10000);

test("tap selects an unselected item, tap on empty space deselects, and a drag after deselect does nothing", async () => {
  const host = mountApp();
  await startEditing(host, "T-Shirt");
  await importSticker(host);
  const empty = canvasToScreen(host, 10, 10);
  pointer(host, "pointerdown", 1, empty.x, empty.y);
  pointer(host, "pointerup", 1, empty.x, empty.y);
  await waitFor(() => host.querySelector(".segmented") === null, "tap on empty deselects");

  const center = canvasToScreen(host, 256, 256);
  pointer(host, "pointerdown", 1, center.x, center.y);
  for (let step = 1; step <= 3; step += 1) {
    pointer(host, "pointermove", 1, center.x + step * 20, center.y + step * 10);
  }
  pointer(host, "pointerup", 1, center.x + 60, center.y + 30);
  expect(host.querySelector(".segmented")).toBeNull();

  pointer(host, "pointerdown", 1, center.x, center.y);
  pointer(host, "pointerup", 1, center.x, center.y);
  await waitFor(() => host.querySelector(".segmented") !== null, "tap on the item selects it");
  await openMore(host);
  expect(moreField(host, "Left/Right")).toBe(256);
  expect(moreField(host, "Up/Down")).toBe(256);
}, 10000);

test("corner handle drags uniform scale, rotate handle adds degrees, each is one undo step, and a handle tap does nothing", async () => {
  const host = mountApp();
  await startEditing(host, "T-Shirt");
  await importSticker(host);
  const fp = footprintGeometry(DECAL_DEFAULT, { width: 400, height: 300 });
  expect(fp.scaleHandle.x).toBeCloseTo(456, 6);
  expect(fp.scaleHandle.y).toBeCloseTo(406, 6);
  expect(fp.rotateHandle.x).toBeCloseTo(256, 6);
  expect(fp.rotateHandle.y).toBeLessThan(106);

  await openMore(host);
  const handle = canvasToScreen(host, fp.scaleHandle.x, fp.scaleHandle.y);
  const doubled = canvasToScreen(host, 256 + (fp.scaleHandle.x - 256) * 2, 256 + (fp.scaleHandle.y - 256) * 2);
  pointer(host, "pointerdown", 1, handle.x, handle.y);
  pointer(host, "pointermove", 1, doubled.x, doubled.y);
  pointer(host, "pointerup", 1, doubled.x, doubled.y);
  await waitFor(() => moreField(host, "Wide") === 200 && moreField(host, "Tall") === 200, "uniform scale doubled");
  clickUndo(host);
  await waitFor(() => moreField(host, "Wide") === 100 && moreField(host, "Tall") === 100, "scale undo");

  const rotate = canvasToScreen(host, fp.rotateHandle.x, fp.rotateHandle.y);
  const dx = fp.rotateHandle.x - 256;
  const dy = fp.rotateHandle.y - 256;
  const turned = canvasToScreen(host, 256 - dy, 256 + dx);
  pointer(host, "pointerdown", 1, rotate.x, rotate.y);
  pointer(host, "pointermove", 1, turned.x, turned.y);
  pointer(host, "pointerup", 1, turned.x, turned.y);
  await waitFor(() => moreField(host, "Turn") === 90, "rotation added 90 degrees");
  clickUndo(host);
  await waitFor(() => moreField(host, "Turn") === 0, "rotation undo");

  pointer(host, "pointerdown", 1, handle.x, handle.y);
  pointer(host, "pointermove", 1, handle.x + 5, handle.y + 3);
  pointer(host, "pointerup", 1, handle.x + 5, handle.y + 3);
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  expect(moreField(host, "Wide")).toBe(100);
  expect(moreField(host, "Turn")).toBe(0);
  clickUndo(host);
  await waitFor(() => host.querySelector(".segmented") === null, "only the add history entry remains");
}, 10000);

test("a second pointer cancels the item drag with rollback and takes over the viewport until all pointers lift", async () => {
  const host = mountApp();
  await startEditing(host, "T-Shirt");
  await importSticker(host);
  await openMore(host);
  const fit = fitRect(host);
  const center = canvasRectCenter(host);
  const a0 = { x: center.screen.x, y: center.screen.y };
  const a1 = { x: a0.x + 150, y: a0.y };
  pointer(host, "pointerdown", 1, a0.x, a0.y);
  pointer(host, "pointermove", 1, a1.x, a1.y);
  await waitFor(() => moreField(host, "Left/Right") > 300, "item visibly moved mid-gesture");

  const b0 = canvasToScreen(host, 100, 100);
  pointer(host, "pointerdown", 2, b0.x, b0.y);
  await waitFor(() => moreField(host, "Left/Right") === 256, "takeover rolls the item back");

  const before = readViewport(host);
  expect(before.scale).toBeCloseTo(1, 6);
  expect(before.panX).toBeCloseTo(0, 6);
  expect(before.panY).toBeCloseTo(0, 6);

  const b1 = { x: b0.x + 80, y: b0.y + 40 };
  pointer(host, "pointermove", 2, b1.x, b1.y);
  const anchorCentroid = { x: (a1.x + b0.x) / 2, y: (a1.y + b0.y) / 2 };
  const anchorDist = Math.hypot(a1.x - b0.x, a1.y - b0.y);
  const nowCentroid = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 };
  const nowDist = Math.hypot(a1.x - b1.x, a1.y - b1.y);
  const c = fitCenter(host);
  const expectedScale = Math.min(8, Math.max(0.25, nowDist / anchorDist));
  const expectedPanX =
    nowCentroid.x - c.x - (nowCentroid.x - c.x) * expectedScale + (nowCentroid.x - anchorCentroid.x);
  const expectedPanY =
    nowCentroid.y - c.y - (nowCentroid.y - c.y) * expectedScale + (nowCentroid.y - anchorCentroid.y);
  await waitFor(
    () =>
      Math.abs(readViewport(host).scale - expectedScale) < 0.01 &&
      Math.abs(readViewport(host).panX - expectedPanX) < 0.6 &&
      Math.abs(readViewport(host).panY - expectedPanY) < 0.6,
    "viewport panned and zoomed about the centroid",
  );
  expect(moreField(host, "Left/Right")).toBe(256);

  const itemNow = liveCanvasToScreen(host, 256, 256);
  pointer(host, "pointerdown", 3, itemNow.x, itemNow.y);
  pointer(host, "pointermove", 3, itemNow.x + 60, itemNow.y);
  pointer(host, "pointerup", 3, itemNow.x + 60, itemNow.y);
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  expect(moreField(host, "Left/Right")).toBe(256);

  pointer(host, "pointerup", 1, a1.x, a1.y);
  pointer(host, "pointerup", 2, b1.x, b1.y);
  clickUndo(host);
  await waitFor(() => host.querySelector(".segmented") === null, "no history entry was added by the takeover");
  (byLabel(host, "Redo") as HTMLButtonElement).click();
  await waitFor(() => requireEl(host.querySelector(".workspace-overlay"), "overlay") !== null, "item restored");

  const reselect = liveCanvasToScreen(host, 256, 256);
  pointer(host, "pointerdown", 1, reselect.x, reselect.y);
  pointer(host, "pointerup", 1, reselect.x, reselect.y);
  await waitFor(() => host.querySelector(".segmented") !== null, "item re-selected");
  await openMore(host);
  const resumed = liveCanvasToScreen(host, 256, 256);
  pointer(host, "pointerdown", 1, resumed.x, resumed.y);
  pointer(host, "pointermove", 1, resumed.x + 100, resumed.y);
  pointer(host, "pointerup", 1, resumed.x + 100, resumed.y);
  await waitFor(
    () => Math.abs(moreField(host, "Left/Right") - (256 + 100 / (fit.scale * expectedScale))) <= 1,
    "editing resumes after all pointers lift",
  );
}, 15000);

test("pure two-finger pan and zoom never touch the document or the undo stack", async () => {
  const host = mountApp();
  await startEditing(host, "T-Shirt");
  await importSticker(host);
  await openMore(host);
  const p1 = canvasToScreen(host, 10, 10);
  const p2 = canvasToScreen(host, 500, 500);
  pointer(host, "pointerdown", 1, p1.x, p1.y);
  pointer(host, "pointerdown", 2, p2.x, p2.y);
  expect(host.querySelector(".segmented")).toBeTruthy();

  const chord = { x: p2.x - p1.x, y: p2.y - p1.y };
  const chordLen = Math.hypot(chord.x, chord.y);
  const drift = { x: (-chord.y / chordLen) * 30, y: (chord.x / chordLen) * 30 };
  pointer(host, "pointermove", 1, p1.x + drift.x, p1.y + drift.y);
  pointer(host, "pointermove", 2, p2.x + drift.x, p2.y + drift.y);
  await waitFor(
    () =>
      Math.abs(readViewport(host).scale - 1) < 0.001 &&
      Math.abs(readViewport(host).panX - drift.x) < 0.6 &&
      Math.abs(readViewport(host).panY - drift.y) < 0.6,
    "centroid delta pans without zooming",
  );

  const q1 = { x: p1.x + drift.x, y: p1.y + drift.y };
  const q2 = { x: p2.x + drift.x, y: p2.y + drift.y };
  pointer(host, "pointermove", 1, q1.x - 40, q1.y);
  pointer(host, "pointermove", 2, q2.x + 40, q2.y);
  const afterDist = Math.hypot(chord.x + 80, chord.y);
  await waitFor(
    () => Math.abs(readViewport(host).scale - afterDist / chordLen) < 0.01,
    "pinch distance ratio zooms the viewport",
  );
  expect(moreField(host, "Left/Right")).toBe(256);
  expect(moreField(host, "Up/Down")).toBe(256);
  expect(moreField(host, "Size")).toBe(100);

  pointer(host, "pointerup", 1, q1.x - 40, q1.y);
  pointer(host, "pointerup", 2, q2.x + 40, q2.y);
  clickUndo(host);
  await waitFor(() => host.querySelector(".segmented") === null, "undo stack still holds only the add");
}, 10000);

test("pointercancel mid-drag rolls back without committing", async () => {
  const host = mountApp();
  await startEditing(host, "T-Shirt");
  await importSticker(host);
  await openMore(host);
  const start = canvasRectCenter(host).screen;
  pointer(host, "pointerdown", 1, start.x, start.y);
  pointer(host, "pointermove", 1, start.x + 150, start.y);
  await waitFor(() => moreField(host, "Left/Right") > 300, "item visibly moved mid-gesture");
  overlayEl(host).dispatchEvent(
    new PointerEvent("pointercancel", { bubbles: true, pointerId: 1, pointerType: "touch" }),
  );
  await waitFor(() => moreField(host, "Left/Right") === 256, "cancel rolls the item back");
  clickUndo(host);
  await waitFor(() => host.querySelector(".segmented") === null, "no history entry from the canceled drag");
  (byLabel(host, "Redo") as HTMLButtonElement).click();
  await waitFor(() => host.querySelector(".toolbar") !== null, "item restored");
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

  const reselect = liveCanvasToScreen(host, 256, 256);
  pointer(host, "pointerdown", 1, reselect.x, reselect.y);
  pointer(host, "pointerup", 1, reselect.x, reselect.y);
  await waitFor(() => host.querySelector(".segmented") !== null, "item re-selected");
  await openMore(host);
  const center = liveCanvasToScreen(host, 256, 256);
  pointer(host, "pointerdown", 1, center.x, center.y);
  pointer(host, "pointermove", 1, center.x + 60, center.y);
  pointer(host, "pointerup", 1, center.x + 60, center.y);
  await waitFor(() => moreField(host, "Left/Right") > 256, "editing resumes after the cancel drains");
}, 10000);

test("keyboard alternatives nudge, scale, and rotate one undo step per press", async () => {
  const host = mountApp();
  await startEditing(host, "T-Shirt");
  await importSticker(host);
  const stage = stageEl(host);
  expect(stage.tabIndex).toBe(0);
  stage.focus();
  expect(document.activeElement).toBe(stage);

  stage.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  await openMore(host);
  await waitFor(() => moreField(host, "Left/Right") === 257, "arrow moves one canvas px");
  stage.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", shiftKey: true, bubbles: true }));
  await waitFor(() => moreField(host, "Left/Right") === 267, "shift arrow moves ten canvas px");
  stage.dispatchEvent(new KeyboardEvent("keydown", { key: "+", bubbles: true }));
  await waitFor(() => moreField(host, "Size") === 105, "plus scales five percent up");
  stage.dispatchEvent(new KeyboardEvent("keydown", { key: "-", bubbles: true }));
  await waitFor(() => moreField(host, "Size") === 100, "minus scales five percent down");
  stage.dispatchEvent(new KeyboardEvent("keydown", { key: "]", bubbles: true }));
  await waitFor(() => moreField(host, "Turn") === 5, "close bracket rotates five degrees");
  stage.dispatchEvent(new KeyboardEvent("keydown", { key: "[", bubbles: true }));
  await waitFor(() => moreField(host, "Turn") === 0, "open bracket rotates five degrees back");

  clickUndo(host);
  await waitFor(() => moreField(host, "Turn") === 5, "one undo step per key press");
  for (let index = 0; index < 6; index += 1) {
    clickUndo(host);
  }
  await waitFor(() => host.querySelector(".segmented") === null, "exactly seven history entries existed");
}, 10000);

test("the gesture overlay disables touch actions and paints handle glyphs", async () => {
  const host = mountApp();
  await startEditing(host, "T-Shirt");
  await importSticker(host);
  expect(getComputedStyle(overlayEl(host)).touchAction).toBe("none");

  const overlay = overlayEl(host);
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  const ctx = overlay.getContext("2d");
  if (ctx === null) {
    throw new Error("2d context unavailable");
  }
  const fp = footprintGeometry(DECAL_DEFAULT, { width: 400, height: 300 });
  const scaleHandle = toOverlayPixel(fp.scaleHandle);
  const rotateHandle = toOverlayPixel(fp.rotateHandle);
  const scaleData = ctx.getImageData(scaleHandle.x - 3, scaleHandle.y - 3, 6, 6).data;
  const rotateData = ctx.getImageData(rotateHandle.x - 3, rotateHandle.y - 3, 6, 6).data;
  expect(countColored(scaleData)).toBeGreaterThan(0);
  expect(countColored(rotateData)).toBeGreaterThan(0);
}, 10000);

test("edge midpoint drags on a raster sticker move it instead of resizing one side", async () => {
  const harness = createHarness("raster");
  try {
    harnessPointer(harness, "pointerdown", 1, 456, 256);
    harnessPointer(harness, "pointermove", 1, 506, 256);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    harnessPointer(harness, "pointerup", 1, 506, 256);
    expect(harness.mutations).toHaveLength(1);
    expect(harness.mutations[0]?.op).toBe("patch-transform");
    expect(harness.mutations[0]?.patch.scaleX).toBeUndefined();
    expect(harness.mutations[0]?.patch.positionX).toBeCloseTo(306, 6);
    expect(harness.mutations[0]?.patch.positionY).toBeCloseTo(256, 6);
  } finally {
    harness.destroy();
  }
}, 10000);

test("color rectangles show side handles on the overlay and drag as one undo step", async () => {
  const host = mountApp();
  await startEditing(host, "T-Shirt");
  await addColor(host, 0);
  await waitFor(
    () => host.querySelector(".cutout-selection-label")?.textContent === "Color",
    "color rectangle selected",
  );
  const overlay = overlayEl(host);
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  const ctx = overlay.getContext("2d");
  if (ctx === null) {
    throw new Error("2d context unavailable");
  }
  const solid = footprintGeometry(
    { ...DECAL_DEFAULT, scaleX: 205, scaleY: 154 },
    { width: 1, height: 1 },
  );
  for (const edge of [
    solid.edgeHandles.left,
    solid.edgeHandles.right,
    solid.edgeHandles.top,
    solid.edgeHandles.bottom,
  ]) {
    const pixel = toOverlayPixel(edge);
    const data = ctx.getImageData(pixel.x - 3, pixel.y - 3, 6, 6).data;
    expect(countColored(data)).toBeGreaterThan(0);
  }

  const empty = canvasToScreen(host, 10, 10);
  pointer(host, "pointerdown", 1, empty.x, empty.y);
  pointer(host, "pointerup", 1, empty.x, empty.y);
  await waitFor(() => host.querySelector(".cutout-selection-label") === null, "deselected");
  const center = canvasToScreen(host, 256, 256);
  pointer(host, "pointerdown", 1, center.x, center.y);
  pointer(host, "pointerup", 1, center.x, center.y);
  await waitFor(
    () => host.querySelector(".cutout-selection-label")?.textContent === "Color",
    "tap reselects the color rectangle",
  );

  pointer(host, "pointerdown", 1, center.x, center.y);
  pointer(host, "pointermove", 1, center.x + 80, center.y);
  pointer(host, "pointerup", 1, center.x + 80, center.y);
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  clickUndo(host);
  await waitFor(
    () => host.querySelector(".cutout-selection-label")?.textContent === "Color",
    "move undo keeps the rectangle selected",
  );
  clickUndo(host);
  await waitFor(() => host.querySelector(".cutout-selection-label") === null, "second undo removes the rectangle");
}, 10000);

test("cutouts show side handles on the selection overlay", async () => {
  const host = mountApp();
  await startEditing(host, "Shirt");
  (byLabel(host, "Add") as HTMLButtonElement).click();
  await waitFor(() => host.querySelector('[role="dialog"][aria-label="Add"]') !== null, "add sheet");
  (byLabel(host, "Cut Out") as HTMLButtonElement).click();
  await waitFor(() => host.querySelector(".cutout-instruction") !== null, "draw mode");
  const start = canvasToScreen(host, 120, 100);
  const end = canvasToScreen(host, 360, 280);
  pointer(host, "pointerdown", 1, start.x, start.y);
  pointer(host, "pointermove", 1, end.x, end.y);
  pointer(host, "pointerup", 1, end.x, end.y);
  await waitFor(() => host.querySelector(".cutout-selection-label") !== null, "cutout selected");
  const overlay = overlayEl(host);
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  const ctx = overlay.getContext("2d");
  if (ctx === null) {
    throw new Error("2d context unavailable");
  }
  const cutout = footprintGeometry(
    { ...DECAL_DEFAULT, positionX: 240, positionY: 190, scaleX: 240, scaleY: 180 },
    { width: 1, height: 1 },
  );
  for (const edge of [
    cutout.edgeHandles.left,
    cutout.edgeHandles.right,
    cutout.edgeHandles.top,
    cutout.edgeHandles.bottom,
  ]) {
    const pixel = toOverlayPixel(edge);
    const data = ctx.getImageData(pixel.x - 3, pixel.y - 3, 6, 6).data;
    expect(countColored(data)).toBeGreaterThan(0);
  }
}, 10000);

function countColored(data: Uint8ClampedArray): number {
  let count = 0;
  for (let index = 0; index < data.length; index += 4) {
    if ((data[index + 3] ?? 0) > 0 && ((data[index] ?? 0) !== 0 || (data[index + 1] ?? 0) !== 0)) {
      count += 1;
    }
  }
  return count;
}

function toOverlayPixel(point: { x: number; y: number }): { x: number; y: number } {
  return { x: Math.round(point.x), y: Math.round(point.y) };
}

function canvasRectCenter(host: HTMLElement): { canvas: { x: number; y: number }; screen: { x: number; y: number } } {
  const canvas = canvasEl(host);
  return {
    canvas: { x: canvas.width / 2, y: canvas.height / 2 },
    screen: canvasToScreen(host, canvas.width / 2, canvas.height / 2),
  };
}

test("every pointerdown is captured so an off-overlay lift still drains the pointer map", async () => {
  const host = mountApp();
  await startEditing(host, "T-Shirt");
  await importSticker(host);
  const overlay = overlayEl(host);
  const captured: number[] = [];
  const originalCapture = overlay.setPointerCapture;
  overlay.setPointerCapture = ((pointerId: number) => {
    captured.push(pointerId);
  }) as HTMLElement["setPointerCapture"];

  const center = canvasToScreen(host, 256, 256);
  pointer(host, "pointerdown", 1, center.x, center.y);
  pointer(host, "pointermove", 1, center.x + 60, center.y);
  const second = canvasToScreen(host, 100, 100);
  pointer(host, "pointerdown", 2, second.x, second.y);
  expect(captured).toEqual([1, 2]);
  overlay.setPointerCapture = originalCapture;

  pointer(host, "pointerup", 2, -600, -400);
  pointer(host, "pointerup", 1, center.x + 60, center.y);

  await openMore(host);
  expect(moreField(host, "Left/Right")).toBe(256);
  clickUndo(host);
  await waitFor(() => host.querySelector(".segmented") === null, "takeover added no history entry");

  (byLabel(host, "Redo") as HTMLButtonElement).click();
  await waitFor(() => host.querySelector(".toolbar") !== null, "item restored");
  const reselect = liveCanvasToScreen(host, 256, 256);
  pointer(host, "pointerdown", 1, reselect.x, reselect.y);
  pointer(host, "pointerup", 1, reselect.x, reselect.y);
  await waitFor(() => host.querySelector(".segmented") !== null, "item re-selected");
  const fit = fitRect(host);
  const dragStart = liveCanvasToScreen(host, 256, 256);
  pointer(host, "pointerdown", 1, dragStart.x, dragStart.y);
  pointer(host, "pointermove", 1, dragStart.x + 90, dragStart.y);
  pointer(host, "pointerup", 1, dragStart.x + 90, dragStart.y);
  await openMore(host);
  await waitFor(
    () => Math.abs(moreField(host, "Left/Right") - (256 + 90 / fit.scale)) <= 1,
    "editing resumed after the off-overlay lift",
  );
}, 15000);

test("rapid move bursts land the exact final position on lift", async () => {
  const host = mountApp();
  await startEditing(host, "T-Shirt");
  await importSticker(host);
  await openMore(host);
  const fit = fitRect(host);
  const start = canvasToScreen(host, 256, 256);
  pointer(host, "pointerdown", 1, start.x, start.y);
  for (let step = 1; step <= 40; step += 1) {
    pointer(host, "pointermove", 1, start.x + step * 5, start.y + step * 2);
  }
  pointer(host, "pointerup", 1, start.x + 200, start.y + 80);
  await waitFor(
    () =>
      Math.abs(moreField(host, "Left/Right") - (256 + 200 / fit.scale)) <= 1 &&
      Math.abs(moreField(host, "Up/Down") - (256 + 80 / fit.scale)) <= 1,
    "burst ends at the exact final position",
  );
  clickUndo(host);
  await waitFor(
    () => moreField(host, "Left/Right") === 256 && moreField(host, "Up/Down") === 256,
    "undo restores the start",
  );
  clickUndo(host);
  await waitFor(() => host.querySelector(".segmented") === null, "the whole burst was one undo step");
}, 10000);

test("wheel bursts over a selected picture scale it as one undo step and ignore empty space", async () => {
  const host = mountApp();
  await startEditing(host, "T-Shirt");
  await importSticker(host);
  await openMore(host);
  expect(moreField(host, "Wide")).toBe(100);
  expect(moreField(host, "Tall")).toBe(100);

  const center = canvasToScreen(host, 256, 256);
  for (let index = 0; index < 4; index += 1) {
    const event = new WheelEvent("wheel", {
      deltaY: -100,
      clientX: center.x,
      clientY: center.y,
      cancelable: true,
      bubbles: true,
    });
    overlayEl(host).dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  }
  await waitFor(
    () => moreField(host, "Wide") >= 175 && moreField(host, "Tall") >= 175,
    "burst scales both axes past 175 percent",
  );
  await new Promise<void>((resolve) => setTimeout(resolve, 300));

  clickUndo(host);
  await waitFor(
    () => moreField(host, "Wide") === 100 && moreField(host, "Tall") === 100,
    "one undo restores the pre-burst scale",
  );
  clickUndo(host);
  await waitFor(() => host.querySelector(".segmented") === null, "second undo removes the picture");

  const empty = canvasToScreen(host, 256, 256);
  const stray = new WheelEvent("wheel", {
    deltaY: -100,
    clientX: empty.x,
    clientY: empty.y,
    cancelable: true,
    bubbles: true,
  });
  overlayEl(host).dispatchEvent(stray);
  expect(stray.defaultPrevented).toBe(false);
  await new Promise<void>((resolve) => setTimeout(resolve, 300));
  expect(host.querySelector(".segmented")).toBeNull();
  expect(undoDisabled(host)).toBe(true);
}, 15000);

interface Harness {
  overlay: HTMLCanvasElement;
  actions: string[];
  mutations: { op: string; patch: Record<string, number> }[];
  destroy: () => void;
}

function createHarness(kind: "raster" | "cutout" | "solid" = "raster", rotationDeg = 0): Harness {
  const host = document.createElement("div");
  host.style.cssText = "position:relative;width:600px;height:600px;";
  document.body.appendChild(host);
  const overlay = document.createElement("canvas");
  overlay.width = 512;
  overlay.height = 512;
  overlay.style.cssText =
    "position:absolute;left:0;top:0;width:512px;height:512px;touch-action:none;";
  host.appendChild(overlay);
  const actions: string[] = [];
  const mutations: { op: string; patch: Record<string, number> }[] = [];
  const crop = { x: 0, y: 0, width: 1, height: 1 };
  const footprintSource =
    kind === "raster"
      ? footprintGeometry(
          { positionX: 256, positionY: 256, rotationDeg, scaleX: 1, scaleY: 1, crop },
          { width: 400, height: 300 },
        )
      : footprintGeometry(
          { positionX: 256, positionY: 256, rotationDeg, scaleX: 400, scaleY: 300, crop },
          { width: 1, height: 1 },
        );
  let session = createSession("tshirt");
  session = {
    ...session,
    document: {
      ...session.document,
      layers: [
        kind === "raster"
          ? {
              id: "item-1",
              name: "Picture 1",
              kind: "raster",
              assetId: "asset-1",
              visible: true,
              opacity: 1,
              placement: "decal",
              transform: {
                positionX: 256,
                positionY: 256,
                rotationDeg,
                scaleX: 1,
                scaleY: 1,
                crop: { x: 0, y: 0, width: 1, height: 1 },
              },
            }
          : kind === "cutout"
            ? {
                id: "item-1",
                name: "Cut Out 1",
                kind: "cutout",
                visible: true,
                rect: { centerX: 256, centerY: 256, width: 400, height: 300, rotationDeg },
              }
            : {
                id: "item-1",
                name: "Color 1",
                kind: "solid",
                color: "#e53935",
                visible: true,
                opacity: 1,
                placement: "decal",
                transform: {
                  positionX: 256,
                  positionY: 256,
                  rotationDeg,
                  scaleX: 400,
                  scaleY: 300,
                  crop: { x: 0, y: 0, width: 1, height: 1 },
                },
              },
      ],
    },
  };
  const controller = createGestureController({
    overlay,
    canvasRect: () => ({ left: 0, top: 0, scale: 1 }),
    getSession: () => session,
    dispatch: (action) => {
      actions.push(action.type === "update-gesture" ? action.mutation.op : action.type);
      if (action.type === "update-gesture" && "patch" in action.mutation) {
        mutations.push({
          op: action.mutation.op,
          patch: action.mutation.patch as Record<string, number>,
        });
      }
      session = harnessReduce(session, action);
    },
    onSelect: () => {},
    selectedId: () => "item-1",
    itemFootprint: () => footprintSource,
    onViewportChange: () => {},
  });
  return {
    overlay,
    actions,
    mutations,
    destroy: () => {
      controller.destroy();
      host.remove();
    },
  };
}

test("cutout move, scale, rotate, and wheel gestures use cutout mutations", async () => {
  const harness = createHarness("cutout");
  try {
    harnessPointer(harness, "pointerdown", 1, 256, 256);
    harnessPointer(harness, "pointermove", 1, 300, 256);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    harnessPointer(harness, "pointerup", 1, 300, 256);
    expect(harness.actions).toContain("begin-gesture");
    expect(harness.actions).toContain("patch-cutout");
    expect(harness.actions).toContain("commit-gesture");

    harness.actions.length = 0;
    harnessPointer(harness, "pointerdown", 1, 456, 406);
    harnessPointer(harness, "pointermove", 1, 480, 430);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    harnessPointer(harness, "pointerup", 1, 480, 430);
    expect(harness.actions).toContain("patch-cutout");

    harness.actions.length = 0;
    harness.overlay.dispatchEvent(
      new WheelEvent("wheel", {
        deltaY: -100,
        clientX: 256,
        clientY: 256,
        cancelable: true,
        bubbles: true,
      }),
    );
    expect(harness.actions).toContain("patch-cutout");
  } finally {
    harness.destroy();
  }
}, 10000);

test("footprintGeometry reports edge midpoint handles in axis-aligned and rotated frames", () => {
  const flat = footprintGeometry(DECAL_DEFAULT, { width: 400, height: 300 });
  expect(flat.edgeHandles.left).toEqual({ x: 56, y: 256 });
  expect(flat.edgeHandles.right).toEqual({ x: 456, y: 256 });
  expect(flat.edgeHandles.top).toEqual({ x: 256, y: 106 });
  expect(flat.edgeHandles.bottom).toEqual({ x: 256, y: 406 });

  const turned = footprintGeometry(
    { ...DECAL_DEFAULT, rotationDeg: 90 },
    { width: 400, height: 300 },
  );
  expect(turned.edgeHandles.left.x).toBeCloseTo(256, 6);
  expect(turned.edgeHandles.left.y).toBeCloseTo(56, 6);
  expect(turned.edgeHandles.right.x).toBeCloseTo(256, 6);
  expect(turned.edgeHandles.right.y).toBeCloseTo(456, 6);
  expect(turned.edgeHandles.top.x).toBeCloseTo(406, 6);
  expect(turned.edgeHandles.top.y).toBeCloseTo(256, 6);
  expect(turned.edgeHandles.bottom.x).toBeCloseTo(106, 6);
  expect(turned.edgeHandles.bottom.y).toBeCloseTo(256, 6);
});

test("side handle drags resize one edge, keep the opposite edge fixed, and commit once", async () => {
  const harness = createHarness("solid");
  try {
    const drags: { down: [number, number]; up: [number, number]; expected: Record<string, number> }[] = [
      { down: [456, 256], up: [506, 256], expected: { scaleX: 500, positionX: 306, positionY: 256 } },
      { down: [56, 256], up: [26, 256], expected: { scaleX: 460, positionX: 226, positionY: 256 } },
      { down: [256, 106], up: [256, 76], expected: { scaleY: 360, positionX: 256, positionY: 226 } },
      { down: [256, 406], up: [256, 456], expected: { scaleY: 400, positionX: 256, positionY: 306 } },
    ];
    for (const drag of drags) {
      harness.actions.length = 0;
      harness.mutations.length = 0;
      harnessPointer(harness, "pointerdown", 1, drag.down[0], drag.down[1]);
      harnessPointer(harness, "pointermove", 1, drag.up[0], drag.up[1]);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      harnessPointer(harness, "pointerup", 1, drag.up[0], drag.up[1]);
      expect(harness.actions).toEqual(["begin-gesture", "patch-transform", "commit-gesture"]);
      expect(harness.mutations).toHaveLength(1);
      expect(harness.mutations[0]?.op).toBe("patch-transform");
      expect(harness.mutations[0]?.patch).toMatchObject(drag.expected);
    }
  } finally {
    harness.destroy();
  }
}, 10000);

test("side handle drags on a cutout patch the rect through cutout mutations", async () => {
  const harness = createHarness("cutout");
  try {
    harnessPointer(harness, "pointerdown", 1, 456, 256);
    harnessPointer(harness, "pointermove", 1, 516, 256);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    harnessPointer(harness, "pointerup", 1, 516, 256);
    expect(harness.actions).toContain("commit-gesture");
    expect(harness.mutations).toHaveLength(1);
    expect(harness.mutations[0]?.op).toBe("patch-cutout");
    expect(harness.mutations[0]?.patch).toMatchObject({ width: 520, centerX: 316, centerY: 256 });
  } finally {
    harness.destroy();
  }
}, 10000);

test("side handle drags on a decal solid patch the rectangle transform", async () => {
  const harness = createHarness("solid");
  try {
    harnessPointer(harness, "pointerdown", 1, 456, 256);
    harnessPointer(harness, "pointermove", 1, 506, 256);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    harnessPointer(harness, "pointerup", 1, 506, 256);
    expect(harness.actions).toEqual(["begin-gesture", "patch-transform", "commit-gesture"]);
    expect(harness.mutations[0]?.patch).toMatchObject({ scaleX: 500, positionX: 306, positionY: 256 });
  } finally {
    harness.destroy();
  }
}, 10000);

test("side handle drags on a rotated cutout move the edge along the rotated axis", async () => {
  const harness = createHarness("cutout", 90);
  try {
    harnessPointer(harness, "pointerdown", 1, 256, 456);
    harnessPointer(harness, "pointermove", 1, 256, 496);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    harnessPointer(harness, "pointerup", 1, 256, 496);
    expect(harness.mutations).toHaveLength(1);
    expect(harness.mutations[0]?.op).toBe("patch-cutout");
    expect(harness.mutations[0]?.patch).toMatchObject({ width: 480, centerX: 256, centerY: 296 });
  } finally {
    harness.destroy();
  }
}, 10000);

test("side handle drags clamp to a small minimum when the pointer crosses the opposite edge", async () => {
  const harness = createHarness("solid");
  try {
    harnessPointer(harness, "pointerdown", 1, 456, 256);
    harnessPointer(harness, "pointermove", 1, 100, 256);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    harnessPointer(harness, "pointerup", 1, 100, 256);
    const patch = harness.mutations[0]?.patch;
    expect(patch?.scaleX).toBeCloseTo(0.01, 6);
    expect(patch?.positionX).toBeCloseTo(56.005, 6);
    expect(patch?.positionY).toBeCloseTo(256, 6);
  } finally {
    harness.destroy();
  }
}, 10000);

test("side handles win over the interior move drag within their 44px target", async () => {
  const harness = createHarness("solid");
  try {
    harnessPointer(harness, "pointerdown", 1, 466, 262);
    harnessPointer(harness, "pointermove", 1, 516, 262);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    harnessPointer(harness, "pointerup", 1, 516, 262);
    expect(harness.mutations).toHaveLength(1);
    expect(harness.mutations[0]?.op).toBe("patch-transform");
    expect(harness.mutations[0]?.patch.scaleX).toBeCloseTo(520, 6);

    harness.mutations.length = 0;
    harnessPointer(harness, "pointerdown", 1, 450, 258);
    harnessPointer(harness, "pointermove", 1, 500, 258);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    harnessPointer(harness, "pointerup", 1, 500, 258);
    expect(harness.mutations).toHaveLength(1);
    expect(harness.mutations[0]?.patch.scaleX).toBeCloseTo(488, 6);
    expect(harness.mutations[0]?.patch.positionX).toBeCloseTo(300, 6);
  } finally {
    harness.destroy();
  }
}, 10000);

function harnessReduce(session: EditorSession, action: EditorAction): EditorSession {
  if (action.type === "begin-gesture") {
    return { ...session, pending: session.document };
  }
  if (action.type === "cancel-gesture") {
    return { ...session, document: session.pending ?? session.document, pending: null };
  }
  if (action.type === "commit-gesture") {
    return {
      ...session,
      pending: null,
      undo: session.pending === null ? session.undo : [...session.undo, session.pending],
    };
  }
  return session;
}

function harnessPointer(harness: Harness, type: string, id: number, x: number, y: number): void {
  harness.overlay.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      pointerId: id,
      pointerType: "touch",
      clientX: x,
      clientY: y,
      buttons: 1,
      isPrimary: id === 1,
    }),
  );
}

test("destroy during an active item gesture rolls back with cancel-gesture", async () => {
  const harness = createHarness();
  try {
    harnessPointer(harness, "pointerdown", 1, 256, 256);
    harnessPointer(harness, "pointermove", 1, 356, 256);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    harnessPointer(harness, "pointermove", 1, 456, 256);
    harness.destroy();
    expect(harness.actions).toContain("cancel-gesture");
    expect(harness.actions.filter((type) => type === "commit-gesture")).toHaveLength(0);
    expect(harness.actions.indexOf("cancel-gesture")).toBeGreaterThan(
      harness.actions.indexOf("begin-gesture"),
    );
  } finally {
    harness.destroy();
  }
}, 10000);

test("destroy during a wheel burst cancels the gesture without committing", () => {
  const harness = createHarness();
  try {
    harness.overlay.dispatchEvent(
      new WheelEvent("wheel", { deltaY: -100, clientX: 256, clientY: 256, cancelable: true, bubbles: true }),
    );
    harness.destroy();
    expect(harness.actions).toContain("begin-gesture");
    expect(harness.actions).toContain("cancel-gesture");
    expect(harness.actions.filter((type) => type === "commit-gesture")).toHaveLength(0);
    expect(harness.actions.indexOf("cancel-gesture")).toBeGreaterThan(
      harness.actions.indexOf("begin-gesture"),
    );
  } finally {
    harness.destroy();
  }
}, 10000);

test("keyboard auto-repeat does not stack extra undo steps", async () => {
  const host = mountApp();
  await startEditing(host, "T-Shirt");
  await importSticker(host);
  const stage = stageEl(host);
  stage.focus();
  for (let press = 0; press < 3; press += 1) {
    stage.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", repeat: true, bubbles: true }));
  }
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await openMore(host);
  expect(moreField(host, "Left/Right")).toBe(256);
  stage.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  await waitFor(() => moreField(host, "Left/Right") === 257, "one real press still moves one px");
  clickUndo(host);
  await waitFor(() => moreField(host, "Left/Right") === 256, "undo restores before repeats");
  clickUndo(host);
  await waitFor(() => host.querySelector(".segmented") === null, "only the real press entered history");
}, 10000);
