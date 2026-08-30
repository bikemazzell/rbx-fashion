# Roblox Clothing Designer

Lean, mobile-first editor for designing Roblox classic clothing (shirt/pants templates) for children aged 8-10, with a template compositor, lazy-loaded R6 3D preview, and parent-gated AI pattern generation. Built with Preact + Vite + TypeScript; the app never persists project content or keys to browser storage.

## Editor controls

- Start with T-Shirt for a front-only picture, Shirt for body-and-arm wrapping, or Pants for waist-and-leg wrapping. Open Saved Project reopens a local `.rbxcloth.zip` without starting a new garment.
- In Edit, drag a selected picture to move it, use its cyan handle to resize, its white handle to rotate, or use the mouse wheel/trackpad over the picture to resize it.
- To make part of the clothing see-through, choose **Add → Cut Out**, then drag a rectangle. Move it, resize it with the cyan handle, rotate it with the white handle, or fine-tune it in More. The checkerboard marks transparent pixels.
- In Preview, drag to rotate the avatar and pinch or use the mouse wheel/trackpad to zoom. Reset restores the default view.
- Save downloads an editable `.rbxcloth.zip`; Export downloads the Roblox-sized PNG. The app stores neither file nor API key after the browser session ends.

## Development

Prerequisites: Node >= 22, then a one-time `npx playwright install chromium firefox webkit` for the browser-based suites.

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite dev server (serves the app under `/rbx-fashion/`). |
| `npm run build` | Production build to `dist/` (sourcemaps off, 3D preview as a lazy chunk) plus service-worker generation. |
| `npm run preview` | Serve the production build locally. |
| `npm run typecheck` | `tsc --noEmit` over all TS (TypeScript 7 native compiler). |
| `npm run lint` | ESLint with typescript-eslint. |
| `npm run test:unit` | Vitest node-environment unit tests. |
| `npm run test:browser` | Vitest browser-mode tests (Chromium full, Firefox/WebKit smoke). |
| `npm run test:pwa` | Playwright PWA/offline suite (starts `vite preview` itself; no extra service needed). |
| `npm run test:e2e` | Playwright end-to-end journeys (boots `npm run dev` at `/rbx-fashion/`). |
| `npm run check:bundle` | Verify gzip/raw size budgets of the built `dist/` artifact. |
| `npm run check:release` | R6 calibration evidence gate — run after `build` + `check:bundle` (see Release gates). |
| `npm run calibration:fixtures` | Regenerate the committed calibration fixture PNGs. |

`.github/workflows/ci.yml` runs these same verification steps (typecheck, lint, unit, browser, build, bundle budgets, PWA, e2e) as one `verify` job on every push and pull request.

## GitHub Pages deployment

The app is built for repository-subpath hosting: the Vite `base`, manifest URLs, and service-worker registration all assume the `/rbx-fashion/` path (see `vite.config.ts`). `.github/workflows/deploy-pages.yml` publishes `dist/` as the static GitHub Pages artifact only after the `CI` workflow succeeds on `main` (it triggers on `workflow_run` for completed CI runs); it never runs on pull requests and a failing CI blocks publication. A manual `workflow_dispatch` run is the single override, and it runs the full verification suite (typecheck, lint, unit, browser, build, bundle budgets, PWA, e2e) inline before publishing, so no unverified artifact can be deployed by either path. The R6 calibration gate (`npm run check:release`) is deliberately not part of deployment: it is a human release gate for calibrated releases, not a blocker for publishing the app artifact (see Release gates). First-time setup: set Settings → Pages → Source to **GitHub Actions** once; the workflow handles deploys after that.

The optional pattern proxy URL is a repository **variable** `PATTERN_PROXY_URL` (Settings → Secrets and variables → Actions → Variables). When set, it is passed to the build as `VITE_PATTERN_PROXY_URL` and enables the parent-gated Generate feature; when unset it is empty and every Generate affordance stays hidden. It is public information embedded in the client bundle by design. The site artifact contains no secret: the Gemini API key is parent-entered per session in the browser and lives in memory only.

## Pattern proxy

The AI pattern generator requires an operator-supplied proxy runtime, deployed separately from this static site. See `proxy/README.md` for the exact-origin CORS allowlist (`PATTERN_ALLOWED_ORIGINS`), the upstream model configuration (`GEMINI_IMAGE_MODEL`), and the requirement to verify the current Gemini image model before any real deployment.

## Release gates

`npm run check:release` verifies the three generated alpha fixtures and the R6 calibration evidence: `calibration/evidence/measurements.json` with the required fields, all 36 capture PNGs (3 garments × 2 sources × 6 views, each with IHDR dimensions matching the template — 585×559 for shirt/pants, 512×512 for the T-shirt), the completed checklist at `calibration/evidence/r6-checklist-completed.md`, and a registry `calibrationVersion` recorded from a passing calibration. Producing that evidence requires manual Roblox Studio work per the procedure in `calibration/README.md`, so `check:release` fails until that evidence exists — by design — and CI deliberately excludes it.

Also manual external gates before a real release, outside CI: physical iOS Safari and Android Chrome editing/export smoke tests, and one Roblox Studio/Creator Dashboard upload test per garment.

## Toolchain note

`typescript` 7 is the native (Go) compiler without a stable JS API; per the official TypeScript 7 migration guide it is installed as `@typescript/native` (npm alias of `typescript@7.0.2`) so `npx tsc` uses TS 7, while `typescript` aliases `@typescript/typescript6` to provide the TS 6 API that `typescript-eslint` requires.
