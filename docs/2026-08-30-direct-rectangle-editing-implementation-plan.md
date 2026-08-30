# Direct Rectangle Editing Implementation Plan

> **Execution rule:** Implement each task test-first. Confirm the new test fails for the intended reason, make the smallest production change that passes it, run the task-level regression set, and commit before moving on.

**Goal:** Let a child tap a swatch to create a centered color rectangle, then move it, drag its edges, scale it proportionally, and rotate it directly on the canvas — with the same direct-manipulation treatment for Cut Outs via four new side handles, and a compact two-column More sheet without Width/Height fields.

**Architecture:** Reuse the existing solid-layer `decal` placement the compositor already renders as a transformed garment-clipped rectangle. Choosing a swatch creates a new decal solid with a centered transform (40% × 30% of the canonical canvas) instead of the old full-clothing fill. Extend the normalized geometry adapter and gesture controller with an `edge` gesture that works in the item's local frame so it stays correct when rotated. Old saved `pattern` solids keep rendering and recoloring exactly as before and remain non-directly-transformable.

**Constraints:** No new dependency, schema version, server state, or second color mode. No change to the compositor, export pipeline, raster controls (including crop), item cap, or undo model (one completed drag = one undo entry). Keep 44×44 CSS-px touch targets, mobile-first layout, offline editing, and the CI-gated Pages deployment.

**Design:** `docs/2026-08-30-direct-rectangle-editing-design.md`

## Task 1: Create color rectangles from swatches

**Files:**

- Modify: `src/editor/state.ts`
- Modify: `src/editor/ui/designer-app.tsx`
- Test: `tests/unit/editor-state.test.ts`
- Test: `tests/browser/ui.test.ts`

### Steps

1. Add failing unit tests for `add-item` with a solid spec:
   - the created layer has `placement: "decal"` and the supplied transform copied field-for-field (not the old `solidDefaultTransform()`);
   - naming stays `Color N` and remains monotonic after delete/copy;
   - the eight-item cap still counts solids;
   - invalid transforms (non-finite, non-positive scale) are rejected.
2. Change `ItemSpec`'s solid variant to `{ kind: "solid"; color: string; transform: Transform }`. Make `addItem` create `placement: "decal"`, copy the supplied transform, and validate it with the existing `isTransformValid`.
3. Update every `solidSpec` call site in `tests/unit/editor-state.test.ts` to supply a decal-sized transform.
4. In `designer-app.tsx`, compute the default rectangle from the garment template: center at canvas center, `scaleX = round(width * 0.4)`, `scaleY = round(height * 0.3)`, rotation 0, full crop. `addSolid` dispatches `add-item` with that transform; the existing swatch branch keeps recolor-only when a solid is selected and otherwise adds, selects, and the cap notice still applies.
5. Add a failing browser test: tapping a swatch with no solid selected creates one undoable item; with a solid selected it only recolors (no new layer, one undo entry). Update the two existing tests that assert the old segmented-control/fill-clothing selection bar for new solids.
6. Run:

   ```bash
   npm run test:unit -- tests/unit/editor-state.test.ts
   npm run test:browser -- tests/browser/ui.test.ts
   npm run typecheck
   npm run lint
   ```

7. Commit: `feat: create centered color rectangles from swatches`

## Task 2: Add edge-handle geometry and gestures

**Files:**

- Modify: `src/editor/ui/gestures.ts`
- Test: `tests/browser/gestures.test.ts`

### Steps

1. Add failing controller tests using the existing bare-controller harness:
   - `footprintGeometry` exposes four edge-midpoint handles for a rotated rectangle at the correct screen points;
   - dragging each edge (left, right, top, bottom) at rotation 0 moves only that edge and keeps the opposite edge fixed: one of width/height changes and the center shifts half the dragged distance along that axis;
   - an edge drag on a rotated item resizes along the item's local axis;
   - edge drags work for both a cutout (dispatches `patch-cutout`) and a decal solid (dispatches `patch-transform`);
   - each completed edge drag commits exactly one undo entry; pointer cancel rolls back;
   - dragging an edge past a small minimum cannot cross the opposite edge (size stays positive, ≥ `MIN_ITEM_SCALE`);
   - edge handles are hit within the 44px screen-space radius before the interior move gesture, and only for cutouts and decal solids (rasters keep corner-only resizing);
   - decal solids hit-test, move, corner-scale, rotate, wheel-scale, and respond to keyboard like rasters.
2. Extend `footprintGeometry` to return `edgeHandles: { left, right, top, bottom }` midpoints.
3. Make `editableTransform` return `layer.transform` for solids with `placement: "decal"` (pattern solids stay null). Use a 1×1 source so `scaleX`/`scaleY` read as pixel width/height. Include decal solids in `hitLayerId`, wheel handling, and keyboard handling.
4. Add an `edge` gesture kind storing the edge id, start center, rotation, and start half-sizes. Convert the pointer into the item's local frame; the dragged edge's new half-size is its signed local coordinate clamped to a small positive minimum; shift the center by half the size change along the local axis and rotate back to canvas space; patch `positionX/positionY` plus `scaleX` or `scaleY`. Route the patch through the existing cutout/transform dispatch mapping.
5. Extend hit-testing order: rotate handle → scale handle → edge handles (only for cutout and decal solid geometry) → interior.
6. Run:

   ```bash
   npm run test:browser -- tests/browser/gestures.test.ts
   npm run typecheck
   npm run lint
   ```

7. Commit: `feat: drag rectangle edges directly`

## Task 3: Render side handles and the Color selection label

**Files:**

- Modify: `src/editor/ui/workspace.tsx`
- Modify: `src/editor/ui/editor-screen.tsx`
- Test: `tests/browser/ui.test.ts`
- Test: `tests/browser/gestures.test.ts`

