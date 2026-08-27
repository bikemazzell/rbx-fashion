# Pattern proxy (optional)

A tiny, dependency-free Gemini image proxy for the optional AI pattern feature.
The app is fully functional without it: when `VITE_PATTERN_PROXY_URL` is not
configured at build time, every Generate affordance stays hidden.

- `handler.ts` is portable web-standard code: `(Request, options) => Promise<Response>`.
  It runs unchanged on any runtime with `fetch`, `Request`, `Response`, `atob`,
  and `AbortSignal.timeout` (Cloudflare Workers, Deno, Bun, Node 22+).
- `server.mjs` is the Node 22 adapter (`node:http`), suitable for a small VPS or
  any Node host. It is the only file with Node-specific imports.

## Running (Node)

```
PATTERN_ALLOWED_ORIGINS="https://your-app.example.com" node proxy/server.mjs
```

Node >= 22.18 loads `handler.ts` via built-in type stripping; on older Node 22
minors run `node --experimental-strip-types proxy/server.mjs`.

| Variable | Required | Default | Meaning |
| --- | --- | --- | --- |
| `PATTERN_ALLOWED_ORIGINS` | yes | – | Comma-separated exact origins allowed to call the proxy (e.g. `https://app.example.com`). Empty/missing aborts startup with exit code 1. |
| `GEMINI_IMAGE_MODEL` | no | `gemini-2.5-flash-image` | Upstream model id used in the Gemini `generateContent` URL. |
| `PORT` | no | `8787` | Listen port. |
| `HOST` | no | `127.0.0.1` | Listen host. Use `0.0.0.0` behind a reverse proxy, and terminate TLS in front. |

Client side: build the app with `VITE_PATTERN_PROXY_URL` pointing at the proxy's
public origin. A Gemini API key is never embedded in the site artifact; the
parent enters it at runtime and it lives in memory only.

## Request contract

```
POST /api/patterns
Content-Type: application/json
X-Gemini-Api-Key: <parent-supplied key>
Origin: <must exactly match one allowed origin>

{"prompt":"1-500 Unicode code points"}
```

Success: `200` with `Content-Type: image/png` and the decoded PNG bytes.
Preflight `OPTIONS` from an allowed origin gets `204` with
`Access-Control-Allow-Origin/Methods/Headers/Max-Age` and `Vary: Origin`.

## Limits

- CORS: exact string match against the allowlist — no suffix, substring, or
  wildcard matching. Disallowed or missing `Origin` gets `403` and no ACAO.
- Route: only `POST` requests whose path is `/api/patterns` (an exact match or
  a `/api/patterns` suffix behind a mount prefix) are served; anything else
  gets `404 not-found` after the origin check.
- Request body: 4 KiB hard cap (declared `Content-Length` and streamed bytes
  are both enforced); the Node adapter additionally caps reads at 64 KiB.
- Prompt: 1–500 Unicode code points (`[...prompt].length`), JSON only.
- Upstream timeout: 60 s (`timeoutMs` option).
- Upstream response: 10 MiB cap, stream-enforced (`maxResponseBytes` option).
- Upstream image must be `image/png` `inlineData` passing PNG signature +
  `IHDR` validation (13-byte IHDR chunk with width/height ≥ 1), otherwise the
  client sees `invalid-image`.

## Redaction guarantee

Every failure returns a normalized JSON body
`{"error":{"code":"<category>","message":"<fixed message>"}` with fixed
messages. Response bodies never echo the prompt, the API key, the caller
origin, the upstream status text, or the upstream body. One deliberate
exception outside the body: the `Access-Control-Allow-Origin` response header
echoes the caller's origin, but only after that exact origin matched the
allowlist — it never reflects an unknown origin. The proxy keeps no state
beyond a single in-flight request, writes nothing to disk, and logs nothing
(request contents are never logged; the only stderr output is the startup
error when `PATTERN_ALLOWED_ORIGINS` is missing).

Error categories: `invalid-origin`, `method-not-allowed`, `not-found`,
`payload-too-large`, `unsupported-media-type`, `invalid-prompt`, `missing-key`,
`upstream-error`, `upstream-timeout`, `upstream-too-large`, `invalid-image`.

## Model configurability — verify before deploy

The upstream image model changes over time. The id here was verified against
Google's documentation on **2026-08-27**: GA image model
`gemini-2.5-flash-image` (Nano Banana), preview tier `gemini-3-pro-image-preview`,
REST endpoint
`POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
with header `x-goog-api-key`.

Before any real deployment: re-check the current model id, endpoint, pricing,
and quota on the Gemini API docs, then set `GEMINI_IMAGE_MODEL` accordingly and
run one supervised end-to-end generation. Never point tests at the real
upstream — inject `upstreamFetch` fakes (see `tests/unit/pattern-proxy*.test.ts`).
