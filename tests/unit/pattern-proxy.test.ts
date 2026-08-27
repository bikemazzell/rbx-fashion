import { expect, test, vi } from "vitest";
import {
  DEFAULT_GEMINI_IMAGE_MODEL,
  handlePatternRequest,
} from "../../proxy/handler";
import type { PatternProxyOptions } from "../../proxy/handler";

const ALLOWED_ORIGIN = "https://app.example.com";
const OTHER_ALLOWED_ORIGIN = "https://other.example.org";
const PROXY_URL = "https://proxy.example.test/api/patterns";
const PROMPT = "SECRET-PROMPT-42";
const API_KEY = "SECRET-KEY-42";
const UPSTREAM_BODY_TEXT = "SECRET-UPSTREAM-BODY-99";
const PNG_1X1_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

function pngBytes(): Uint8Array {
  const binary = atob(PNG_1X1_BASE64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function upstreamJson(inlineData: { mimeType: string; data: string }): string {
  return JSON.stringify({
    candidates: [
      {
        content: {
          parts: [
            { text: "some text part" },
            { inlineData },
          ],
        },
      },
    ],
  });
}

function pngUpstreamFetch(): typeof fetch {
  return vi.fn(async () =>
    new Response(upstreamJson({ mimeType: "image/png", data: PNG_1X1_BASE64 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  ) as unknown as typeof fetch;
}

interface RequestExtras {
  origin?: string | null;
  contentType?: string | null;
  contentLength?: string | null;
  apiKey?: string | null;
  url?: string;
}

function postRequest(body: string | ReadableStream<Uint8Array>, extras: RequestExtras = {}): Request {
  const headers: Record<string, string> = {};
  if (extras.origin !== null) {
    headers.origin = extras.origin ?? ALLOWED_ORIGIN;
  }
  if (extras.contentType !== null) {
    headers["content-type"] = extras.contentType ?? "application/json";
  }
  if (extras.contentLength !== null) {
    headers["content-length"] =
      extras.contentLength ?? String(typeof body === "string" ? Buffer.byteLength(body) : 0);
  }
  if (extras.apiKey !== null) {
    headers["x-gemini-api-key"] = extras.apiKey ?? API_KEY;
  }
  if (typeof body === "string") {
    return new Request(extras.url ?? PROXY_URL, { method: "POST", headers, body });
  }
  const init: RequestInit = { method: "POST", headers, body, redirect: "manual" };
  (init as { duplex?: "half" }).duplex = "half";
  return new Request(extras.url ?? PROXY_URL, init);
}

function validBody(prompt: string): string {
  return JSON.stringify({ prompt });
}

function options(overrides: Partial<PatternProxyOptions> = {}): PatternProxyOptions {
  return {
    allowedOrigins: [ALLOWED_ORIGIN, OTHER_ALLOWED_ORIGIN],
    upstreamFetch: pngUpstreamFetch(),
    ...overrides,
  };
}

async function errorBody(response: Response): Promise<{ code: string; message: string; text: string }> {
  expect(response.headers.get("content-type")).toBe("application/json");
  const text = await response.text();
  const parsed = JSON.parse(text) as {
    error?: { code?: unknown; message?: unknown };
  };
  expect(parsed.error).toBeDefined();
  expect(typeof parsed.error?.code).toBe("string");
  expect(typeof parsed.error?.message).toBe("string");
  const error = parsed.error as { code: string; message: string };
  return { code: error.code, message: error.message, text };
}

function requestBodyOfSize(size: number): string {
  const head = '{"prompt":"a","x":"';
  const tail = '"}';
  const filler = "b".repeat(size - head.length - tail.length);
  const body = head + filler + tail;
  expect(Buffer.byteLength(body)).toBe(size);
  return body;
}

function stalledStream(): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({ start() {} });
}

function countedStream(byteLength: number): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(byteLength).fill(0x61));
      controller.close();
    },
  });
}

