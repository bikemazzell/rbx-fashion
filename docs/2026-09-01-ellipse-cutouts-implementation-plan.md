# Ellipse Cutouts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add oval/circle transparency through the existing Cut Out entry, preserve rectangles and old projects, fix compact More-sheet overflow, and deploy the reviewed result.

**Architecture:** Upgrade projects to schema v3 by adding a strict `shape` discriminator to Cut Outs and migrate valid v1/v2 projects in memory. Reuse the current Cut Out bounding rectangle and transform gestures; only drawing, interior hit testing, overlay strokes, and compositor erasure branch on shape. Add one short-lived shape-choice sheet and keep all output paths on the canonical Canvas 2D composition.

**Tech Stack:** TypeScript, Preact, Canvas 2D, Three.js preview, fflate project archives, Vitest unit/browser projects, Playwright, Vite PWA scripts; no new dependencies.

**Design:** `docs/2026-09-01-ellipse-cutouts-design.md`

---

## Task 1: Add schema-v3 Cut Out shapes and migrations

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/domain/project.ts`
- Modify: `src/editor/state.ts`
- Modify: `src/project/archive.ts`
- Modify: `tests/unit/project.test.ts`
- Modify: `tests/unit/editor-state.test.ts`
- Modify: `tests/unit/archive.test.ts`

- [ ] **Step 1: Write failing schema and migration tests**

Add tests proving:

- new projects use `schemaVersion: 3`;
- a new Cut Out requires `shape: "rectangle" | "ellipse"`;
- valid v1 opens directly as v3 with unchanged paint;
- valid v2 opens as v3 and every Cut Out gains `shape: "rectangle"`;
- v2 migration preserves name, ID, visibility, geometry, ordering, assets, and paint fields;
- v3 rejects a missing shape, `shape: "triangle"`, extra paint fields, malformed geometry, paint after a Cut Out, duplicate IDs, and more than eight layers;
- v1/v2 validators remain version-specific and v3 rejects unknown schema versions.

Use asset-free archive fixtures for migration assertions and keep the existing strict raster-integrity cases.

- [ ] **Step 2: Verify RED**

Run:

```bash
npm run test:unit -- tests/unit/editor-state.test.ts tests/unit/archive.test.ts
```

Expected: failures show the current schema is v2 and Cut Outs have no shape.

- [ ] **Step 3: Define explicit v2 and v3 types**

In `src/domain/types.ts`, add:

```ts
export type CutoutShape = "rectangle" | "ellipse";

export interface CutoutLayerV2 extends LayerBase {
  kind: "cutout";
  rect: CutoutRect;
}

export interface CutoutLayer extends CutoutLayerV2 {
  shape: CutoutShape;
}

