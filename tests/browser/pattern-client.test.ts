import { expect, test, vi } from "vitest";
import { generatePattern, patternPromptLength } from "../../src/ai/pattern-client";
import {
  GENERATE_FAILED_MESSAGE,
  GENERATE_INVALID_PROMPT_MESSAGE,
  GENERATE_PARENT_SETUP_MESSAGE,
  GENERATE_TIMEOUT_MESSAGE,
} from "../../src/editor/ui/text";

const PROXY_URL = "https://pattern-proxy.example/";
const API_KEY = "test-key";
const PROMPT = "rainy day dots";

const PNG_1X1_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

function pngBytes(): Uint8Array<ArrayBuffer> {
  const binary = atob(PNG_1X1_BASE64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function pngResponse(): Response {
  return new Response(pngBytes(), { status: 200, headers: { "content-type": "image/png" } });
}

function input(overrides: Partial<Parameters<typeof generatePattern>[0]> = {}) {
  return {
    proxyUrl: PROXY_URL,
    apiKey: API_KEY,
    prompt: PROMPT,
    fetchImpl: vi.fn(async () => pngResponse()) as unknown as typeof fetch,
    ...overrides,
  };
}

test("patternPromptLength counts Unicode code points, not UTF-16 units", () => {
  expect(patternPromptLength("abc")).toBe(3);
  expect(patternPromptLength("")).toBe(0);
  expect(patternPromptLength("𝐀")).toBe(1);
  expect(patternPromptLength("𝐀".repeat(251))).toBe(251);
  expect(patternPromptLength("a".repeat(500))).toBe(500);
});

test("a successful call posts to the proxy endpoint and returns the PNG bytes", async () => {
  const fetchImpl = vi.fn(async () => pngResponse()) as unknown as typeof fetch;
  const outcome = await generatePattern(input({ fetchImpl }));
  expect(outcome).toEqual({ ok: true, bytes: pngBytes() });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  const [url, init] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0] as [
    string,
    RequestInit,
  ];
  expect(url).toBe("https://pattern-proxy.example/api/patterns");
  expect(init.method).toBe("POST");
  expect(new Headers(init.headers).get("content-type")).toBe("application/json");
  expect(new Headers(init.headers).get("x-gemini-api-key")).toBe(API_KEY);
  expect(JSON.parse(String(init.body))).toEqual({ prompt: PROMPT });
});

test("a 401 response maps to unauthorized with the parent setup message", async () => {
  const fetchImpl = vi.fn(async () => new Response("", { status: 401 })) as unknown as typeof fetch;
  const outcome = await generatePattern(input({ fetchImpl }));
  expect(outcome).toEqual({ ok: false, kind: "unauthorized", message: GENERATE_PARENT_SETUP_MESSAGE });
});

test("a 403 response maps to unauthorized", async () => {
  const fetchImpl = vi.fn(async () => new Response("", { status: 403 })) as unknown as typeof fetch;
  const outcome = await generatePattern(input({ fetchImpl }));
  expect(outcome.ok).toBe(false);
  if (!outcome.ok) {
    expect(outcome.kind).toBe("unauthorized");
  }
});

test("a 500 response maps to upstream with the failed message", async () => {
  const fetchImpl = vi.fn(async () => new Response("", { status: 500 })) as unknown as typeof fetch;
  const outcome = await generatePattern(input({ fetchImpl }));
  expect(outcome).toEqual({ ok: false, kind: "upstream", message: GENERATE_FAILED_MESSAGE });
});

test("a 200 response with a non-PNG body maps to invalid-image", async () => {
  const fetchImpl = vi.fn(async () => new Response("not a png", { status: 200 })) as unknown as typeof fetch;
  const outcome = await generatePattern(input({ fetchImpl }));
  expect(outcome).toEqual({ ok: false, kind: "invalid-image", message: GENERATE_FAILED_MESSAGE });
});

test("a rejected fetch maps to network", async () => {
  const fetchImpl = vi.fn(async () => {
    throw new TypeError("fetch failed");
  }) as unknown as typeof fetch;
  const outcome = await generatePattern(input({ fetchImpl }));
  expect(outcome).toEqual({ ok: false, kind: "network", message: GENERATE_FAILED_MESSAGE });
});

test("a never-settling fetch with a tiny timeout maps to timeout", async () => {
  const fetchImpl = vi.fn(() => new Promise<Response>(() => {})) as unknown as typeof fetch;
  const outcome = await generatePattern(input({ fetchImpl, timeoutMs: 50 }));
  expect(outcome).toEqual({ ok: false, kind: "timeout", message: GENERATE_TIMEOUT_MESSAGE });
});

test("a pre-aborted signal maps to cancelled without calling fetch", async () => {
  const fetchImpl = vi.fn(async () => pngResponse()) as unknown as typeof fetch;
  const controller = new AbortController();
  controller.abort();
  const outcome = await generatePattern(input({ fetchImpl, signal: controller.signal }));
  expect(outcome.ok).toBe(false);
  if (!outcome.ok) {
    expect(outcome.kind).toBe("cancelled");
  }
  expect(fetchImpl).not.toHaveBeenCalled();
});

test("a prompt of 501 code points is rejected without calling fetch", async () => {
  const fetchImpl = vi.fn(async () => pngResponse()) as unknown as typeof fetch;
  const outcome = await generatePattern(
    input({ prompt: "a".repeat(501), fetchImpl }),
  );
  expect(outcome).toEqual({ ok: false, kind: "invalid-prompt", message: GENERATE_INVALID_PROMPT_MESSAGE });
  expect(fetchImpl).not.toHaveBeenCalled();
});

test("an empty prompt is rejected without calling fetch", async () => {
  const fetchImpl = vi.fn(async () => pngResponse()) as unknown as typeof fetch;
  const outcome = await generatePattern(input({ prompt: "", fetchImpl }));
  expect(outcome.ok).toBe(false);
  if (!outcome.ok) {
    expect(outcome.kind).toBe("invalid-prompt");
  }
  expect(fetchImpl).not.toHaveBeenCalled();
});

test("user abort during an unsettled fetch maps to cancelled, not timeout", async () => {
  const controller = new AbortController();
  const fetchImpl = vi.fn(
    () =>
      new Promise<Response>(() => {
        setTimeout(() => controller.abort(), 30);
      }),
  ) as unknown as typeof fetch;
  const outcome = await generatePattern(
    input({ fetchImpl, signal: controller.signal, timeoutMs: 60_000 }),
  );
  expect(outcome.ok).toBe(false);
  if (!outcome.ok) {
    expect(outcome.kind).toBe("cancelled");
  }
});

test("PATTERN_PROXY_URL mirrors the configured vite environment variable", async () => {
  vi.stubEnv("VITE_PATTERN_PROXY_URL", "https://env-mirror.example");
  try {
    const specifier = "../../src/ai/pattern-client?env-mirror";
    const mod = (await import(/* @vite-ignore */ specifier)) as typeof import("../../src/ai/pattern-client");
    expect(mod.PATTERN_PROXY_URL).toBe("https://env-mirror.example");
  } finally {
    vi.unstubAllEnvs();
  }
});
