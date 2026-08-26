# Roblox Classic Clothing Designer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task by task. Use test-driven development and commit after each milestone.

**Goal:** Deliver a child-friendly mobile editor that turns imported or AI-generated images into valid Roblox classic-clothing PNGs without exposing atlas complexity.

**Architecture:** A Preact shell owns a small reducer and in-memory asset store. Native Canvas 2D produces the canonical Roblox map; a lazy Three.js R6 preview consumes the same canvas. Projects are normalized local ZIPs, and AI is an optional parent-configured proxy feature.

**Tech stack:** Node 22, npm, TypeScript, Vite, Preact, Canvas 2D, Three.js, fflate, Vitest, Playwright, and axe-core.

Pin runtime dependencies Preact `10.29.8`, Three.js `0.185.1`, and fflate `0.8.3`. Pin development dependencies Vite `8.2.2`, TypeScript `7.0.2`, `@types/node` `26.3.0`, `@preact/preset-vite` `2.10.6`, Vitest `4.1.11`, Playwright `1.62.1`, axe-core `4.13.0`, ESLint `10.9.1`, and typescript-eslint `8.68.0` in `package-lock.json`.

The normative product specification is [Roblox Classic Clothing Designer Specification](./roblox-clothing-designer-design.md). The [technical preflight](./roblox-technical-preflight.md) is normative only for official output formats, atlas geometry, transform semantics, and MVP R6 calibration.

## Fixed MVP Decisions

- Audience: children aged 8–10, with optional parent setup for AI.
- Garments: classic T-shirt, Shirt, and Pants.
- Child-facing modes: Sticker, Repeat, and Fill Clothing.
- Controls: move, uniform scale, rotate, crop, opacity, and optional independent X/Y scale under More.
- Maximum eight items/layers and 50 in-memory undo states.
- Internal automatic panel mapping; no panel selection or overrides.
- One fixed calibrated R6 block-avatar preview with orbit, pinch zoom, and Reset.
- Imported PNG/JPEG/WebP assets normalize to PNG before entering project state.
- Exact-size PNG export and local `.rbxcloth.zip` save/open.
- Offline operation after first load except Generate.
- Experimental Gemini generation is hidden unless a parent configures it.

## File Structure and Interfaces

Principal modules:

- `src/domain`: project types, reducer, history, validation, and template registry.
- `src/assets`: bounded image decode, PNG normalization, hashing, and in-memory asset store.
- `src/compositor`: crop/transform math, automatic panel mapping, and canonical rendering.
- `src/editor`: 2D viewport, pointer controller, Items sheet, and More controls.
- `src/project`: transactional ZIP save/open and Roblox PNG export.
- `src/preview`: lazy R6 Three.js preview and calibration data.
- `src/ai`: parent settings and optional pattern client.
- `src/pwa`: service-worker registration and offline shell.
- `proxy`: portable Gemini `Request -> Response` handler and Node 22 adapter.
- `calibration`: R6 Studio measurements, generated fixtures, captures, and checklist.
- `tests/unit`, `tests/browser`, and `tests/e2e`: behavior and journey tests.

Public module contracts:

```ts
getTemplate(type: GarmentType): TemplateRegistryEntry;
createProject(type: GarmentType, name?: string): ProjectDocumentV1;
projectReducer(state: HistoryState, action: ProjectAction): HistoryState;

normalizeAsset(file: Blob): Promise<NormalizedPngAsset>;
composeProject(input: ComposeInput): ComposeResult;

openProjectZip(zip: Blob): Promise<OpenedProject>;
saveProjectZip(document: ProjectDocumentV1, assets: AssetStore): Promise<Blob>;
exportRobloxPng(document: ProjectDocumentV1, assets: AssetStore): Promise<ExportResult>;

handlePatternRequest(request: Request, config: PatternProxyConfig): Promise<Response>;
```

The application never persists project content, prompts, generated images, or keys in localStorage, sessionStorage, IndexedDB, cookies, or runtime caches.

## Milestone 1: Foundation, Templates, and Export Core

**Create:** root Vite/TypeScript/test configuration, `src/domain`, `src/compositor`, and the initial application shell.

