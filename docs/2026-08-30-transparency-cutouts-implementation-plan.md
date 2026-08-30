# Transparency Cutouts Implementation Plan

> **Execution rule:** Implement each task test-first. Confirm the new test fails for the intended reason, make the smallest production change that passes it, run the task-level regression set, and commit before moving on.

**Goal:** Add reversible rectangular transparency cutouts that a child can draw and resize in the 2D editor, see on the 3D avatar, save and reopen, and export as a Roblox-compatible PNG with alpha.

**Architecture:** Extend the project document with a schema-v2 `cutout` item and migrate valid v1 projects on open. Keep paint items first and cutouts pinned in a suffix. The existing Canvas 2D compositor paints ordinary layers, then erases every visible cutout with `destination-out`; the workspace, lazy Three.js preview, and PNG export continue to consume that one canvas. Extend the existing pointer/transform system through a small normalized geometry adapter instead of adding a second editor framework.

**Constraints:** No new dependency, server state, browser persistence, bitmap mask, freehand tool, garment preset, or 3D geometry change. Keep eight total items, mobile-first layout, offline editing, and the current CI-gated GitHub Pages deployment.

**Design:** `docs/2026-08-30-transparency-cutouts-design.md`

## Task 1: Introduce schema v2 and safe v1 migration

**Files:**

- Modify: `src/domain/types.ts`
- Modify: `src/domain/project.ts`
- Modify: `src/editor/state.ts`
- Modify: `src/project/archive.ts`
- Modify: production files and test helpers that currently name `ProjectDocumentV1`
- Test: `tests/unit/project.test.ts`
- Test: `tests/unit/editor-state.test.ts`
- Test: `tests/unit/archive.test.ts`

### Steps

1. Add failing project tests asserting that a new project has `schemaVersion: 2`, an empty item list, and the same garment/name defaults.
2. Add failing archive tests for:
   - opening an asset-free valid v1 ZIP and receiving a normalized v2 document;
   - saving and reopening an asset-free deterministic v2 ZIP;
   - rejecting an unknown schema version;
   - rejecting a v2 document with a malformed cutout, duplicate IDs, non-positive geometry, or paint after a cutout.

   Keep successful unit round trips asset-free because the Node unit project has no `createImageBitmap`; put raster-bearing reopen coverage in `tests/browser/projects.test.ts`.
3. Define explicit legacy v1 paint-layer/document types and current v2 types. Use a discriminated current `Layer` union:

   ```ts
   type Layer = SolidLayer | RasterLayer | CutoutLayer;

   interface CutoutLayer {
     id: string;
     name: string;
     kind: "cutout";
     visible: boolean;
     rect: {
       centerX: number;
       centerY: number;
       width: number;
       height: number;
       rotationDeg: number;
     };
   }
   ```

   Keep paint-only opacity, placement, crop, color, and asset fields off `CutoutLayer`.
4. Make `createProject` return a v2 document. Rename current-document imports to `ProjectDocument`; reserve `ProjectDocumentV1` for archive compatibility.
5. Split validation into strict v1 and v2 paths. V2 validation must enforce:
   - the existing format/name/garment/asset constraints;
   - at most eight total layers;
   - unique layer and asset IDs;
   - finite center and rotation;
   - finite positive cutout width/height;
   - paint layers before the cutout suffix;
   - raster references to manifest assets;
   - exact discriminated shapes: a cutout accepts only `id`, `name`, `kind`, `visible`, and `rect`, and rejects `assetId`, `color`, `opacity`, `placement`, `transform`, `crop`, and unknown fields.
6. In `openProject`, inspect `schemaVersion`, validate with the matching validator, and migrate valid v1 data to v2 in memory without changing artwork or assets. Save only v2. Reject every other version.
7. Update compositor, preview, UI, export, and tests to use `ProjectDocument`. Because adding the discriminated union immediately makes cutout fields unavailable at unconditional paint accesses, add explicit exhaustive `kind === "cutout"` skip or unreachable guards in this task. These guards keep the intermediate commit type-safe and intentionally cutout-blind; Tasks 3, 4, and 6 replace them with rendering and interaction behavior.
8. Run:

   ```bash
   npm run test:unit -- tests/unit/project.test.ts tests/unit/editor-state.test.ts tests/unit/archive.test.ts
   npm run typecheck
   npm run lint
   ```

9. Commit: `feat: add versioned cutout project schema`

## Task 2: Add cutout item state semantics

**Files:**

