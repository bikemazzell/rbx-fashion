# Review: direct-rectangle-editing.review-deepseek-20260830-1716.md

| field | value |
|---|---|
| reviewer | `deepseek` |
| backend | `opencode` |
| model | `deepseek/deepseek-v4-pro` |
| workdir | `/home/v/Documents/Dev/rbx-fashion` |
| write access | none (read-only, enforced) |
| started | 2026-08-30T17:16:13+02:00 |
| finished | 2026-08-30T17:19:39+02:00 |
| exit code | 0 |

---

VERDICT: APPROVE

- MINOR — src/editor/ui/sheets.tsx:342 — `FIELDS.size` is declared `min: 1, step: 1`, but the edge/corner drag paths clamp to `MIN_ITEM_SCALE = 0.01`, so a decal solid or cutout shrunk uniformly produces an average size < 1 px. `fieldValue` floors the display to `Math.max(1, …)` (sheets.tsx:373, 398), so no below-min value is ever shown, but `step: 1` still blocks re-entering the sub-1px fractional sizes the drag path already produces (e.g. a 0.5px-wide rect). Fix: set `min: 0.01, step: 0.5` for the pixel-semantic size field; `commitField` already guards `value > 0` so nothing below 0.01 is committable.

## Assumptions and gaps

- I could not execute the suite (read-only). I rely on the prompt's stated-green results (typecheck/lint/unit 221/browser 170/build/bundle/PWA/e2e 9) and verified by source reading plus hand-computed math against the test expectations embedded in the diff.
- I did not inspect the e2e/PWA test sources, bundle-budget scripts, or `tests/browser` harness/fixture definitions (`DECAL_DEFAULT`, `createHarness`) beyond the hunks in the diff, so test-helper correctness outside the shown hunks is unverified.
- Every finding from the three embedded prior reviews is either already fixed in the current worktree or a false positive: the round-1 qwen 2×-gain BLOCKER is wrong (edge math is 1:1, center shifts half along the rotated axis — verified against gestures.test.ts:1046-1049 {scaleX:450, positionX:281}, the 90°-rotated cutout {width:440, centerY:276}, and the min-clamp {scaleX:0.01, positionX:56.005}); the edge-handle-clamping MINOR is fixed (gestures.ts:80-88 clamps all four edge handles via `clampPoint`, and `startLocal` is pointer-derived so a clamped handle doesn't jump); `set-placement` now rejects all non-rasters (state.ts:523-527) and `patch-transform` rejects non-decal solids (state.ts:538-545); the Size-below-min display is floored at 1 (sheets.tsx:373, 398).
- The diff header labels HEAD as 71d839e, but the branch includes a later commit (46adc1b "fix: track pointer exactly during edge drags") whose `startLocal` tracking and updated test expectations are present in the embedded diff content, so this review covers the actual current state.
