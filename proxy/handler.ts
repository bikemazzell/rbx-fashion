export interface PatternProxyOptions {
  allowedOrigins: readonly string[];
  model?: string;
  upstreamFetch?: typeof fetch;
  timeoutMs?: number;
  maxResponseBytes?: number;
}

export const DEFAULT_GEMINI_IMAGE_MODEL = "gemini-2.5-flash-image";

const MAX_REQUEST_BODY_BYTES = 4096;
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_RESPONSE_BYTES = 10_485_760;
const UPSTREAM_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const MIN_PROMPT_CODE_POINTS = 1;
const MAX_PROMPT_CODE_POINTS = 500;

type PatternErrorCode =
  | "invalid-origin"
  | "method-not-allowed"
  | "not-found"
  | "payload-too-large"
  | "unsupported-media-type"
  | "invalid-prompt"
  | "missing-key"
  | "upstream-error"
  | "upstream-timeout"
  | "upstream-too-large"
  | "invalid-image";

const ERROR_MESSAGES: Record<PatternErrorCode, string> = {
  "invalid-origin": "This origin is not allowed to use the pattern service.",
  "method-not-allowed": "Only POST and OPTIONS requests are supported.",
  "not-found": "This pattern service route was not found.",
  "payload-too-large": "The request body is too large.",
  "unsupported-media-type": "The request content type must be application/json.",
  "invalid-prompt": "The prompt must be 1 to 500 Unicode code points.",
  "missing-key": "A pattern service key is required.",
  "upstream-error": "The pattern service could not complete the request.",
  "upstream-timeout": "The pattern service took too long to respond.",
  "upstream-too-large": "The pattern service response was too large.",
  "invalid-image": "The pattern service did not return a usable image.",
};

class BodyTooLargeError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAllowedOrigin(origin: string, options: PatternProxyOptions): boolean {
  return options.allowedOrigins.some((allowed) => allowed === origin);
}

function errorResponse(
  status: number,
  code: PatternErrorCode,
  origin: string | null,
): Response {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    vary: "Origin",
  };
  if (origin !== null) {
    headers["access-control-allow-origin"] = origin;
  }
  const body = JSON.stringify({ error: { code, message: ERROR_MESSAGES[code] } });
  return new Response(body, { status, headers });
}

async function readBodyWithLimit(
  source: { body: ReadableStream<Uint8Array> | null },
  limit: number,
): Promise<string> {
  if (source.body === null) {
    return "";
  }
  const reader = source.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (value === undefined) {
      continue;
    }
    total += value.byteLength;
    if (total > limit) {
      void reader.cancel().catch(() => {});
      throw new BodyTooLargeError();
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

function raceAbort(promise: Promise<Response>, signal: AbortSignal): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    const onAbort = () => reject(new DOMException("Aborted", "AbortError"));
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject);
  });
}