export interface ProjectDocumentV2 {
  format: "rbx-fashion-project";
  schemaVersion: 2;
  name: string;
  garmentType: GarmentType;
  layers: Array<PaintLayer | CutoutLayerV2>;
  assets: AssetManifestEntry[];
}
```

Change current `ProjectDocument.schemaVersion` to 3. Keep `ProjectDocumentV1` paint-only.

- [ ] **Step 4: Implement strict validators and migrations**

In `src/editor/state.ts`:

- split v2 Cut Out keys (`id,name,kind,visible,rect`) from v3 keys (plus `shape`);
- make `hasValidDocumentHeader` accept `1 | 2 | 3`;
- add `isValidProjectDocumentV2` using v2 Cut Outs;
- update `isValidProjectDocument` to require schema 3 and a valid shape;
- make `migrateProjectDocumentV1` return schema 3 with copied paint/assets;
- add `migrateProjectDocumentV2`, mapping each v2 Cut Out to `{ ...layer, shape: "rectangle" }`;
- extend `ItemSpec` Cut Outs to require a shape and preserve it in add/copy.

In `archive.ts`, branch explicitly for v1 migration, v2 migration, and valid v3. In `domain/project.ts`, create schema 3.

- [ ] **Step 5: Verify GREEN and type consistency**

Run the targeted unit files and `npm run typecheck`. Update `tests/unit/project.test.ts` to expect schema 3. Update existing typed fixtures from v2 to v3 by adding `shape: "rectangle"` only where they represent current documents; keep explicit legacy fixtures at v1/v2.

- [ ] **Step 6: Commit**

```bash
git add src/domain/types.ts src/domain/project.ts src/editor/state.ts src/project/archive.ts tests/unit/project.test.ts tests/unit/editor-state.test.ts tests/unit/archive.test.ts
git commit -m "feat: add versioned cutout shapes"
```

## Task 2: Erase ellipses in the canonical compositor

**Files:**
- Modify: `src/compositor/compose.ts`
- Modify: `tests/browser/compose.test.ts`
- Modify: `tests/browser/export.test.ts`

- [ ] **Step 1: Write failing pixel tests**

With an opaque base, add visible ellipse Cut Outs and assert:

- center alpha is 0;
- an interior point near each axis is alpha 0;
- all four bounding-box corners remain opaque;
- a hidden ellipse changes nothing;
- a rotated non-square ellipse clears the rotated interior but not its old axis-aligned extent;
- overlapping rectangle and ellipse Cut Outs erase their union;
- T-Shirt output remains 512x512 and Shirt/Pants remain 585x559;
- PNG export retains RGBA alpha at ellipse center and opaque pixels outside it.

Retain an explicit migrated rectangle pixel test to prove rectangle output is unchanged.

- [ ] **Step 2: Verify RED**

Run:

```bash
npm run test:browser -- tests/browser/compose.test.ts tests/browser/export.test.ts
```

Expected: ellipse corner pixels are incorrectly erased because the compositor still uses `fillRect`.

- [ ] **Step 3: Implement shape-aware erasure**

In `eraseCutout`, keep the existing transform and `destination-out`. Branch only at the path:

```ts
if (layer.shape === "ellipse") {
  ctx.beginPath();
  ctx.ellipse(0, 0, layer.rect.width / 2, layer.rect.height / 2, 0, 0, Math.PI * 2);
  ctx.fill();
} else {
  ctx.fillRect(-layer.rect.width / 2, -layer.rect.height / 2, layer.rect.width, layer.rect.height);
}
```

Validate the shape before rendering and restore the context as today.

- [ ] **Step 4: Verify GREEN and commit**

Run the targeted browser tests, then commit:

```bash
git add src/compositor/compose.ts tests/browser/compose.test.ts tests/browser/export.test.ts
git commit -m "feat: render elliptical cutouts"
```

## Task 3: Make Cut Out geometry and overlays shape-aware

**Files:**
- Modify: `src/editor/ui/gestures.ts`
- Modify: `src/editor/ui/workspace.tsx`
- Modify: `tests/browser/gestures.test.ts`

- [ ] **Step 1: Write failing hit-test and overlay tests**

Export or exercise a shape-aware `pointInFootprint` API and prove:

- rectangle behavior is unchanged;
- ellipse center and axis-interior points hit;
- ellipse bounding-box corners do not hit;
- rotation is inverse-transformed correctly;
- handle hit testing still wins even when a handle lies outside the ellipse interior.

Mounted-app tests create an ellipse, tap an empty bounding corner and confirm it is not selected/moved, then move, drag all four sides, corner-resize, rotate, wheel-resize, keyboard-adjust, undo, and pointer-cancel it. Assert each continuous gesture creates at most one history entry and side drags keep the opposite edge fixed.

Add overlay assertions that an ellipse draft and selected ellipse are stroked as ellipses while Rectangle remains a rectangle. Use canvas pixel probes or truthful `data-selection-shape`/`data-draft-shape` hooks; do not add fake interactive DOM controls.

- [ ] **Step 2: Verify RED**

Run:

```bash
npm run test:browser -- tests/browser/gestures.test.ts
```

Expected: bounding corners hit and overlays remain rectangular.

- [ ] **Step 3: Implement shape-aware interior tests**

Change `pointInFootprint(footprint, point, shape = "rectangle")` to use the existing inverse rotation and, for ellipse, evaluate:

```ts
const nx = rotatedX / footprint.halfWidth;
const ny = rotatedY / footprint.halfHeight;
return nx * nx + ny * ny <= 1 + epsilon;
```

Pass each Cut Out's shape from layer hit testing and wheel-inside checks. Keep side/corner/rotation handle detection before interior detection and keep the same 44px screen-space hit diameter.

- [ ] **Step 4: Draw the correct draft and selection outline**

In `workspace.tsx`, add one helper that strokes a rotated rectangle or ellipse from a Cut Out. Set truthful overlay data attributes while a draft/selection is drawn and clear them otherwise. Continue drawing the same four side handles, proportional corner handle, and rotation handle from the bounding footprint.

- [ ] **Step 5: Verify GREEN and commit**

Run the targeted gesture tests, then commit:

```bash
git add src/editor/ui/gestures.ts src/editor/ui/workspace.tsx tests/browser/gestures.test.ts
git commit -m "feat: edit oval cutouts directly"
```

## Task 4: Add the Rectangle/Oval shape chooser

**Files:**
- Modify: `src/editor/ui/sheets.tsx`
- Modify: `src/editor/ui/editor-screen.tsx`
- Modify: `src/editor/ui/designer-app.tsx`
- Modify: `src/editor/ui/icons.tsx`
- Modify: `src/styles.css`
- Modify: `tests/browser/ui.test.ts`
- Modify: `tests/browser/gestures.test.ts`

- [ ] **Step 1: Write failing user-flow tests**

Assert:

- Add still contains exactly one Cut Out choice;
- choosing it opens a dialog labelled `Cut Out Shape` with Rectangle and Oval choices;
- Rectangle starts rectangle draw mode; Oval starts ellipse draw mode;
- shape selection itself does not dirty history;
- Cancel, backdrop, Escape, tab/tool changes, New/Open, and pointer cancellation clear chosen shape/draft;
- a Rectangle drag creates `Rectangle Cut Out 1` with rectangle shape;
- an Oval drag creates `Oval Cut Out 2` with ellipse shape;
- an Oval tap creates equal width and height;
- selection bar and Items use Rectangle/Oval labels, while migrated custom/old names remain preserved;
- item-cap rejection creates no layer or selection.

- [ ] **Step 2: Verify RED**

Run:

```bash
npm run test:browser -- tests/browser/ui.test.ts tests/browser/gestures.test.ts
```

Expected: Cut Out enters rectangle drawing immediately and no shape sheet exists.

- [ ] **Step 3: Implement ephemeral chosen-shape state**

Replace boolean `drawingCutout` in `DesignerApp` with `drawingCutoutShape: CutoutShape | null`, or keep the public boolean derived from it. Add `"cutout-shape"` to `SheetKind`. Clicking Cut Out opens that sheet; choosing a shape closes it, activates Edit, and stores the shape. Pass the chosen shape through Workspace draft creation and `onCreateCutout(rect, shape)` into the state `add-item` action.

Every existing transient reset path must set the chosen shape to null. After commit or cancellation, clear it exactly once.

- [ ] **Step 4: Implement the compact shape sheet and labels**

Add `CutoutShapeSheet` with two large buttons containing existing-style inline SVG rectangle/oval icons and visible labels. Backdrop, Cancel, and Escape close it without editing. Update the selected Cut Out label from `Cut Out` to `Rectangle Cut Out` or `Oval Cut Out`; Items use the layer's persisted name.

For Oval tap fallback, use `diameter = min(defaultWidth, defaultHeight)` and clamp the circle center to the canvas as today.

- [ ] **Step 5: Verify GREEN and commit**

Run targeted UI/gesture tests plus typecheck, then commit:

```bash
git add src/editor/ui/sheets.tsx src/editor/ui/editor-screen.tsx src/editor/ui/designer-app.tsx src/editor/ui/icons.tsx src/styles.css tests/browser/ui.test.ts tests/browser/gestures.test.ts
git commit -m "feat: choose rectangle or oval cutouts"
```

## Task 5: Fix compact More overflow and cover persistence/mobile/offline

**Files:**
- Modify: `src/editor/ui/sheets.tsx`
- Modify: `src/styles.css`
- Modify: `tests/browser/ui.test.ts`
- Modify: `tests/browser/projects.test.ts`
- Modify: `tests/e2e/mobile-layout.spec.ts`
- Modify: `scripts/test-pwa.mjs`
- Modify: `README.md`
- Modify: `docs/roblox-clothing-designer-design.md`

- [ ] **Step 1: Write the failing 844x390 overflow regression**

Create a Color Patch and each Cut Out shape, open More at 844x390, and assert for both `.more-sheet` and `.more-form`:

```ts
expect(element.scrollHeight).toBeLessThanOrEqual(element.clientHeight + 1);
expect(getComputedStyle(element).overflowY).not.toBe("auto");
expect(getComputedStyle(element).overflowY).not.toBe("scroll");
```

Assert Done is fully visible. Verify RED against current main, where the public Color More form measured 226px scroll height inside 164px client height.

- [ ] **Step 2: Diagnose and fix only compact forms**

Root cause is the unconditional `.more-sheet .more-form { overflow-y: auto }` combined with a 75dvh landscape sheet. Add a `compact-more-sheet` class only for Color Patch and Cut Outs. For that variant, remove form overflow, reduce landscape gaps/padding as needed, and allow the sheet to use the available viewport height while keeping 44px inputs and Done. Do not remove overflow from raster More.

- [ ] **Step 3: Add save/open and migration journeys**

Save a project containing Rectangle and Oval Cut Outs plus a raster/solid layer, reopen it, and assert shape, geometry, selection behavior, and alpha pixels. Mutation-check the round-trip test by temporarily changing the expected ellipse shape and confirming failure. Reopen a v2 rectangle archive and assert schema 3 plus identical alpha pixels.

- [ ] **Step 4: Extend mobile and offline acceptance**

In Playwright, exercise Add → Cut Out → Oval with touch pointer events at 390x844 and 844x390, side-resize it, open More without overflow, switch Preview, and assert document height remains bounded. Extend the PWA journey to create/save/open/export an ellipse after the network is unavailable.

- [ ] **Step 5: Update documentation**

Document the one Cut Out entry, Rectangle/Oval chooser, circle tap behavior, shared handles, schema-v3 migration, alpha export, and retained Roblox Studio calibration caveat in README and the canonical product design.

- [ ] **Step 6: Run task verification and commit**

Run:

```bash
npm run test:browser -- tests/browser/ui.test.ts tests/browser/projects.test.ts
npm run build
npm run test:pwa
npm run test:e2e
```

Then commit:

```bash
git add src/editor/ui/sheets.tsx src/styles.css tests/browser/ui.test.ts tests/browser/projects.test.ts tests/e2e/mobile-layout.spec.ts scripts/test-pwa.mjs README.md docs/roblox-clothing-designer-design.md
git commit -m "test: cover ellipse cutout journeys"
```

## Task 6: Review, correct, verify, merge, and deploy

**Files:**
- Create: `reviews/ellipse-cutouts-qwen-<timestamp>.md`
- Create: `reviews/ellipse-cutouts-deepseek-<timestamp>.md`
- Modify: only files required by validated findings

- [ ] **Step 1: Run the complete local gate**

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

Run `npm run check:release` separately. It may remain nonzero only for the existing 40 named manual Roblox Studio calibration gaps.

- [ ] **Step 2: Obtain Qwen and DeepSeek independent reviews**

Use the `review-with` command in read-only mode with separate artifacts. Embed the full `main...HEAD` diff and cite the design/plan paths. Ask both to scrutinize schema migration/data loss, strict validation, ellipse pixel math, rotated hit testing, cancellation/history, shape-sheet transitions, mobile overflow, archive/offline/export behavior, and compatibility with existing rectangles/colors. Require exactly one verdict line.

- [ ] **Step 3: Validate and correct findings RED-first**

For each concrete finding, reproduce it or trace its cited path. Reject unsupported scope expansion. For every valid issue, write a failing regression test, observe the intended RED failure, implement the minimum correction, and rerun the targeted plus adjacent suites. Commit fixes with the review artifacts.

- [ ] **Step 4: Re-run fresh release evidence**

Repeat the full local gate after review fixes. Check every design and plan requirement against code/tests. Use a production build in a real browser at 390x844, 844x390, and desktop to create both shapes, direct-resize them, inspect More overflow, preview, save/open, and export.

- [ ] **Step 5: Merge and deploy**

Merge the reviewed branch into local `main`, rerun typecheck, lint, unit, browser, build, PWA, and E2E on the merge result, then push `main`. Watch the exact CI and Deploy Pages runs for the pushed SHA until both complete successfully. Fetch the public URL for HTTP 200 and repeat the decisive Rectangle/Oval/More/Preview/Export smoke path against Pages.

## Acceptance checklist

- [ ] Add contains one Cut Out entry followed by a Rectangle/Oval choice.
- [ ] Drag creates the chosen shape; Oval tap creates a circle.
- [ ] Rectangle behavior and pixels remain unchanged.
- [ ] Ellipse interior, rotation, alpha, selection, and empty-corner hit testing are correct.
- [ ] Both shapes support move, four side handles, proportional corner resize, rotation, wheel/keyboard, cancellation, and one-entry undo.
- [ ] v1/v2 migrate to strict v3 without visual or data loss; unknown shapes/versions are rejected.
- [ ] New names and selection labels distinguish Rectangle and Oval while old names remain unchanged.
- [ ] Color Patch and Cut Out More sheets have no internal scrollbar at 844x390; raster More remains functional.
- [ ] Save/open, 2D, 3D preview, PNG export, offline PWA, portrait, and landscape pass.
- [ ] No dependency, service, storage, account, or 3D geometry feature is added.
- [ ] Qwen and DeepSeek return valid review artifacts and every accepted issue has a RED-first regression.
- [ ] CI and GitHub Pages succeed for the pushed main SHA.