- [ ] Scaffold Vite + Preact with strict TypeScript, production source maps disabled, and the 3D module behind a dynamic import.
- [ ] Pin Preact, Three.js, fflate, Vite, TypeScript, Vitest, Playwright, ESLint, and axe-core in `package-lock.json`.
- [ ] Define `ProjectDocumentV1`, `Layer`, `Transform`, the normalized PNG asset manifest, template types, and minimal in-memory test asset fixtures before the compositor consumes them.
- [ ] Encode the T-shirt target plus the exact 18 atlas panels—six torso, six right-limb, and six left-limb panels—affines, and 15 continuous seam pairs expanded into 30 reciprocal records.
- [ ] Add registry tests for exact dimensions, bounds, non-overlap, unique IDs, all 30 reciprocal seam records, and invertible transforms.
- [ ] Implement source crop conversion, center-pivot transforms, canonical canvas creation, and full-map rendering test-first.
- [ ] Implement Roblox PNG export and re-decode validation for MIME `image/png`, exact 512×512 or 585×559 dimensions, nonempty pixel data, and valid alpha values. Add the transparent-result warning plus concise copy explaining that Roblox moderation/avatar compatibility is not guaranteed and Studio testing is recommended.
- [ ] Add small independently authored Chromium pixel fixtures plus Firefox/WebKit semantic smoke tests.
- [ ] Verify `npm run typecheck`, `npm run lint`, focused unit tests, and a production build.
- [ ] Commit: `feat: add Roblox template and export foundation`.

Completion: a programmatic project with one normalized PNG layer can produce a validated Roblox-size PNG; no editor UI is required yet.

## Milestone 2: Child-Friendly 2D Editor

**Create:** reducer/history, asset normalization, mobile editor UI, and pointer interaction.

- [ ] Build reducer, history, schema guards, and normalized-asset behavior over the core domain types established in Milestone 1.
- [ ] Implement an eight-item reducer with create, duplicate, rename, reorder, visibility, delete, transform, crop, opacity, and placement actions.
- [ ] Implement 50-state history with begin/update/commit gesture transactions and dirty-state tracking.
- [ ] Normalize PNG/JPEG/WebP imports with `createImageBitmap(..., { imageOrientation: "from-image" })`; use a tested `<img>` fallback where the option is not conforming, draw the result once to an in-memory canvas, and store only normalized PNG bytes.
- [ ] Enforce the 20 MiB, 4096×4096, 32-megapixel, and eight-item limits before changing current state.
- [ ] Route imports explicitly: 512×512 through New T-shirt with a full-map Item; 585×559 through a Shirt-or-Pants question sheet with a full-map Item; every other image into the current garment's Add Item flow. Add browser journeys for all three routes.
- [ ] Implement Sticker, Repeat, Fill Clothing, and optimized solid-color rendering. Repeat maps automatically through internal garment panels.
- [ ] Enforce 4,096 raster tile draws per layer and 16,384 per composition with the child-facing recovery message.
- [ ] Build the start screen, 2D canvas, Items sheet, bottom toolbar, compact Undo/Redo header controls, More sheet, and unsaved-project dialog. Include disabled and accessible Undo/Redo states.
- [ ] Make garment selection while editing invoke New Project behind the dirty confirmation; reducer and browser tests prove that existing Items are reset rather than reinterpreted.
- [ ] Implement one-pointer item manipulation and two-pointer viewport pan/zoom. A second pointer cancels and rolls back an active item gesture; all pointers must lift before editing resumes.
- [ ] Provide numeric and keyboard-accessible alternatives for every transform.
- [ ] Test 390×844, 844×390, coarse-pointer tablet portrait, and 1440×900 layouts with 44×44 primary controls and axe.
- [ ] Commit: `feat: add child-friendly 2d clothing editor`.

Completion: a child can choose a garment, add up to eight pictures/colors, adjust them, undo mistakes, and export a valid PNG on mobile or desktop.

## Milestone 3: Local Projects

**Create:** transactional project ZIP save/open around normalized PNG assets.

- [ ] Save `project.json` and `assets/<asset-id>.png` with stable schema-versioned metadata and SHA-256 hashes. Reject before compression when expanded payload exceeds 128 MiB and reject the resulting ZIP when compressed size exceeds 50 MiB; do not offer a download that cannot reopen.
- [ ] Stream ZIP import with normalized relative paths, duplicate rejection, 32-entry limit, 50 MiB compressed limit, and incremental 128 MiB expanded limit.
- [ ] Validate the eight-item limit, PNG signature/IHDR, dimensions, byte length, hashes, decoded-pixel budget, and every referenced asset before swapping state.
- [ ] Add round-trip tests for each garment and rejection tests for corrupt schemas, zip-slip, missing/extra assets, save-side and open-side limit boundaries, and failed-import rollback.
- [ ] Add New/Open confirmation while dirty and `beforeunload` only while dirty.
- [ ] Commit: `feat: add local clothing projects`.

Completion: users can download a project file, reload or move to another device, reopen it, continue editing, and export the same clothing result.

## Milestone 4: Single R6 Preview

**Create:** lazy Three.js preview, R6 measurement data, fixtures, and calibration evidence.