function base64ToBytes(encoded: string): Uint8Array<ArrayBuffer> | null {
  try {
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}

function hasPngSignature(bytes: Uint8Array): boolean {
  if (bytes.length < 24) {
    return false;
  }
  if (
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47 ||
    bytes[4] !== 0x0d ||
    bytes[5] !== 0x0a ||
    bytes[6] !== 0x1a ||
    bytes[7] !== 0x0a
  ) {
    return false;
  }
  const ihdrLength = (bytes[8]! << 24) | (bytes[9]! << 16) | (bytes[10]! << 8) | bytes[11]!;
  if (ihdrLength !== 13) {
    return false;
  }
  if (bytes[12] !== 0x49 || bytes[13] !== 0x48 || bytes[14] !== 0x44 || bytes[15] !== 0x52) {
    return false;
  }
  const width = (bytes[16]! << 24) | (bytes[17]! << 16) | (bytes[18]! << 8) | bytes[19]!;
  const height = (bytes[20]! << 24) | (bytes[21]! << 16) | (bytes[22]! << 8) | bytes[23]!;
  return width >= 1 && height >= 1;
}

function findPngInlineData(data: unknown): string | null {
  if (!isRecord(data) || !Array.isArray(data.candidates)) {
    return null;
  }
  for (const candidate of data.candidates) {
    if (!isRecord(candidate) || !isRecord(candidate.content)) {
      continue;
    }
    if (!Array.isArray(candidate.content.parts)) {
      continue;
    }
    for (const part of candidate.content.parts) {
      if (!isRecord(part) || !isRecord(part.inlineData)) {
        continue;
      }
      const inline = part.inlineData;
      if (inline.mimeType === "image/png" && typeof inline.data === "string") {
        return inline.data;
      }
    }
  }
  return null;
}

export async function handlePatternRequest(
  request: Request,
  options: PatternProxyOptions,
): Promise<Response> {
  const origin = request.headers.get("origin");

  if (request.method === "OPTIONS") {
    if (origin === null || !isAllowedOrigin(origin, options)) {
      return errorResponse(403, "invalid-origin", null);
    }
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": origin,
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "Content-Type, X-Gemini-Api-Key",
        "access-control-max-age": "86400",
        vary: "Origin",
      },
    });
  }

  if (request.method !== "POST") {
    return errorResponse(405, "method-not-allowed", null);
  }

  if (origin === null || !isAllowedOrigin(origin, options)) {
    return errorResponse(403, "invalid-origin", null);
  }
  const allowedOrigin = origin;

  const pathname = new URL(request.url).pathname;
  if (pathname !== "/api/patterns" && !pathname.endsWith("/api/patterns")) {
    return errorResponse(404, "not-found", allowedOrigin);
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BODY_BYTES) {
    return errorResponse(413, "payload-too-large", allowedOrigin);
  }

  const contentType = request.headers.get("content-type");
  const mimeType = contentType?.split(";")[0]?.trim().toLowerCase();
  if (mimeType !== "application/json") {
    return errorResponse(415, "unsupported-media-type", allowedOrigin);
  }

  let bodyText: string;
  try {
    bodyText = await readBodyWithLimit(request, MAX_REQUEST_BODY_BYTES);
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      return errorResponse(413, "payload-too-large", allowedOrigin);
    }
    return errorResponse(400, "invalid-prompt", allowedOrigin);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return errorResponse(400, "invalid-prompt", allowedOrigin);
  }
  if (!isRecord(parsed) || typeof parsed.prompt !== "string") {
    return errorResponse(400, "invalid-prompt", allowedOrigin);
  }
  const prompt = parsed.prompt;
  const codePoints = [...prompt].length;
  if (codePoints < MIN_PROMPT_CODE_POINTS || codePoints > MAX_PROMPT_CODE_POINTS) {
    return errorResponse(400, "invalid-prompt", allowedOrigin);
  }

  const apiKey = request.headers.get("x-gemini-api-key");
  if (apiKey === null || apiKey.length === 0) {
    return errorResponse(401, "missing-key", allowedOrigin);
  }

  const model = options.model ?? DEFAULT_GEMINI_IMAGE_MODEL;
  const timeoutSignal = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const doFetch = options.upstreamFetch ?? fetch;
  const upstreamUrl = `${UPSTREAM_BASE_URL}/${model}:generateContent`;
  const upstreamBody = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: { aspectRatio: "1:1" },
    },
  });

  let upstream: Response;
  try {
    upstream = await raceAbort(
      doFetch(upstreamUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: upstreamBody,
        signal: timeoutSignal,
      }),
      timeoutSignal,
    );
  } catch {
    if (timeoutSignal.aborted) {
      return errorResponse(504, "upstream-timeout", allowedOrigin);
    }
    return errorResponse(502, "upstream-error", allowedOrigin);
  }

  if (!upstream.ok) {
    const body = upstream.body;
    if (body !== null) {
      void body.cancel().catch(() => {});
    }
    return errorResponse(502, "upstream-error", allowedOrigin);
  }

  let upstreamText: string;
  try {
    upstreamText = await readBodyWithLimit(
      upstream,
      options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
    );
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      return errorResponse(502, "upstream-too-large", allowedOrigin);
    }
    return errorResponse(502, "upstream-error", allowedOrigin);
  }

  let upstreamData: unknown;
  try {
    upstreamData = JSON.parse(upstreamText);
  } catch {
    return errorResponse(502, "invalid-image", allowedOrigin);
  }

  const encoded = findPngInlineData(upstreamData);
  if (encoded === null) {
    return errorResponse(502, "invalid-image", allowedOrigin);
  }
  const bytes = base64ToBytes(encoded);
  if (bytes === null || !hasPngSignature(bytes)) {
    return errorResponse(502, "invalid-image", allowedOrigin);
  }

  return new Response(bytes, {
    status: 200,
    headers: {
      "content-type": "image/png",
      "access-control-allow-origin": allowedOrigin,
      vary: "Origin",
    },
  });
}