test("preflight from an allowed origin returns 204 with the exact CORS header set", async () => {
  const response = await handlePatternRequest(
    new Request(PROXY_URL, { method: "OPTIONS", headers: { origin: ALLOWED_ORIGIN } }),
    options(),
  );
  expect(response.status).toBe(204);
  expect(response.headers.get("access-control-allow-origin")).toBe(ALLOWED_ORIGIN);
  expect(response.headers.get("access-control-allow-methods")).toBe("POST, OPTIONS");
  expect(response.headers.get("access-control-allow-headers")).toBe("Content-Type, X-Gemini-Api-Key");
  expect(response.headers.get("access-control-max-age")).toBe("86400");
  expect(response.headers.get("vary")).toBe("Origin");
});

test("preflight from a disallowed origin is 403 invalid-origin with no ACAO header", async () => {
  const response = await handlePatternRequest(
    new Request(PROXY_URL, { method: "OPTIONS", headers: { origin: "https://evil.com" } }),
    options(),
  );
  expect(response.status).toBe(403);
  expect(response.headers.get("access-control-allow-origin")).toBeNull();
  expect((await errorBody(response)).code).toBe("invalid-origin");
});

test("preflight without an Origin header is 403 invalid-origin", async () => {
  const response = await handlePatternRequest(
    new Request(PROXY_URL, { method: "OPTIONS" }),
    options(),
  );
  expect(response.status).toBe(403);
  expect((await errorBody(response)).code).toBe("invalid-origin");
});