- Modify: `src/editor/state.ts`
- Modify: `src/editor/ui/text.ts`
- Test: `tests/unit/editor-state.test.ts`

### Steps

1. Add failing reducer tests for:
   - `add-item` creating `Cut Out 1` with supplied rectangle geometry;
   - monotonic naming after delete and copy;
   - new paint inserting immediately before the cutout suffix;
   - duplicate cutout appending to the suffix with a new ID;
   - hide/show, rename, delete, undo, and redo;
   - the existing eight-item cap including cutouts;
   - rejecting cutout reorder and preventing paint reorder across the suffix;
   - rejecting non-finite or non-positive cutout mutations.
2. Extend `ItemSpec`, counters, shape guards, and mutations with `cutout`.
3. Add a cutout-specific rectangle patch action and gesture mutation. Keep paint transform validation unchanged.
4. Preserve the suffix invariant in add, copy, delete, and reorder helpers. Recompute counters from opened documents, including a monotonic `cutout` counter.
5. Make paint-only actions (`set-placement`, `set-opacity`, `set-color`, crop/paint transform patches) reject cutouts. Make cutout rectangle patches reject paint layers.
6. Keep each discrete operation in existing bounded undo history; gesture begin/update/commit remains one undo entry.
7. Run:

   ```bash
   npm run test:unit -- tests/unit/editor-state.test.ts
   npm run typecheck
   npm run lint
   ```

8. Commit: `feat: manage transparency cutout items`

## Task 3: Erase cutouts in the canonical compositor

**Files:**

- Modify: `src/compositor/compose.ts`
- Modify: `src/project/export.ts`
- Test: `tests/browser/compose.test.ts`
- Test: `tests/browser/export.test.ts`
- Test: `tests/browser/smoke/compose-smoke.test.ts`

### Steps

1. Add failing pixel tests using a solid opaque base and cutout rectangles. Assert:
   - pixels inside a visible cutout have alpha 0;
   - pixels outside retain the original RGBA value;
   - a hidden cutout changes nothing;
   - overlapping and rotated cutouts erase their union;
   - artwork order cannot repaint a cutout;
   - cutouts work for T-Shirt, Shirt, and Pants canonical sizes.
2. Add a failing export test that re-decodes the PNG and proves partial alpha is preserved with exact dimensions and MIME type. Keep the fully-transparent warning test.
3. Separate compositor validation/drawing into paint and cutout branches. Check tile budgets for raster paint only.
4. Draw every visible paint layer in document order. Then, in a fresh saved context:

   ```ts
   ctx.globalCompositeOperation = "destination-out";
   ctx.globalAlpha = 1;
   ```

   translate to the cutout center, rotate, and fill the width-by-height rectangle. Restore the context after each cutout and before return.
5. Do not clip the rectangle to registry panels; erasing operates on the complete canonical canvas.
6. Confirm export still scans final alpha and emits the existing warning only when all pixels are transparent.
7. Run:

   ```bash
   npm run test:browser -- tests/browser/compose.test.ts tests/browser/export.test.ts tests/browser/smoke/compose-smoke.test.ts
   npm run typecheck
   npm run lint
   ```

8. Commit: `feat: render transparency cutouts`

## Task 4: Generalize transform geometry for pictures and cutouts

**Files:**

- Modify: `src/editor/ui/gestures.ts`
- Modify: `src/editor/ui/workspace.tsx`
- Modify: `src/editor/state.ts`
- Test: `tests/browser/gestures.test.ts`

### Steps

1. Add failing geometry/controller tests proving a selected cutout can:
   - be hit-tested inside its rotated rectangle;
   - move by dragging inside;
   - resize uniformly from the blue handle;
   - rotate from the white handle;
   - scale with the wheel when the pointer is over it;
   - move/resize/rotate with existing keyboard commands;
   - commit one undo step per continuous gesture;
   - roll back on pointer cancel or controller destruction.
2. Introduce a small normalized `EditableGeometry` adapter containing center, rotation, half-size, footprint, and mutation mapping. Adapt raster transforms and cutout rectangles to it. Do not change raster math or make solid full-map colors directly transformable.
3. Make the gesture controller request normalized geometry instead of assuming `layer.kind === "raster"` and `layer.transform`.
4. Map normalized move/rotate/scale updates back to `patch-transform` for raster items and `patch-cutout` for cutout items.
5. Reuse the existing handle clamping, screen-space hit radius, viewport isolation, requestAnimationFrame batching, and gesture transaction boundaries.
6. Render the same outlined polygon and two handles for selected cutouts. Keep hidden items non-interactive.
7. Run:

   ```bash
   npm run test:browser -- tests/browser/gestures.test.ts
   npm run typecheck
   npm run lint
   ```

