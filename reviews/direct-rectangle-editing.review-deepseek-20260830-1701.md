# Review: direct-rectangle-editing.review-deepseek-20260830-1701.md

| field | value |
|---|---|
| reviewer | `deepseek` |
| backend | `opencode` |
| model | `deepseek/deepseek-v4-pro` |
| workdir | `/home/v/Documents/Dev/rbx-fashion` |
| write access | none (read-only, enforced) |
| started | 2026-08-30T17:01:15+02:00 |
| finished | 2026-08-30T17:06:14+02:00 |
| exit code | 0 |

---

I'll review this feature independently. Let me read the actual source files, starting with the critical edge-resize math and the tests that verify it.
Now let me read the state, sheets, and app files to verify the remaining areas.
Let me read the remaining changed UI files to complete verification.
Let me verify a couple of remaining details: the `.field-group` CSS scope and the editor-screen selection bar logic.
I've completed an independent review, tracing the edge-resize algebra against the tests and verifying each scrutiny area. Both embedded prior reviews contain factual errors I confirmed against the source.

VERDICT: APPROVE WITH CHANGES

- MINOR — `src/editor/ui/sheets.tsx:342` — The `Size` field is declared `min: 1, step: 1`, but a decal solid (and a cutout) can legitimately reach sub-1px extents: the edge/corner drag paths clamp to `MIN_ITEM_SCALE = 0.01`, so a color rectangle shrunk uniformly to near-zero yields an average that `Math.round` collapses to `"0"`, a value below the input's own `min` (and `step: 1` blocks re-entering the fractional sizes the drag path already produces). Fix: for the pixel-semantic `size` field use `min: 0.01, step: 0.5` (or floor the displayed average at `1`), since the commit path already accepts any `value > 0`.

- MINOR — `src/editor/state.ts:523-533` — The `set-placement` reducer only rejects `current.kind === "cutout"`; it still accepts solids. No UI path dispatches it (the sole caller `onPlacement` at `designer-app.tsx:557` guards `layer.kind !== "raster"`), so it is inert today, but the "old pattern solids stay recolor-only / non-transformable" invariant is enforced only in the UI layer, not structurally. Flipping a pattern solid to `decal` here would simultaneously change its compositing (full-clothing fill → rectangle) and make it directly transformable. Fix: change the guard to `current.kind !== "raster"` so placement mutation is impossible for solids regardless of future callers.

## Assumptions and gaps

- I could not execute the suite (read-only); I rely on the prompt's stated green results and cross-checked the test expectations against the source by hand.
- The edge-resize math in `applyItemMove` (`gestures.ts:570-606`) is correct: for a right-edge drag `width = 2·startHalfWidth + (localX − startLocal)` and `shiftX = width/2 − startHalfWidth`, so the dragged edge tracks the pointer 1:1, the opposite edge stays fixed, and the center shifts by exactly half the drag along the rotated axis. The actual expectations at `gestures.test.ts:1046-1049` are `{scaleX:450, positionX:281}` etc. — not the `500/306` claimed by the embedded qwen review, which is a false positive (that reviewer read a `2×` gain that does not exist). The rotated cutout case (`1107`: width 440, centerY 276) and the min-clamp case (`1121-1122`: scaleX 0.01, positionX 56.005) also verify exactly.
- The embedded deepseek review's claim that edge handles are *not* clamped is also wrong: `footprintGeometry` clamps all four `edgeHandles` via `clampPoint` (`gestures.ts:80-88`), and `startLocal` is computed from the pointer (not the handle), so a clamped off-canvas handle does not cause a grab jump.
- I did not inspect e2e/PWA test sources, bundle-budget scripts, or the `createHarness`/`DECAL_DEFAULT` fixture definitions beyond what the diff exposes, so harness-helper correctness outside the shown hunks is unverified.
- The `.field-group { grid-column: 1 / -1 }` global rule is confirmed single-use (only the Crop `<h3>` in `sheets.tsx:568`).
