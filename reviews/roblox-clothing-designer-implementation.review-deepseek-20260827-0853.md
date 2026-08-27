# Review: roblox-clothing-designer-implementation.review-deepseek-20260827-0853.md

| field | value |
|---|---|
| reviewer | `deepseek` |
| backend | `opencode` |
| model | `deepseek/deepseek-v4-pro` |
| workdir | `/home/v/Documents/Dev/rbx-fashion/.worktrees/implementation` |
| write access | none (read-only, enforced) |
| started | 2026-08-27T08:53:52+02:00 |
| finished | 2026-08-27T09:05:29+02:00 |
| exit code | 0 |

---

VERDICT: APPROVE WITH CHANGES

Findings:

- MINOR — proxy/README.md:64 — Redaction guarantee states "Responses never echo … the caller origin", but `handlePatternRequest`/`errorResponse` set `access-control-allow-origin: origin` (proxy/handler.ts:63, 183, 316). The response *body* is correctly redacted; only the CORS header echoes the (already-allowlisted) origin, which is required for CORS to work. Fix: reword to "the response body never echoes the prompt, key, origin, or upstream details; CORS headers echo only the previously allowlisted origin."

- MINOR — proxy/handler.ts:170-320 — `handlePatternRequest` performs no URL-path check; it accepts POST on any path, whereas the documented contract is `POST /api/patterns`. Single-purpose proxy (path can't influence the fixed upstream URL), so no injection surface, but defense-in-depth is absent. Fix: reject any `request.url` path other than `/api/patterns` (or constrain routing in server.mjs).

- MINOR — proxy/handler.ts:128-144 — `hasPngSignature` checks the PNG signature and IHDR magic bytes only; it does not validate IHDR chunk length (13) or dimensions, unlike `ihdrDimensions` in src/project/archive.ts:92-104. The client re-validates on receipt (src/ai/pattern-client.ts), so impact is limited, but the proxy can forward a structurally-bad PNG that passes its own gate. Fix: mirror archive.ts's IHDR length+dimension check.

- MINOR — scripts/check-release.mjs — the gate is trivially satisfiable by fabricated files, so it does not couple evidence to runtime data: checkCaptures (:75-89) accepts any non-empty file with a bare 8-byte PNG signature (a 1×1 PNG passes; no 585×559/512×512 dimension or content check); checkChecklist (:91-129) requires only the literal substring `RESULT: PASS`; checkMeasurements (:26-73) validates JSON shape but never cross-checks recorded values against the hardcoded `inferred` rig in src/preview/measurements.ts; checkRegistry (:131-143) requires only removing `calibrationVersion: null`. The gate fails-by-default (honest intent, evidence dir is gitignored), but a fabricated `calibration/evidence/` would flip it. Acceptable as a trust-the-human calibration, worth noting.

- MINOR — src/editor/ui/designer-app.tsx:100-104 — `AssetStore` is created once and never cleared across new/open projects, so decoded `ImageBitmap`s accumulate for the tab's lifetime. No correctness issue (asset IDs are UUIDs; the compositor only dereferences `document` assetIds), but unbounded memory growth over long sessions with many large imports. Fix: clear the store on new-project/open.

Assumptions and gaps:

- No shell available; all runtime behavior (typecheck, lint, 192 unit / 138 browser tests, build, check:bundle, test:pwa offline, 3-engine e2e) is taken from the provided green baseline as true rather than re-executed.
- Preview UV winding and face-index assignment (src/preview/rig.ts `assignFaceQuad`) were verified only statically (UV formula `(x/585, 1-y/559)` matches spec); correctness rests on the browser smoke screenshots (`straight-on-views-show-each-bound-face-panel-with-outward-winding`), which I did not visually inspect.
- Registry panel rects/affines/seams were compared against docs/roblox-technical-preflight.md, treated as ground truth.
- Gemini model id `gemini-2.5-flash-image` accepted as verified per README (2026-08-27); not independently re-verified against Google docs.
- `.github/workflows/ci.yml` intentionally omits `check:release` (fails-by-design until calibration); `deploy-pages.yml` builds with `VITE_PATTERN_PROXY_URL` from repo vars, and Generate correctly stays hidden if unset.
- CSS (44 px touch targets, visual layout) was not reviewed; sizing is asserted via axe-core browser tests rather than line-by-line.

The core is solid across all six scrutiny priorities: proxy security (origin allowlist, 4 KiB body, 60 s timeout, 10 MiB cap, full redaction), ZIP attack surface (zip-slip, duplicate/entry/bomb/megapixel/bijection defenses all unit-tested), child-data safety (key in-memory only, zero storage/logging matches in src/), compositor+registry fidelity (exact match to preflight), editor state machine (correct gesture/undo/redo/dirty semantics), and PWA/offline+budgets (precache-only SW, honest budget math).