8. Commit: `feat: transform rectangular cutouts`

## Task 5: Add draw-to-create mode

**Files:**

- Modify: `src/editor/ui/gestures.ts`
- Modify: `src/editor/ui/workspace.tsx`
- Modify: `src/editor/ui/designer-app.tsx`
- Modify: `src/editor/ui/editor-screen.tsx`
- Modify: `src/editor/ui/sheets.tsx`
- Modify: `src/editor/ui/text.ts`
- Modify: `src/styles.css`
- Test: `tests/browser/gestures.test.ts`
- Test: `tests/browser/ui.test.ts`

### Steps

1. Add failing browser tests for the complete creation lifecycle:
   - **Add → Cut Out** closes the sheet, activates Edit, and shows the instruction and Cancel control;
   - mouse and touch drags convert screen coordinates through the current fitted/zoomed viewport into a cutout rectangle;
   - the live draft outline follows the drag without dirtying the project;
   - pointer-up adds and selects exactly one cutout, exits draw mode, and creates one undo entry;
   - a tap creates a bounded default rectangle centered on the tap;
   - Cancel, Escape, pointer-cancel, tool switch, New, Open, and unmount discard the draft without dirtying;
   - the item cap blocks entry or commit with the existing child-readable cap notice.
2. Add an ephemeral `toolMode: "normal" | "draw-cutout"` in `DesignerApp`; do not persist it in the project or history.
3. Add a plain **Cut Out** choice to `AddSheet`. Starting it closes the sheet and makes the 2D tab active.
4. Extend the controller with a draw branch that takes precedence over selection/viewport gestures while the mode is active. Track the first pointer, ignore additional pointer-down/move/up events until it finishes, expose a draft rectangle callback, and convert a below-threshold drag to the default size. Add a two-pointer regression test proving an extra touch neither pans the viewport nor corrupts/commits the draft. Clamp default size to a useful fraction of the current canonical canvas and keep its center within the canvas.
5. Render the live draft on the existing overlay with a distinct dashed outline. Add a pointer-transparent instruction plus a 44px **Cancel** button inside the workspace without increasing page height.
6. On commit, dispatch one cutout `add-item`, select its ID, and return to normal mode. On every cancel path, clear the draft and return to normal mode.
7. Run:

   ```bash
   npm run test:browser -- tests/browser/gestures.test.ts tests/browser/ui.test.ts
   npm run typecheck
   npm run lint
   ```

8. Commit: `feat: draw transparency rectangles`

## Task 6: Finish Cut Out controls, Items behavior, and transparency cues

**Files:**

- Modify: `src/editor/ui/editor-screen.tsx`
- Modify: `src/editor/ui/designer-app.tsx`
- Modify: `src/editor/ui/items-panel.tsx`
- Modify: `src/editor/ui/sheets.tsx`
- Modify: `src/editor/ui/icons.tsx`
- Modify: `src/editor/ui/workspace.tsx`
- Modify: `src/styles.css`
- Test: `tests/browser/ui.test.ts`
- Test: `tests/browser/gestures.test.ts`
- Test: `tests/browser/projects.test.ts`

### Steps

1. Add failing UI tests asserting:
   - selected cutouts show a **Cut Out** label and **More**, not Placement controls;
   - More shows Left/Right, Up/Down, Turn, Size, Width, and Height, and omits opacity/crop;
   - More commits valid cutout geometry and rejects invalid values;
   - Items pins cutouts above artwork, omits ineffective reorder buttons for cutouts, and retains labeled hide/show, copy, rename, and delete controls;
   - the eye state reflects hidden cutouts and copied cutouts get a visible new row;
   - transparent canvas pixels reveal an editor-only checkerboard;
   - the checkerboard CSS is absent from compositor/export pixels;
   - all drawing/selection controls remain reachable at portrait and landscape test sizes.
