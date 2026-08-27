import { afterEach, expect, test, vi } from "vitest";
import { mountDesignerApp, unmountDesignerApp } from "../../src/editor/ui/mount";
import "../../src/styles.css";

const h = vi.hoisted(() => ({
  generatePattern: vi.fn(),
}));

vi.mock("../../src/ai/pattern-client", () => ({
  PATTERN_PROXY_URL: undefined,
  generatePattern: h.generatePattern,
}));

function requireEl<T extends Element>(element: T | null | undefined, what: string): T {
  if (element === null || element === undefined) {
    throw new Error(`missing ${what}`);
  }
  return element;
}

let hosts: HTMLElement[] = [];

function mountApp(): HTMLElement {
  document.documentElement.lang = "en";
  const host = document.createElement("div");
  document.body.appendChild(host);
  mountDesignerApp(host);
  hosts.push(host);
  return host;
}

afterEach(() => {
  for (const host of hosts) {
    unmountDesignerApp(host);
    host.remove();
  }
  hosts = [];
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

function hasText(host: HTMLElement, text: string): boolean {
  const buttons = Array.from(host.querySelectorAll("button")) as HTMLButtonElement[];
  return buttons.some((button) => (button.textContent ?? "").trim() === text);
}

test("generate affordances are hidden when no proxy URL is configured", async () => {
  const host = mountApp();
  expect(hasText(host, "Parent Settings")).toBe(false);
  (requireEl(host.querySelector('[aria-label="T-Shirt"]'), "t-shirt card") as HTMLButtonElement).click();
  await waitFor(() => host.querySelector(".toolbar") !== null, "editor to mount");
  (requireEl(host.querySelector('.toolbar [aria-label="Add"]'), "add tool") as HTMLButtonElement).click();
  await waitFor(
    () => host.querySelector('[role="dialog"][aria-label="Add"]') !== null,
    "add sheet",
  );
  expect(hasText(host, "Generate a Pattern")).toBe(false);
  expect(h.generatePattern).not.toHaveBeenCalled();
});
