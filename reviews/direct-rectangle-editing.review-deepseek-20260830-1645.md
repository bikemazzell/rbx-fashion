# Review: direct-rectangle-editing.review-deepseek-20260830-1645.md

| field | value |
|---|---|
| reviewer | `deepseek` |
| backend | `opencode` |
| model | `deepseek/deepseek-v4-pro` |
| workdir | `/home/v/Documents/Dev/rbx-fashion` |
| write access | none (read-only, enforced) |
| started | 2026-08-30T16:45:33+02:00 |
| finished | 2026-08-30T16:51:56+02:00 |
| exit code | 0 |

---

I've completed a thorough review of the diff against the design/implementation docs and the surrounding source. Findings below.

## VERDICT: APPROVE

The rotated edge-resize math, hit-test ordering, state validation/back-compat, and More-sheet semantics are all correct. I traced the edge-gesture algebra by hand against the test expectations (including the rotated cutout and min-clamp cases) and it is sound. The findings below are polish items, not blockers.

### Rotated edge-resize math (verified correct)

`applyItemMove` (src/editor/ui/gestures.ts:552-583) converts the pointer to the item's local frame with the inverse rotation (`localX = dx·cos + dy·sin`, `localY = -dx·sin + dy·cos`), then shifts the center by half the size change along the local axis and rotates the shift back via `map`'s forward transform. The opposite edge stays fixed because the center shift exactly compensates the half-size change (e.g. left drag: `newCenter = startHalf − half`, so right edge = `startHalf − half + half = startHalf`). The `minHalf = MIN_ITEM_SCALE/2` clamp prevents a dragged edge from crossing the center (which is always on the near side of the opposite edge). The cutout↔solid mapping (`cutoutPatchFromTransformPatch` mapping `scaleX→width`, `positionX→centerX`) is consistent with both footprint adapters (`cutoutFootprint` uses `scaleX/scaleY = 1` with source `rect.width/height`; `solidFootprint` uses source `1×1` so `scaleX/scaleY` are pixel dims).

### Hit-testing (verified correct)

`startItemInteraction` preserves rotate → corner-scale → edge → interior order; rasters are excluded from edge handles via the `selectedLayer.kind !== "raster"` guard. Pattern solids never reach any direct-manipulation branch because both `editableTransform` returns null and `itemFootprint` returns null for them. `handleRadiusCanvasPx()` is unchanged. Wheel/keyboard paths gate on `directlyEditable`, which excludes pattern solids.

### State/back-compat (verified correct)

`addItem` hardcodes `placement: "decal"` and validates `isTransformValid`; the only solid-creation call site is `addSolid` (designer-app.tsx:336-343). `onPlacement` (designer-app.tsx:551-583) guards `layer.kind !== "raster"`, so no UI path can set a solid's placement to `pattern` (confirmed: `set-placement` is only dispatched there). Duplicate preserves the source placement, so old pattern solids stay pattern. No resurrection path exists.

### More sheet (verified correct)

`fieldValue`/`commitField` `size` uses pixel semantics for decal solids (average px, uniform-ratio commit using the raw un-rounded average, so round-trip is exact) vs percent for rasters; the nonce-based useEffect resync is unchanged and correct. Field visibility matches the design for all four kinds.

---

- **MINOR** - src/editor/ui/gestures.ts:74-79 (and src/editor/ui/workspace.tsx:271-276) - Edge handle points are emitted directly from `map(...)` and are *not* clamped to the canvas inset, unlike `scaleHandle`/`rotateHandle` (`clampPoint` with `inset: 16`). Since the design explicitly allows a color rectangle to extend beyond the canonical canvas ("A color rectangle may extend beyond the canonical canvas"), the midpoint handle on an off-canvas edge becomes unreachable, contradicting the "Selection handles remain reachable at canvas boundaries" guarantee. Fix: clamp each `edgeHandles` point to the same inset bounds (or a canvas-bounds clamp) in `footprintGeometry`, mirroring the corner/rotate handles.

- **MINOR** - src/editor/ui/sheets.tsx:342 vs 397-399 - The `Size` field declares `min: 1` but a decal solid/cutout dragged to `MIN_ITEM_SCALE` (0.01) yields an average that rounds to `"0"`, so the field displays a value below its own `min` (and blocks re-entering sub-1px sizes the drag path permits). Fix: lower the `Size` `min`/`step` for pixel-semantic fields (e.g. `min: 0.01, step: 0.5`) or floor the displayed average at `1`.

## Assumptions and gaps

- I could not run the verification suite (read-only access); I rely on the prompt's stated green results (typecheck/lint/unit 220/browser 170/build/PWA/e2e 9) and on the embedded test expectations, which I cross-checked against the source rather than executing.
- I did not inspect the e2e/PWA test sources, bundle-budget scripts, or `tests/browser` fixture definitions (`DECAL_DEFAULT`, `createSession`, harness helpers) beyond what the diff exposes, so test-helper correctness outside the shown hunks is unverified.
- The `.field-group` rule added at src/styles.css (`grid-column: 1 / -1`) is a global (unscoped) selector; it is only used inside `.more-form` today, so it is harmless, but I did not exhaustively confirm no other `.field-group` usage exists outside the More sheet grid.