2. Branch the selection bar by layer kind. Keep existing paint behavior byte-for-byte where possible.
3. Add cutout-specific More fields. For Size, apply one ratio to width and height; Width and Height set their pixel values independently.
4. Preserve the canonical suffix order when building `layersTopFirst`; the existing reverse already pins a valid cutout suffix first. Hide cutout up/down buttons rather than showing no-op controls, and disable the top paint item's Move Up button when a cutout is immediately above it so the UI never offers a reducer-rejected dead action.
5. Add a minimal Cut Out icon only where it improves recognition; pair it with text and an accessible name.
6. Add a low-contrast CSS checkerboard to `.workspace-canvas` behind its transparent bitmap. Keep the overlay transparent and high-contrast.
7. Run:

   ```bash
   npm run test:browser -- tests/browser/ui.test.ts tests/browser/gestures.test.ts tests/browser/projects.test.ts
   npm run typecheck
   npm run lint
   ```

8. Commit: `feat: polish transparency controls`

## Task 7: Verify save/open, preview alpha, offline use, and mobile journeys

**Files:**

- Modify: `tests/browser/projects.test.ts`
- Modify: `tests/browser/smoke/preview-smoke.test.ts`
- Modify: `tests/e2e/mobile-layout.spec.ts`
- Modify: `tests/e2e/smoke.spec.ts`
- Modify if needed: `scripts/test-pwa.mjs`

### Steps

1. Add a browser project journey that draws a cutout, saves a `.rbxcloth.zip`, reopens it, and verifies the same selected geometry and alpha result. Include a raster-bearing v2 round trip here, where `createImageBitmap` is available.
2. Add a preview smoke assertion with solid red clothing and a large cutout: compare the gray cleared center with adjacent red garment pixels. Use a dedicated tolerance no greater than 10 for any body-versus-background distinction; the suite's current tolerance of 24 cannot distinguish those two gray colors reliably. Avoid screenshot-only assertions when a stable pixel probe is available.
3. Add E2E journeys for:
   - mobile portrait draw, resize, preview, and export;
   - mobile landscape draw mode fitting exactly inside the viewport with no document scroll;
   - desktop mouse drawing and wheel resize isolation;
   - opening a deterministic legacy v1 fixture and resaving v2. Generate the fixture in-test with `fflate` from an explicit v1 JSON shape; do not rely on a nonexistent checked-in ZIP.
4. Extend the offline PWA journey so a loaded app can create, save/open, preview, and export a cutout without a network request.
5. Run:

   ```bash
   npm run test:browser
   npm run build
   npm run check:bundle
   npm run test:pwa
   npm run test:e2e
   ```

6. Commit: `test: cover transparency journeys`

## Task 8: Document the feature and Roblox limitation

**Files:**

- Modify: `README.md`
- Modify: `docs/roblox-clothing-designer-design.md`
- Modify: `docs/roblox-technical-preflight.md`

### Steps

1. Document the user flow: **Add → Cut Out → drag → resize/rotate → Preview → Export**.
2. State that a classic T-Shirt is only a front graphic. Describe body reveal for Shirt/Pants as the intended alpha behavior pending the explicit Studio fixture check, not as a guarantee in current classic-clothing documentation.
3. State that export is RGBA PNG, Studio testing is required, and uploading/moderation remains outside the app.
4. Update the persistent project schema section to v2 and document v1 migration and the cutout-suffix invariant.
5. Mark freehand, presets, feathering, and 3D geometry as deferred.
6. Run:

   ```bash
   git diff --check
   npm run lint
   ```

7. Commit: `docs: explain transparency cutouts`

## Task 9: Add Roblox alpha-validation fixtures and checklist

**Files:**

- Modify: `scripts/generate-calibration.mjs`
- Modify: `scripts/check-release.mjs`
- Modify: `calibration/README.md`
- Modify: `calibration/r6-checklist.md`
- Regenerate: `calibration/fixtures/`
- Test: `tests/unit/check-release.test.ts`

### Steps

1. Record the current primary-source boundary in `calibration/README.md`:
   - Roblox's [classic-clothing documentation](https://create.roblox.com/docs/avatar/classic-clothing) documents the garment categories, PNG/JPEG input, official template/panel sizes, and Studio testing;
   - Roblox's official 2026 template ZIP contains fully opaque 585x559 RGBA PNGs;
   - the current classic-clothing documentation does not explicitly guarantee runtime handling of transparent pixels;
   - `SurfaceAppearance` alpha documentation is not proof for classic `Shirt`, `Pants`, or `ShirtGraphic` objects.