test("POST from an allowed origin returns the decoded PNG bytes with CORS headers", async () => {
  const response = await handlePatternRequest(
    postRequest(validBody(PROMPT), { origin: OTHER_ALLOWED_ORIGIN }),
    options(),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("image/png");
  expect(response.headers.get("access-control-allow-origin")).toBe(OTHER_ALLOWED_ORIGIN);
  expect(response.headers.get("vary")).toBe("Origin");
  const received = new Uint8Array(await response.arrayBuffer());
  expect(Array.from(received)).toEqual(Array.from(pngBytes()));
});

test("POST from a suffix-matching origin is rejected", async () => {
  const response = await handlePatternRequest(
    postRequest(validBody(PROMPT), { origin: "https://evil.com" }),
    options(),
  );
  expect(response.status).toBe(403);
  expect(response.headers.get("access-control-allow-origin")).toBeNull();
  expect((await errorBody(response)).code).toBe("invalid-origin");
});

test("POST from an origin that embeds the allowed origin as a substring is rejected", async () => {
  const response = await handlePatternRequest(
    postRequest(validBody(PROMPT), { origin: `https://${ALLOWED_ORIGIN.slice("https://".length)}.evil.com` }),
    options(),
  );
  expect(response.status).toBe(403);
  expect((await errorBody(response)).code).toBe("invalid-origin");
});

test("POST without an Origin header is 403 invalid-origin", async () => {
  const response = await handlePatternRequest(
    postRequest(validBody(PROMPT), { origin: null }),
    options(),
  );
  expect(response.status).toBe(403);
  expect((await errorBody(response)).code).toBe("invalid-origin");
});

test("non-POST non-OPTIONS methods are 405 method-not-allowed", async () => {
  const response = await handlePatternRequest(
    new Request(PROXY_URL, { method: "GET", headers: { origin: ALLOWED_ORIGIN } }),
    options(),
  );
  expect(response.status).toBe(405);
  expect((await errorBody(response)).code).toBe("method-not-allowed");
});

test("a body of exactly 4096 bytes passes the size limit and reaches the key check", async () => {
  const response = await handlePatternRequest(
    postRequest(requestBodyOfSize(4096), { apiKey: null }),
    options(),
  );
  expect(response.status).toBe(401);
  expect((await errorBody(response)).code).toBe("missing-key");
});

test("a declared Content-Length above 4096 is rejected 413 before reading the body", async () => {
  const response = await handlePatternRequest(
    postRequest(requestBodyOfSize(4097), { contentLength: "4097" }),
    options(),
  );
  expect(response.status).toBe(413);
  expect((await errorBody(response)).code).toBe("payload-too-large");
});

test("a stalled body with a lying large Content-Length is still rejected via the header check", async () => {
  const response = await handlePatternRequest(
    postRequest(stalledStream(), { contentLength: "4097" }),
    options(),
  );
  expect(response.status).toBe(413);
  expect((await errorBody(response)).code).toBe("payload-too-large");
});

test("a lying small Content-Length with a streamed body over 4096 is caught while reading", async () => {
  const response = await handlePatternRequest(
    postRequest(countedStream(5000), { contentLength: "100" }),
    options(),
  );
  expect(response.status).toBe(413);
  expect((await errorBody(response)).code).toBe("payload-too-large");
});

test("a streamed body over 4096 with no Content-Length is caught while reading", async () => {
  const response = await handlePatternRequest(
    postRequest(countedStream(4097)),
    options(),
  );
  expect(response.status).toBe(413);
  expect((await errorBody(response)).code).toBe("payload-too-large");
});

test("a non-JSON content type is 415 unsupported-media-type", async () => {
  const response = await handlePatternRequest(
    postRequest(validBody(PROMPT), { contentType: "text/plain" }),
    options(),
  );
  expect(response.status).toBe(415);
  expect((await errorBody(response)).code).toBe("unsupported-media-type");
});

test("an application/json content type with parameters is accepted", async () => {
  const response = await handlePatternRequest(
    postRequest(validBody(PROMPT), { contentType: "application/json; charset=utf-8" }),
    options(),
  );
  expect(response.status).toBe(200);
});

test("invalid JSON is 400 invalid-prompt", async () => {
  const response = await handlePatternRequest(
    postRequest("{\"prompt\": "),
    options(),
  );
  expect(response.status).toBe(400);
  expect((await errorBody(response)).code).toBe("invalid-prompt");
});

test("a JSON body without a string prompt is 400 invalid-prompt", async () => {
  const response = await handlePatternRequest(
    postRequest(JSON.stringify({ prompt: 7 })),
    options(),
  );
  expect(response.status).toBe(400);
  expect((await errorBody(response)).code).toBe("invalid-prompt");
});

test("an empty prompt is 400 invalid-prompt", async () => {
  const response = await handlePatternRequest(
    postRequest(validBody("")),
    options(),
  );
  expect(response.status).toBe(400);
  expect((await errorBody(response)).code).toBe("invalid-prompt");
});

test("a prompt of 501 code points is 400 invalid-prompt", async () => {
  const response = await handlePatternRequest(
    postRequest(validBody("a".repeat(501))),
    options(),
  );
  expect(response.status).toBe(400);
  expect((await errorBody(response)).code).toBe("invalid-prompt");
});

test("a prompt of 251 astral pairs is 502 UTF-16 units but 251 code points and passes", async () => {
  const astral = "𝐀".repeat(251);
  expect(astral.length).toBe(502);
  expect([...astral].length).toBe(251);
  const response = await handlePatternRequest(
    postRequest(validBody(astral)),
    options(),
  );
  expect(response.status).toBe(200);
});

test("a prompt of exactly 500 code points passes", async () => {
  const response = await handlePatternRequest(
    postRequest(validBody("a".repeat(500))),
    options(),
  );
  expect(response.status).toBe(200);
});

test("a missing API key is 401 missing-key", async () => {
  const response = await handlePatternRequest(
    postRequest(validBody(PROMPT), { apiKey: null }),
    options(),
  );
  expect(response.status).toBe(401);
  expect((await errorBody(response)).code).toBe("missing-key");
});

test("an empty API key is 401 missing-key", async () => {
  const response = await handlePatternRequest(
    postRequest(validBody(PROMPT), { apiKey: "" }),
    options(),
  );
  expect(response.status).toBe(401);
  expect((await errorBody(response)).code).toBe("missing-key");
});

test("an upstream non-2xx response becomes a redacted 502 upstream-error", async () => {
  const upstream: typeof fetch = vi.fn(async () =>
    new Response(UPSTREAM_BODY_TEXT, { status: 503 }),
  ) as unknown as typeof fetch;
  const response = await handlePatternRequest(
    postRequest(validBody(PROMPT)),
    options({ upstreamFetch: upstream }),
  );
  const failure = await errorBody(response);
  expect(response.status).toBe(502);
  expect(failure.code).toBe("upstream-error");
  expect(failure.text).not.toContain(UPSTREAM_BODY_TEXT);
});

test("a never-settling upstream with a tiny timeout becomes 504 upstream-timeout", async () => {
  const upstream: typeof fetch = vi.fn(
    () => new Promise<Response>(() => {}),
  ) as unknown as typeof fetch;
  const response = await handlePatternRequest(
    postRequest(validBody(PROMPT)),
    options({ upstreamFetch: upstream, timeoutMs: 25 }),
  );
  expect(response.status).toBe(504);
  expect((await errorBody(response)).code).toBe("upstream-timeout");
});

test("a network-rejecting upstream becomes 502 upstream-error", async () => {
  const upstream: typeof fetch = vi.fn(async () => {
    throw new TypeError("fetch failed");
  }) as unknown as typeof fetch;
  const response = await handlePatternRequest(
    postRequest(validBody(PROMPT)),
    options({ upstreamFetch: upstream }),
  );
  expect(response.status).toBe(502);
  expect((await errorBody(response)).code).toBe("upstream-error");
});

test("an upstream response above maxResponseBytes becomes 502 upstream-too-large", async () => {
  const upstream: typeof fetch = vi.fn(async () =>
    new Response("a".repeat(4096), { status: 200 }),
  ) as unknown as typeof fetch;
  const response = await handlePatternRequest(
    postRequest(validBody(PROMPT)),
    options({ upstreamFetch: upstream, maxResponseBytes: 1024 }),
  );
  expect(response.status).toBe(502);
  expect((await errorBody(response)).code).toBe("upstream-too-large");
});

test("an inlineData with a non-PNG mimeType becomes 502 invalid-image", async () => {
  const upstream: typeof fetch = vi.fn(async () =>
    new Response(upstreamJson({ mimeType: "image/jpeg", data: PNG_1X1_BASE64 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  ) as unknown as typeof fetch;
  const response = await handlePatternRequest(
    postRequest(validBody(PROMPT)),
    options({ upstreamFetch: upstream }),
  );
  expect(response.status).toBe(502);
  expect((await errorBody(response)).code).toBe("invalid-image");
});

test("an upstream response with no inlineData becomes 502 invalid-image", async () => {
  const upstream: typeof fetch = vi.fn(async () =>
    new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "hi" }] } }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  ) as unknown as typeof fetch;
  const response = await handlePatternRequest(
    postRequest(validBody(PROMPT)),
    options({ upstreamFetch: upstream }),
  );
  expect(response.status).toBe(502);
  expect((await errorBody(response)).code).toBe("invalid-image");
});

