import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { unzipSync } from "fflate";
import { sha256Hex } from "../../src/assets/hash";
import { mountDesignerApp, unmountDesignerApp } from "../../src/editor/ui/mount";
import { GENERATE_PARENT_SETUP_MESSAGE } from "../../src/editor/ui/text";
import "../../src/styles.css";

const h = vi.hoisted(() => ({
  generatePattern: vi.fn(),
}));

vi.mock("../../src/ai/pattern-client", () => ({
  PATTERN_PROXY_URL: "https://pattern-proxy.example",
  generatePattern: h.generatePattern,
}));

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

async function waitFor(
  condition: () => boolean | Promise<boolean>,
  what: string,
  timeout = 5000,
): Promise<void> {
  const start = performance.now();
  while (!(await condition())) {
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

function hasText(host: HTMLElement, text: string): boolean {
  const buttons = Array.from(host.querySelectorAll("button")) as HTMLButtonElement[];
  return buttons.some((button) => (button.textContent ?? "").trim() === text);
}

function statusText(host: HTMLElement): string {
  return host.querySelector('[role="status"]')?.textContent ?? "";
}

function dialog(host: HTMLElement, label: string): HTMLElement {
  return requireEl(
    host.querySelector(`[role="dialog"][aria-label="${label}"]`),
    `dialog ${label}`,
  );
}

async function startEditing(host: HTMLElement, garment: string): Promise<void> {
  (byLabel(host, garment) as HTMLButtonElement).click();
  await waitFor(() => host.querySelector(".toolbar") !== null, "editor to mount");
}

async function openAddSheet(host: HTMLElement): Promise<HTMLElement> {
  (requireEl(host.querySelector('.toolbar [aria-label="Add"]'), "add tool") as HTMLButtonElement).click();
  await waitFor(
    () => host.querySelector('[role="dialog"][aria-label="Add"]') !== null,
    "add sheet",
  );
  return dialog(host, "Add");
}

async function openGenerateSheet(host: HTMLElement): Promise<HTMLElement> {
  await openAddSheet(host);
  (byText(host, "Generate a Pattern") as HTMLButtonElement).click();
  await waitFor(
    () => host.querySelector('[role="dialog"][aria-label="Make a Pattern"]') !== null,
    "generate sheet",
  );
  return dialog(host, "Make a Pattern");
}

async function settle(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

async function setControlValue(input: HTMLInputElement | HTMLTextAreaElement, value: string): Promise<void> {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await settle();
}

async function setPrompt(sheet: HTMLElement, value: string): Promise<void> {
  const textarea = requireEl(
    sheet.querySelector('textarea[aria-label="What should the pattern look like?"]'),
    "prompt textarea",
  ) as HTMLTextAreaElement;
  await setControlValue(textarea, value);
}

async function saveKeyViaParentSettings(host: HTMLElement, key: string): Promise<void> {
  (byText(host, "Parent Settings") as HTMLButtonElement).click();
  await waitFor(
    () => host.querySelector('[role="dialog"][aria-label="Parent Settings"]') !== null,
    "parent settings sheet",
  );
  const sheet = dialog(host, "Parent Settings");
  const input = requireEl(sheet.querySelector('input[aria-label="Gemini API key"]'), "key input") as HTMLInputElement;
  await setControlValue(input, key);
  (byText(host, "Save Key") as HTMLButtonElement).click();
  await waitFor(() => statusText(host).includes("A key is saved for this session."), "key saved status");
  const done = requireEl(sheet.querySelector('[aria-label="Done"]'), "done") as HTMLButtonElement;
  done.click();
  await waitFor(
    () => host.querySelector('[role="dialog"][aria-label="Parent Settings"]') === null,
    "parent settings closes",
  );
}

async function itemCount(host: HTMLElement): Promise<number> {
  (byLabel(host, "Items") as HTMLButtonElement).click();
  await waitFor(
    () => host.querySelector('[role="dialog"][aria-label="Items"]') !== null,
    "items sheet",
  );
  const rows = host.querySelectorAll('[role="dialog"][aria-label="Items"] .item-row');
  const done = requireEl(
    host.querySelector('[role="dialog"][aria-label="Items"] [aria-label="Done"]'),
    "done",
  ) as HTMLButtonElement;
  done.click();
  await waitFor(
    () => host.querySelector('[role="dialog"][aria-label="Items"]') === null,
    "items sheet closes",
  );
  return rows.length;
}

function stubBlobDownloads(): { blobs: Blob[]; restore: () => void } {
  const blobs: Blob[] = [];
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  URL.createObjectURL = ((blob: Blob) => {
    blobs.push(blob);
    return "blob:test";
  }) as typeof URL.createObjectURL;
  URL.revokeObjectURL = (() => {}) as typeof URL.revokeObjectURL;
  const onClickCapture = (event: MouseEvent) => {
    const target = event.target as HTMLAnchorElement | null;
    if (target !== null && target.tagName === "A" && target.download) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  document.addEventListener("click", onClickCapture, true);
  return {
    blobs,
    restore: () => {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      document.removeEventListener("click", onClickCapture, true);
    },
  };
}

async function canvasPngBytes(size = 64): Promise<Uint8Array<ArrayBuffer>> {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    throw new Error("2d context unavailable");
  }
  ctx.fillStyle = "#2f9e44";
  ctx.fillRect(0, 0, size, size);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (blob === null) {
    throw new Error("png encoding failed");
  }
  return new Uint8Array(await blob.arrayBuffer());
}

beforeEach(() => {
  h.generatePattern.mockReset();
});

afterEach(() => {
  unmountHosts();
});

test("generate affordances appear when a proxy URL is configured", async () => {
  const host = mountApp();
  expect(hasText(host, "Parent Settings")).toBe(true);
  await startEditing(host, "T-Shirt");
  await openAddSheet(host);
  expect(hasText(host, "Generate a Pattern")).toBe(true);
});

test("parent settings saves and forgets a session key without touching storage", async () => {
  const host = mountApp();
  const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
  const cookieBefore = document.cookie;
  try {
    (byText(host, "Parent Settings") as HTMLButtonElement).click();
    await waitFor(
      () => host.querySelector('[role="dialog"][aria-label="Parent Settings"]') !== null,
      "parent settings sheet",
    );
    const sheet = dialog(host, "Parent Settings");
    expect(sheet.textContent).toContain("The key is kept in memory for this session only and is sent to the pattern service when your child generates a picture.");
    const input = requireEl(sheet.querySelector('input[aria-label="Gemini API key"]'), "key input") as HTMLInputElement;
    expect(input.type).toBe("password");
    expect(input.getAttribute("autocomplete")).toBe("off");
    await waitFor(
      () => document.activeElement === byText(host, "Save Key"),
      "save key focused",
    );
    expect(statusText(host)).toContain("No key saved.");
    await setControlValue(input, "parent-secret-key");
    (byText(host, "Save Key") as HTMLButtonElement).click();
    await waitFor(() => statusText(host).includes("A key is saved for this session."), "key saved status");
    expect(input.value).toBe("");
    expect(host.textContent ?? "").not.toContain("parent-secret-key");
    (byText(host, "Forget Key") as HTMLButtonElement).click();
    await waitFor(() => statusText(host).includes("No key saved."), "key forgotten status");
    expect(setItemSpy).not.toHaveBeenCalled();
    expect(document.cookie).toBe(cookieBefore);
  } finally {
    setItemSpy.mockRestore();
  }
});

test("generate without a saved key shows the parent setup notice and makes no call", async () => {
  const host = mountApp();
  await startEditing(host, "T-Shirt");
  await openAddSheet(host);
  (byText(host, "Generate a Pattern") as HTMLButtonElement).click();
  await waitFor(
    () => statusText(host).includes(GENERATE_PARENT_SETUP_MESSAGE),
    "parent setup notice",
  );
  expect(host.querySelector('[role="dialog"][aria-label="Add"]')).not.toBeNull();
  expect(h.generatePattern).not.toHaveBeenCalled();
  expect(await itemCount(host)).toBe(0);
});

test("a successful generation inserts a Repeat item with prompt provenance in the saved project", async () => {
  const bytes = await canvasPngBytes(64);
  h.generatePattern.mockResolvedValue({ ok: true, bytes });
  const host = mountApp();
  await saveKeyViaParentSettings(host, "parent-key-1");
  await startEditing(host, "T-Shirt");
  const sheet = await openGenerateSheet(host);
  const chips = Array.from(sheet.querySelectorAll("button")) as HTMLButtonElement[];
  for (const idea of ["Rainy day dots", "Happy frogs", "Starry night sky"]) {
    expect(chips.some((chip) => (chip.textContent ?? "").trim() === idea)).toBe(true);
  }
  (byText(host, "Happy frogs") as HTMLButtonElement).click();
  await settle();
  const textarea = requireEl(
    sheet.querySelector('textarea[aria-label="What should the pattern look like?"]'),
    "prompt textarea",
  ) as HTMLTextAreaElement;
  expect(textarea.value).toBe("Happy frogs");
  await setPrompt(sheet, "Happy frogs on skateboards");
  (byText(host, "Generate") as HTMLButtonElement).click();
  await waitFor(
    () => host.querySelector('[role="dialog"][aria-label="Make a Pattern"]') === null,
    "generate sheet closes",
  );
  expect(h.generatePattern).toHaveBeenCalledTimes(1);
  const call = h.generatePattern.mock.calls[0]?.[0] as {
    proxyUrl: string;
    apiKey: string;
    prompt: string;
    signal: AbortSignal;
  };
  expect(call.proxyUrl).toBe("https://pattern-proxy.example");
  expect(call.apiKey).toBe("parent-key-1");
  expect(call.prompt).toBe("Happy frogs on skateboards");
  expect(call.signal).toBeInstanceOf(AbortSignal);
  await waitFor(async () => (await itemCount(host)) === 1, "one item added");
  const repeat = requireEl(host.querySelector('.segmented [aria-label="Repeat"]'), "repeat button");
  expect(repeat.getAttribute("aria-pressed")).toBe("true");
  const sticker = requireEl(host.querySelector('.segmented [aria-label="Sticker"]'), "sticker button");
  expect(sticker.getAttribute("aria-pressed")).toBe("false");

  const stub = stubBlobDownloads();
  try {
    (byLabel(host, "Save") as HTMLButtonElement).click();
    await waitFor(() => stub.blobs.length === 1, "save download");
  } finally {
    stub.restore();
  }
  const files = unzipSync(new Uint8Array(await (stub.blobs[0] as Blob).arrayBuffer()));
  const project = JSON.parse(new TextDecoder().decode(files["project.json"])) as {
    name: string;
    layers: { name: string; placement: string }[];
    assets: {
      originalName: string;
      source: string;
      prompt?: string;
      byteLength: number;
      width: number;
      height: number;
      sha256: string;
    }[];
  };
  expect(project.assets.length).toBe(1);
  const asset = project.assets[0];
  if (asset === undefined) {
    throw new Error("missing asset");
  }
  expect(asset.source).toBe("generated");
  expect(asset.prompt).toBe("Happy frogs on skateboards");
  expect(asset.originalName).toBe("AI pattern");
  expect(asset.width).toBe(64);
  expect(asset.height).toBe(64);
  expect(asset.byteLength).toBe(bytes.length);
  expect(asset.sha256).toBe(await sha256Hex(bytes));
  expect(project.layers.length).toBe(1);
  expect(project.layers[0]?.placement).toBe("pattern");
  expect(project.layers[0]?.name).toBe("Picture 1");
  expect(JSON.stringify(project)).not.toContain("parent-key-1");
});

test("a failed generation shows a status notice and leaves the project unchanged", async () => {
  h.generatePattern.mockResolvedValue({
    ok: false,
    kind: "upstream",
    message: "Something went wrong making your pattern. Try again.",
  });
  const host = mountApp();
  await saveKeyViaParentSettings(host, "parent-key-2");
  await startEditing(host, "Shirt");
  const sheet = await openGenerateSheet(host);
  await setPrompt(sheet, "starry night");
  (byText(host, "Generate") as HTMLButtonElement).click();
  await waitFor(
    () => statusText(host).includes("Something went wrong making your pattern. Try again."),
    "failure notice",
  );
  await waitFor(
    () => host.querySelector('[role="dialog"][aria-label="Make a Pattern"]') === null,
    "generate sheet closes",
  );
  expect(await itemCount(host)).toBe(0);
});

test("cancelling an in-flight generation closes the sheet quietly", async () => {
  h.generatePattern.mockImplementation(
    (input: { signal?: AbortSignal }) =>
      new Promise((resolve) => {
        input.signal?.addEventListener("abort", () => {
          resolve({ ok: false, kind: "cancelled", message: "" });
        });
      }),
  );
  const host = mountApp();
  await saveKeyViaParentSettings(host, "parent-key-3");
  await startEditing(host, "Pants");
  const sheet = await openGenerateSheet(host);
  await setPrompt(sheet, "rainy day dots");
  (byText(host, "Generate") as HTMLButtonElement).click();
  await waitFor(() => statusText(host).includes("Making your pattern…"), "in-flight status");
  const generateButton = byText(host, "Generate");
  expect(generateButton.disabled).toBe(true);
  (byText(host, "Cancel") as HTMLButtonElement).click();
  await waitFor(
    () => host.querySelector('[role="dialog"][aria-label="Make a Pattern"]') === null,
    "generate sheet closes",
  );
  expect(statusText(host)).toBe("");
  expect(await itemCount(host)).toBe(0);
});
