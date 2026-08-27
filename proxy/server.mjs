import http from "node:http";
import { pathToFileURL } from "node:url";
import { handlePatternRequest } from "./handler.ts";

const ADAPTER_MAX_BODY_BYTES = 65536;

function writeJsonError(res, status, code, message) {
  const body = JSON.stringify({ error: { code, message } });
  res.writeHead(status, { "content-type": "application/json", "content-length": String(Buffer.byteLength(body)) });
  res.end(body);
}

async function readRequestBody(req) {
  const chunks = [];
  let total = 0;
  let oversized = false;
  await new Promise((resolve, reject) => {
    req.on("data", (chunk) => {
      if (oversized) {
        return;
      }
      total += chunk.length;
      if (total > ADAPTER_MAX_BODY_BYTES) {
        oversized = true;
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", resolve);
    req.on("error", reject);
  });
  return { oversized, body: Buffer.concat(chunks) };
}

async function respondWithWebResponse(res, response) {
  const body = Buffer.from(await response.arrayBuffer());
  const headers = Object.fromEntries(response.headers);
  res.writeHead(response.status, headers);
  res.end(body);
}

async function handle(req, res, options) {
  const { oversized, body } = await readRequestBody(req);
  if (oversized) {
    writeJsonError(res, 413, "payload-too-large", "The request body is too large.");
    return;
  }
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const headers = new Headers(req.headers);
  if (hasBody) {
    headers.set("content-length", String(body.length));
  }
  const request = new Request(new URL(req.url, "http://localhost"), {
    method: req.method,
    headers,
    body: hasBody ? body : undefined,
    redirect: "manual",
  });
  const response = await handlePatternRequest(request, {
    allowedOrigins: options.allowedOrigins,
    model: options.model,
    upstreamFetch: options.upstreamFetch,
    timeoutMs: options.timeoutMs,
    maxResponseBytes: options.maxResponseBytes,
  });
  await respondWithWebResponse(res, response);
}

export function createPatternServer(options) {
  const server = http.createServer((req, res) => {
    handle(req, res, options).catch(() => {
      if (!res.headersSent) {
        writeJsonError(res, 502, "upstream-error", "The pattern service could not complete the request.");
        return;
      }
      res.destroy();
    });
  });
  server.listen(options.port ?? 0, options.host ?? "127.0.0.1");
  return server;
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const rawOrigins = process.env.PATTERN_ALLOWED_ORIGINS ?? "";
  const allowedOrigins = rawOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  if (allowedOrigins.length === 0) {
    console.error("PATTERN_ALLOWED_ORIGINS is required: a comma-separated list of exact allowed origins");
    process.exit(1);
  }
  createPatternServer({
    allowedOrigins,
    model: process.env.GEMINI_IMAGE_MODEL || undefined,
    port: Number(process.env.PORT ?? 8787) || 8787,
    host: process.env.HOST ?? "127.0.0.1",
    upstreamFetch: undefined,
  });
}