test("inlineData whose decoded bytes are not a PNG signature becomes 502 invalid-image", async () => {
  const notPng = Buffer.from("definitely not a png at all").toString("base64");
  const upstream: typeof fetch = vi.fn(async () =>
    new Response(upstreamJson({ mimeType: "image/png", data: notPng }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  ) as unknown as typeof fetch;
  const response = await handlePatternRequest(
    postRequest(validBody(PROMPT)),
    options({ upstreamFetch: upstream }),
  );
  expect(response.status).toBe(502);
  expect((await errorBody(response)).code).toBe("invalid-image");
});

test("inlineData with a PNG signature but no IHDR chunk becomes 502 invalid-image", async () => {
  const bytes = new Uint8Array(pngBytes());
  bytes[12] = 0x58;
  bytes[13] = 0x58;
  bytes[14] = 0x58;
  bytes[15] = 0x58;
  const tampered = Buffer.from(bytes).toString("base64");
  const upstream: typeof fetch = vi.fn(async () =>
    new Response(upstreamJson({ mimeType: "image/png", data: tampered }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  ) as unknown as typeof fetch;
  const response = await handlePatternRequest(
    postRequest(validBody(PROMPT)),
    options({ upstreamFetch: upstream }),
  );
  expect(response.status).toBe(502);
  expect((await errorBody(response)).code).toBe("invalid-image");
});

test("the upstream call uses the default model URL, key header, and body shape", async () => {
  const upstreamFn = vi.fn(async () =>
    new Response(upstreamJson({ mimeType: "image/png", data: PNG_1X1_BASE64 }), { status: 200 }),
  );
  const upstream = upstreamFn as unknown as typeof fetch;
  const response = await handlePatternRequest(
    postRequest(validBody(PROMPT)),
    options({ upstreamFetch: upstream }),
  );
  expect(response.status).toBe(200);
  expect(upstreamFn).toHaveBeenCalledTimes(1);
  const [url, init] = upstreamFn.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe(
    `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_GEMINI_IMAGE_MODEL}:generateContent`,
  );
  expect(new Headers(init.headers).get("x-goog-api-key")).toBe(API_KEY);
  expect(new Headers(init.headers).get("content-type")).toBe("application/json");
  const sent = JSON.parse(String(init.body)) as {
    contents?: { parts?: { text?: string }[] }[];
    generationConfig?: {
      responseModalities?: string[];
      imageConfig?: { aspectRatio?: string };
    };
  };
  expect(sent.contents?.[0]?.parts?.[0]?.text).toBe(PROMPT);
  expect(sent.generationConfig?.responseModalities).toEqual(["TEXT", "IMAGE"]);
  expect(sent.generationConfig?.imageConfig?.aspectRatio).toBe("1:1");
});

test("a custom model appears in the upstream URL", async () => {
  const upstreamFn = vi.fn(async () =>
    new Response(upstreamJson({ mimeType: "image/png", data: PNG_1X1_BASE64 }), { status: 200 }),
  );
  const upstream = upstreamFn as unknown as typeof fetch;
  const response = await handlePatternRequest(
    postRequest(validBody(PROMPT)),
    options({ upstreamFetch: upstream, model: "gemini-3-pro-image-preview" }),
  );
  expect(response.status).toBe(200);
  const [url] = upstreamFn.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent",
  );
});

test("every error response is redacted: no prompt, key, origin, or upstream body text", async () => {
  const cases: { name: string; request: Request; options: PatternProxyOptions }[] = [
    {
      name: "invalid-origin",
      request: postRequest(validBody(PROMPT), { origin: "https://evil.com" }),
      options: options(),
    },
    {
      name: "method-not-allowed",
      request: new Request(PROXY_URL, { method: "GET", headers: { origin: ALLOWED_ORIGIN } }),
      options: options(),
    },
    {
      name: "payload-too-large",
      request: postRequest(requestBodyOfSize(4097), { contentLength: "4097" }),
      options: options(),
    },
    {
      name: "unsupported-media-type",
      request: postRequest(validBody(PROMPT), { contentType: "text/plain" }),
      options: options(),
    },
    {
      name: "invalid-prompt",
      request: postRequest(validBody("a".repeat(501))),
      options: options(),
    },
    {
      name: "missing-key",
      request: postRequest(validBody(PROMPT), { apiKey: null }),
      options: options(),
    },
    {
      name: "upstream-error",
      request: postRequest(validBody(PROMPT)),
      options: {
        allowedOrigins: [ALLOWED_ORIGIN],
        upstreamFetch: vi.fn(async () =>
          new Response(UPSTREAM_BODY_TEXT, { status: 500 }),
        ) as unknown as typeof fetch,
      },
    },
    {
      name: "upstream-timeout",
      request: postRequest(validBody(PROMPT)),
      options: {
        allowedOrigins: [ALLOWED_ORIGIN],
        upstreamFetch: vi.fn(() => new Promise<Response>(() => {})) as unknown as typeof fetch,
        timeoutMs: 25,
      },
    },
    {
      name: "upstream-too-large",
      request: postRequest(validBody(PROMPT)),
      options: {
        allowedOrigins: [ALLOWED_ORIGIN],
        upstreamFetch: vi.fn(async () => new Response("a".repeat(8192), { status: 200 })) as unknown as typeof fetch,
        maxResponseBytes: 512,
      },
    },
    {
      name: "invalid-image",
      request: postRequest(validBody(PROMPT)),
      options: {
        allowedOrigins: [ALLOWED_ORIGIN],
        upstreamFetch: vi.fn(async () =>
          new Response(upstreamJson({ mimeType: "image/gif", data: PNG_1X1_BASE64 }), { status: 200 }),
        ) as unknown as typeof fetch,
      },
    },
  ];
  for (const testCase of cases) {
    const response = await handlePatternRequest(testCase.request, testCase.options);
    const text = await response.text();
    expect(text).not.toContain(PROMPT);
    expect(text).not.toContain(API_KEY);
    expect(text).not.toContain(UPSTREAM_BODY_TEXT);
    expect(text).not.toContain(ALLOWED_ORIGIN);
    expect(text).not.toContain("https://app.example.com");
  }
});

function malformedPngBase64(lengthField: number, width: number, height: number): string {
  const bytes: number[] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  bytes.push((lengthField >>> 24) & 0xff, (lengthField >>> 16) & 0xff, (lengthField >>> 8) & 0xff, lengthField & 0xff);
  bytes.push(0x49, 0x48, 0x44, 0x52);
  bytes.push((width >>> 24) & 0xff, (width >>> 16) & 0xff, (width >>> 8) & 0xff, width & 0xff);
  bytes.push((height >>> 24) & 0xff, (height >>> 16) & 0xff, (height >>> 8) & 0xff, height & 0xff);
  bytes.push(8, 0, 0, 0, 0);
  return btoa(String.fromCharCode(...bytes));
}

test("a POST to a path other than /api/patterns is rejected 404 without an upstream call", async () => {
  const upstreamFetch = vi.fn();
  const response = await handlePatternRequest(
    postRequest(validBody(PROMPT), { url: "https://proxy.example.test/other" }),
    options({ upstreamFetch: upstreamFetch as unknown as typeof fetch }),
  );
  expect(response.status).toBe(404);
  const error = await errorBody(response);
  expect(error.code).toBe("not-found");
  expect(error.text).not.toContain(PROMPT);
  expect(error.text).not.toContain(API_KEY);
  expect(upstreamFetch).not.toHaveBeenCalled();
});

test("a POST whose path ends with /api/patterns behind a prefix is accepted", async () => {
  const response = await handlePatternRequest(
    postRequest(validBody(PROMPT), { url: "https://proxy.example.test/prefix/api/patterns" }),
    options(),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("access-control-allow-origin")).toBe(ALLOWED_ORIGIN);
});

test("an upstream PNG with a zero width is rejected as invalid-image", async () => {
  const fetchImpl = vi.fn(async () =>
    new Response(
      upstreamJson({ mimeType: "image/png", data: malformedPngBase64(13, 0, 1) }),
      { status: 200, headers: { "content-type": "application/json" } },
    ),
  ) as unknown as typeof fetch;
  const response = await handlePatternRequest(postRequest(validBody(PROMPT)), options({ upstreamFetch: fetchImpl }));
  expect(response.status).toBe(502);
  const error = await errorBody(response);
  expect(error.code).toBe("invalid-image");
});

test("an upstream PNG with a non-13-byte IHDR length is rejected as invalid-image", async () => {
  const fetchImpl = vi.fn(async () =>
    new Response(
      upstreamJson({ mimeType: "image/png", data: malformedPngBase64(12, 1, 1) }),
      { status: 200, headers: { "content-type": "application/json" } },
    ),
  ) as unknown as typeof fetch;
  const response = await handlePatternRequest(postRequest(validBody(PROMPT)), options({ upstreamFetch: fetchImpl }));
  expect(response.status).toBe(502);
  const error = await errorBody(response);
  expect(error.code).toBe("invalid-image");
});
