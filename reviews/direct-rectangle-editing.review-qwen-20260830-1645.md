# Review: direct-rectangle-editing.review-qwen-20260830-1645.md

| field | value |
|---|---|
| reviewer | `qwen` |
| backend | `opencode` |
| model | `openrouter/qwen/qwen3.8-max` |
| workdir | `/home/v/Documents/Dev/rbx-fashion` |
| write access | none (read-only, enforced) |
| started | 2026-08-30T16:45:33+02:00 |
| finished | 2026-08-30T16:55:52+02:00 |
| exit code | 0 |

---

VERDICT: REJECT

- BLOCKER — src/editor/ui/gestures.ts:564-578 — Edge resize has a 2× gain: with pointer local coordinate `p` along the dragged axis (relative to gesture-start center) and starting half-size `s`, the code computes `half = max(minHalf, p)` → `scaleX = 2p` and center shift `p − s`. The opposite edge does stay fixed, but the center shifts by the FULL drag distance instead of half, so the dragged edge moves at 2× pointer speed and overshoots the finger by exactly the drag distance — violating the normative rule in docs/2026-08-30-direct-rectangle-editing-design.md:33 ("changes one dimension and shifts the center by half the dragged distance"). Verified numerically: tests/browser/gestures.test.ts:1046 drags the right handle of a 400×300 rect (center 256, half 200) from x=456 to x=506 and expects `scaleX: 500, positionX: 306` (the buggy math); the geometry that keeps the opposite edge at x=56 AND the dragged edge under the pointer is `scaleX: 450, positionX: 281`. The suite is green only because every expectation encodes the same bug (gestures.test.ts:1046-1049, 1078, 1092, 1107, 1121-1123, 1138, 1146-1147). The cutout path inherits the same gain via `cutoutPatchFromTransformPatch` (mapping itself is consistent). — Fix: in the edge branch compute `width = max(MIN_ITEM_SCALE, p + startHalf)` and shift `= (p − startHalf) / 2` along the local axis (analogous for Y), then rotate the shift back with the stored `rotationDeg`; i.e. for right/left: `patch.scaleX = Math.max(MIN_ITEM_SCALE, direction * localX + gesture.startHalfWidth)`, `shiftX = direction * (direction * localX − gesture.startHalfWidth) / 2`. Then update the encoded expectations: 1046 → {scaleX 450, positionX 281}; 1047 → {scaleX 430, positionX 241}; 1048 → {scaleY 330, positionY 241}; 1049 → {scaleY 350, positionY 281}; 1078 → {width 460, centerX 281}; 1092 → {scaleX 450, positionX 281}; 1107 → {width 440, centerY 276}; 1138 → scaleX 460; 1146-1147 → {scaleX 444, positionX 278}. Note the clamp test at 1113-1127 must be re-aimed: with correct math a drag to x=100 yields width 44 (no clamp); clamping now triggers only when the pointer passes the opposite edge (x < 56), where the clamped result still lands at scaleX 0.01 / positionX ≈ 56.005.

- MINOR — src/editor/ui/gestures.ts:74-79 (footprintGeometry) — Edge handles are the only handles not clamped to the inset-16 canvas bounds (scale/rotate handles are clamped precisely to stay reachable). The move gesture has no bounds clamp, so a rect dragged past the canvas edge carries its edge handle dots off-canvas; beyond the 22px screen tolerance they become ungrabbable, and per-axis resize for that dimension is then only possible via corner scale (which is uniform). — Fix: clamp `edgeHandles` positions the same way as `scaleHandle`; because a clamped handle no longer sits on the true edge, also store the pointer's local coordinate at gesture start (`p0`) in the edge gesture and use `p − p0 + startHalf` as the width term in applyItemMove so the grab doesn't jump the rect (with unclamped handles `p0 === startHalf` and behavior is unchanged).

Assumptions and gaps
- I could not execute anything in this session (no shell): typecheck, lint, tests, build, and the git range d5a8ae7→71d839e were not independently re-run; I reviewed the current worktree sources and cross-checked the blocker algebraically against the tests' own numeric expectations.
- src/editor/state.ts:534-550 (`patch-transform` reducer) accepts pattern solids; no UI path dispatches it (More sheet hides transform fields, gestures/wheel/keyboard gate on `directlyEditable`) and pattern rendering ignores transform, so I treated it as inert defense-in-depth rather than a finding.
- Verified clean, no findings: hit order rotate→corner→edge→move; raster exclusion from edge handles; 44px target conversion (HANDLE_SCREEN_RADIUS=22 / (rect.scale·viewport.scale)); wheel/keyboard gating (decal solids in, pattern solids out); add-item/duplicate/undo-redo/cap; no UI path resurrects full-clothing solids; More sheet field visibility, px Size display, ratio round-trip, nonce resync; compositor and archive back-compat unchanged.
- Not audited line-by-line: styles.css, README, e2e scripts, and non-normative design-doc prose.
