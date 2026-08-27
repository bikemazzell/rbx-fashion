import { afterEach, expect, test } from "vitest";
import { mountDesignerApp, unmountDesignerApp } from "../../src/editor/ui/mount";
import { ITEM_CAP_MESSAGE } from "../../src/editor/ui/text";
import "../../src/styles.css";

let hosts: HTMLElement[] = [];

interface BitmapRecord {
  closed: boolean;
}

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

async function waitFor(condition: () => boolean, what: string, timeout = 8000): Promise<void> {
  const start = performance.now();
  while (!condition()) {
    if (performance.now() - start > timeout) {
      throw new Error(`timeout waiting for ${what}`);
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}

function byLabel(host: HTMLElement, label: string): HTMLButtonElement {
  return requireEl(
    host.querySelector(`[aria-label="${label}"]`),
    `aria-label ${label}`,
  ) as HTMLButtonElement;
}

function trackBitmaps(): { records: BitmapRecord[]; restore: () => void } {
  const records: BitmapRecord[] = [];
  const original = window.createImageBitmap;
  window.createImageBitmap = (async (...args: Parameters<typeof createImageBitmap>) => {
    const bitmap = await original(...args);
    const record: BitmapRecord = { closed: false };
    const rawClose = bitmap.close.bind(bitmap);
    bitmap.close = () => {
      record.closed = true;
      rawClose();
    };
    records.push(record);
    return bitmap;
  }) as typeof createImageBitmap;
  return { records, restore: () => {
    window.createImageBitmap = original;
  } };
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
  ctx.fillRect(0, 0, width / 2, height);
  ctx.fillStyle = "#0000ff";
  ctx.fillRect(width / 2, 0, width / 2, height);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => (result === null ? reject(new Error("encode failed")) : resolve(result)), "image/png");
  });
  return new File([blob], "art.png", { type: "image/png" });
}

async function startEditing(host: HTMLElement, garment: string): Promise<void> {
  (byLabel(host, garment) as HTMLButtonElement).click();
  await waitFor(() => host.querySelector(".toolbar") !== null, "editor to mount");
}

async function choosePicture(host: HTMLElement, file: File): Promise<void> {
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
}

test("cancelling the Shirt-or-Pants question closes the orphaned import bitmaps", async () => {
  const host = mountApp();
  await startEditing(host, "Shirt");
  const tracker = trackBitmaps();
  try {
    await choosePicture(host, await pngFile(585, 559));
    await waitFor(
      () => host.querySelector('[role="dialog"][aria-label="Is this a Shirt or Pants?"]') !== null,
      "question sheet",
    );
    byLabel(host, "Cancel").click();
    await waitFor(
      () => host.querySelector('[role="dialog"][aria-label="Is this a Shirt or Pants?"]') === null,
      "question sheet closes",
    );
    expect(tracker.records.length).toBeGreaterThanOrEqual(2);
    for (const record of tracker.records) {
      expect(record.closed).toBe(true);
    }
  } finally {
    tracker.restore();
  }
}, 15000);

test("a cap-rejected picture import closes the orphaned bitmaps and keeps the cap message", async () => {
  const host = mountApp();
  await startEditing(host, "T-Shirt");
  await choosePicture(host, await pngFile(400, 300));
  await waitFor(() => host.querySelector(".selection-bar") !== null, "first picture lands");
  for (let index = 0; index < 7; index += 1) {
    (byLabel(host, "Items") as HTMLButtonElement).click();
    await waitFor(() => host.querySelector('[role="dialog"][aria-label="Items"]') !== null, "items sheet");
    const duplicates = host.querySelectorAll('[aria-label="Duplicate"]');
    (duplicates[0] as HTMLButtonElement).click();
    await waitFor(() => host.querySelectorAll(".item-row").length === index + 2, "duplicate lands");
    byLabel(host, "Done").click();
    await waitFor(() => host.querySelector('[role="dialog"][aria-label="Items"]') === null, "items close");
  }
  const tracker = trackBitmaps();
  try {
    await choosePicture(host, await pngFile(400, 300));
    await waitFor(
      () => (host.querySelector('[role="status"]')?.textContent ?? "").includes(ITEM_CAP_MESSAGE),
      "cap message",
    );
    expect(tracker.records.length).toBeGreaterThanOrEqual(2);
    for (const record of tracker.records) {
      expect(record.closed).toBe(true);
    }
  } finally {
    tracker.restore();
  }
}, 30000);