### Steps

1. Add failing browser tests: selecting a color rectangle or cutout draws four side-handle marks at the edge midpoints in addition to the existing outline, corner handle, and rotation handle; selecting a raster does not add side handles; an old pattern solid keeps its axis-aligned selection rectangle.
2. Add failing UI tests: a selected decal solid shows a **Color** label with **More** instead of the placement segmented control; a pattern solid keeps the segmented control; cutouts keep the **Cut Out** label.
3. In `workspace.tsx`, mirror the editable kinds in `itemFootprint` (solid with `placement: "decal"`, 1×1 source) and draw four compact side handles for cutouts and decal solids; keep the pattern-solid axis-aligned rectangle.
4. In `editor-screen.tsx`, branch the selection bar: decal solid → `Color` label styled like the cutout label + More.
5. Run:

   ```bash
   npm run test:browser -- tests/browser/ui.test.ts tests/browser/gestures.test.ts
   npm run typecheck
   npm run lint
   ```

6. Commit: `feat: show side handles and color label`

## Task 4: Rework the More sheet and update docs

**Files:**

- Modify: `src/editor/ui/sheets.tsx`
- Modify: `src/styles.css`
- Modify: `README.md`
- Test: `tests/browser/gestures.test.ts`
- Test: `tests/browser/ui.test.ts`

### Steps

1. Add failing browser tests:
   - Cut Out More shows Left/Right, Up/Down, Turn, Size and no Wide/Tall;
   - color-rect More shows those four plus See-through with pixel semantics (Size reads the average of pixel width/height; committing Size applies one ratio to both);
   - pattern-solid More keeps only See-through; raster More is unchanged including crop fields;
   - invalid geometry values are rejected;
   - at phone portrait size the More sheet fits with Done reachable and no internal scrolling.
2. Update the existing cutout-draw test that asserts Wide/Tall fields.
3. Field semantics: cutout and decal solid read/write their own geometry (cutout from `rect`, decal solid from `transform` in pixels); `Size` commits a uniform ratio; See-through continues to commit opacity. Route decal-solid commits through `patch-transform`.
4. Make `.more-form` a compact two-column grid and remove the sheet's internal scroll so Done is always visible.
5. Update `README.md` (and the design doc's schema section only if it is stale) to describe the color-rectangle flow: **Add → Colors → tap a swatch → drag edges/corner, rotate → Done**.
6. Run:

   ```bash
   npm run test:browser -- tests/browser/gestures.test.ts tests/browser/ui.test.ts
   npm run typecheck
   npm run lint
   ```

7. Commit: `feat: compact more sheet for rectangles`

## Task 5: Verify journeys and full gates

**Files:**

- Modify: `tests/browser/projects.test.ts`
- Modify if needed: `tests/e2e/mobile-layout.spec.ts`, `tests/e2e/smoke.spec.ts`, `scripts/test-pwa.mjs`

### Steps

1. Add a failing projects-journey test: create a color rectangle, resize it by edge drag, save, reopen, and verify the identical transform and composited pixels; include an old `pattern` solid fixture reopened unchanged (coverage, recolor, non-transformable).
2. Extend mobile e2e journeys if they assert More-sheet fields or selection-bar controls that changed.
3. Run the complete gate set:

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

4. Commit: `test: cover direct rectangle journeys`

## Task 6: Independent implementation review and corrections

**Files:**

- Review: all commits since `2017fc5`
- Modify: only files required by validated findings
- Test: add a regression test for every accepted behavioral finding

### Steps

1. Use the `review-with` skill to have DeepSeek and Qwen independently review the implementation diff read-only, with prioritized findings.
2. Validate each finding against source and tests. Reject speculative or scope-expanding suggestions; add a failing regression test before every accepted code correction.
3. Correct valid findings and rerun the narrow test first, then the complete verification suite.
4. Commit: `fix: address rectangle editing review findings` only if corrections are needed.
5. Re-review once with the same models; proceed only when clean.

## Task 7: Push, deploy, and public smoke test

**Files:**

- Inspect: `.github/workflows/ci.yml`, `.github/workflows/deploy-pages.yml`

### Steps

1. Confirm the worktree is clean and run the full gate set from Task 5 once more.
2. Push `main` to `origin` as explicitly authorized.
3. Monitor the `CI` workflow for the pushed SHA with `gh run`. If it fails, reproduce, fix test-first, recommit, and push again.
4. Monitor the dependent Pages deployment workflow through success.
5. Open the public GitHub Pages site and smoke test at desktop, mobile portrait, and mobile landscape: create a color rectangle, drag each edge, corner-scale, rotate, recolor via swatch, open More, undo/redo, save/reopen, export PNG.
6. Report pushed commit SHA, CI run, Pages deployment result, public URL, and automated test totals.

## Acceptance checklist

- Tapping a swatch with nothing selected creates one centered color rectangle at 40% × 30%; with a solid selected it only recolors.
- Color rectangles and Cut Outs show the outline, four side handles, corner handle, and rotation handle; edge drags fix the opposite edge and work while rotated.
- Every handle has a 44×44 CSS-px touch target and wins over interior drags.
- Cancel restores geometry; each completed drag is exactly one undo entry.
- More for Cut Outs and color rects shows Left/Right, Up/Down, Turn, Size (+ See-through for colors) in a two-column sheet with Done visible and no internal scroll at phone sizes; raster controls are unchanged.
- Old saved full-clothing colors reopen unchanged, keep recolor, and stay non-directly-transformable.
- Save/open round trip (including offline) and PNG export preserve color rectangles.
- Typecheck, lint, unit, browser, bundle, PWA, and e2e (portrait + landscape) gates are green.
- No new dependency, schema version, or server state; CI and Pages deployment succeed for the pushed SHA.