- [ ] Add the Studio measurement script and capture current Block Avatar R6 sizes/transforms with Studio version and date.
- [ ] Generate T-shirt, Shirt, and Pants calibration fixtures with colors, labels, arrows, and numbered edges. Author expected face/edge results independently from the official template PNGs, never from the implementation registry.
- [ ] Build procedural R6 boxes from the committed measurements and independently authored outward face winding.
- [ ] Apply the compositor canvas as an explicit sRGB, Y-flipped, clamp-to-edge `CanvasTexture` with polygon offset `-1/-1` on clothing surfaces.
- [ ] Add Chromium and WebKit browser checks for outward winding, texture orientation, and visible polygon-offset stability without z-fighting.
- [ ] Add orbit, pinch zoom, Reset, DPR cap 2, `ResizeObserver`, page-visibility suspension, and demand-driven rendering.
- [ ] Handle WebGL initialization/context loss without disabling the 2D editor or export.
- [ ] Capture six Studio and web views for all three garments and complete the independent R6 checklist.
- [ ] Make `npm run check:release` reject missing or failed calibration evidence.
- [ ] Commit implementation as `feat: add R6 clothing preview`; commit completed evidence separately as `test: record R6 Studio calibration`.

Completion: the Preview tab accurately shows the current texture on one simple R6 block avatar without adding any 3D editing controls.

## Milestone 5: Optional AI, Offline PWA, and Release

**Create:** Parent Settings, Gemini pattern client/proxy, offline shell, CI, and Pages deployment.

- [ ] Hide Generate unless `VITE_PATTERN_PROXY_URL` is configured.
- [ ] Add Parent Settings for a session-only Gemini key and Forget Key; never put the key in reducer state, project files, storage, logs, or built assets.
- [ ] Give the child a prompt, examples, Generate, and Cancel only. Insert valid results as ordinary Repeat items with prompt provenance.
- [ ] Implement the specified portable proxy with exact-origin CORS, 4 KiB body limit, 1–500 Unicode code points, 60-second timeout, 10 MiB response limit, PNG signature/IHDR validation, normalized errors, and redaction.
- [ ] Keep the Gemini model configurable and verify the current image-generation endpoint/model immediately before deployment.
- [ ] Add a small service worker that explicitly precaches the versioned application shell, templates, icons, and lazy R6 preview chunk while never caching project/user/AI data. Do not force waiting-worker activation; updates apply after old tabs close.
- [ ] Verify offline reload, editing, ZIP save/open, first navigation to the precached lazy Preview, and export while Generate is unavailable.
- [ ] Add GitHub Actions for typecheck, lint, unit tests, Chromium/Firefox/WebKit browser checks, production build, bundle budgets, PWA tests, and primary journeys.
- [ ] Configure Vite `base`, manifest URLs, service-worker registration URL, navigation fallback, and worker scope for the GitHub Pages repository subpath. Deploy only the static artifact with an optional public proxy URL and no secret. The proxy runtime is operator-supplied and deployed separately; selecting or provisioning its hosting platform is outside MVP.
- [ ] Complete physical iOS/Android editing/export smoke tests and one Roblox Studio/Creator Dashboard upload test per garment.
- [ ] Commit: `feat: add optional AI and offline release pipeline`.

Completion: the non-AI editor remains fully useful offline; a parent can optionally enable the experimental child-facing pattern generator.

## Final Verification

Run:

1. `npm ci`
2. `npm run typecheck`
3. `npm run lint`
4. `npm run test:unit`
5. `npm run test:browser`
6. `npm run build`
7. `npm run check:bundle`
8. `npm run test:pwa`
9. `npm run test:e2e`
10. `npm run check:release`

Acceptance requires:

- All automated commands exit successfully.
- T-shirt, Shirt, and Pants complete create/save/reopen/export journeys.
- Repeated Chromium exports have identical decoded pixels.
- No project or AI data appears in browser persistence or application caches.
- Initial JavaScript is below 150 KiB gzip, lazy preview below 250 KiB gzip, and offline precache below 2 MiB.
- R6 calibration and three Roblox upload smoke tests are recorded.
- Representative iOS Safari and Android Chrome devices edit and export without losing state.

## Deferred / Out of Scope

- Named-panel selection, per-panel targeting, and per-panel transforms.
- Mirror repeat, advanced pattern controls, more than eight layers, blend modes, masks, text, vectors, and painting.
- R15 preview, rig switching, camera presets, backgrounds, animation, and arbitrary avatar packages.
- Exact original JPEG/WebP preservation and professional asset provenance workflows.
- Custom in-session service-worker update prompts.
- Complete-template AI generation and image-guided AI generation.
- An operator-managed persistent AI key or public multi-user AI service; MVP uses a parent-supplied session key.
- Roblox authentication, upload, publishing, moderation, commerce, accounts, analytics, or cloud project storage.
- Layered-clothing meshes, fitting, rigging, skinning, cages, geometry editing, animation, or FBX/glTF export.