2. Add failing `check-release` tests requiring one deterministic alpha fixture per garment type, with the canonical PNG dimensions and matching checklist markers. Rotated-edge antialiasing belongs to editor behavior tests, not these calibration fixtures.
3. Extend `scripts/generate-calibration.mjs` to create and self-verify `shirt-alpha.png`, `pants-alpha.png`, and `tshirt-alpha.png` using the current registry. Each fixture must contain an opaque high-contrast painted region, a clearly labeled rectangular interior with alpha exactly 0, and exterior alpha exactly 255; verify representative alpha samples in the browser before encoding. Place the clear rectangle in source regions consumed by the front-facing preview bindings so the Studio result is easy to inspect.
4. Extend `calibration/r6-checklist.md` with explicit rows for each garment recording:
   - alpha-zero region reveals body, remains opaque, or behaves otherwise;
   - opaque border remains visible;
   - T-Shirt alpha affects only its front graphic and does not imply a garment silhouette;
   - Studio version, rig type, capture name, and result.
5. Keep this evidence inside the existing manual calibration contract. Do not fabricate a pass, do not call the behavior Roblox-confirmed before real Studio evidence exists, and do not turn `check:release` into an automated Pages blocker.
6. Run:

   ```bash
   npm run calibration:fixtures
   npm run test:unit -- tests/unit/check-release.test.ts
   git diff --check
   ```

7. Commit: `test: add classic clothing alpha fixtures`

## Task 10: Independent implementation review and corrections

**Files:**

- Review: all commits since the design/plan baseline
- Modify: only files required by validated findings
- Test: add a regression test for every accepted behavioral finding

### Steps

1. Use commit `fd8c0ca` as the fixed pre-implementation review baseline and run a local evidence audit of every later commit against the approved design: trace schema, reducer invariants, compositor alpha, UI cancel paths, save/open, preview, export, offline behavior, accessibility, and mobile layout.
2. Ask Qwen and GLM to independently review the implementation diff read-only, requiring prioritized findings and exactly one `VERDICT:` line.
3. Validate each finding against source and tests. Reject speculative or scope-expanding suggestions; add a failing regression test before every accepted code correction.
4. Correct valid findings and rerun the narrow test first, then the complete verification suite.
5. Commit: `fix: address transparency review findings` only if corrections are needed.

## Task 11: Full verification, push, deploy, and public smoke test

**Files:**

- Inspect: `.github/workflows/ci.yml`
- Inspect: `.github/workflows/deploy-pages.yml`
- No release-evidence fabrication

### Steps

1. Confirm the worktree is clean except for intended final changes and run:

   ```bash
   npm run typecheck
   npm run lint
   npm run test:unit
   npm run test:browser
   npm run build
   npm run check:bundle
   npm run test:pwa
   npm run test:e2e
   git diff --check
   ```

2. Run `npm run check:release` and report its real result separately. Its known manual Roblox Studio calibration evidence gaps do not block the CI-gated Pages artifact and must not be fabricated.
3. Verify `git status --short`, commit any final intentional changes, and push `main` to `origin` as explicitly authorized.
4. Monitor the `CI` workflow for the pushed SHA with `gh run`. If it fails, reproduce, fix test-first, recommit, and push again.
5. Monitor the dependent Pages deployment workflow through success.
6. Open the public GitHub Pages site and perform a real-browser smoke test at desktop, mobile portrait, and mobile landscape:
   - create Shirt and Pants cutouts;
   - resize and rotate;
   - confirm body is visible in 3D;
   - export and verify PNG dimensions/alpha;
   - save and reopen the project;
   - reload offline after the service worker has cached the release.
7. Report pushed commit SHA, CI run, Pages deployment result, public URL, automated test totals, browser smoke evidence, and the honest calibration-gate status.

## Acceptance checklist

- A child can discover **Cut Out** under Add without learning layer masks.
- Drag creates a rectangle; tap creates a useful fallback rectangle.
- The rectangle can be moved, resized, rotated, hidden, copied, renamed, deleted, undone, and redone.
- Every visible cutout clears the finished artwork regardless of paint order.
- 2D checkerboard, 3D body reveal, and exported PNG alpha agree.
- Existing v1 projects open; new v2 projects save/open without loss.
- T-Shirt behavior is described accurately and Shirt/Pants examples are not misrepresented.
- RGBA PNG output and clear-interior pixels are automated; actual classic-clothing alpha behavior remains explicitly Studio-gated until real evidence is recorded.
- Portrait and landscape stay bounded and usable.
- Offline non-AI editing still works.
- No dependency or server-side storage is added.
- CI and Pages deployment succeed for the pushed SHA.
