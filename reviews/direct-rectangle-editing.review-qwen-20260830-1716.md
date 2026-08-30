# Review: direct-rectangle-editing.review-qwen-20260830-1716.md

| field | value |
|---|---|
| reviewer | `qwen` |
| backend | `opencode` |
| model | `openrouter/qwen/qwen3.8-max` |
| workdir | `/home/v/Documents/Dev/rbx-fashion` |
| write access | none (read-only, enforced) |
| started | 2026-08-30T17:16:14+02:00 |
| finished | 2026-08-30T17:26:24+02:00 |
| exit code | 0 |

---

All scrutiny areas verified against worktree source. Final review:

VERDICT: APPROVE

- SEVERITY MINOR - src/editor/ui/sheets.tsx:460-462 - Committing the Size field with the exact value already displayed is not a no-op for fresh Color rectangles: default T-Shirt solid is scaleX 205 / scaleY 154, average 179.5, display rounds to 180 (line 398); re-entering 180 computes ratio = 180/179.5 ≈ 1.00279, silently growing both dimensions ~0.28% and creating an undo entry for an apparent no-op edit. Self-stabilizes after one commit (average becomes exactly 180), and the identical pattern exists pre-feature for cutouts (lines 432-439), so this is not merge-blocking - Specific fix: compute the ratio against the same rounded value shown, i.e. `const average = Math.max(1, Math.round((transform.scaleX + transform.scaleY) / 2))` (and symmetrically for the cutout branch), so committing the displayed value is an exact fixed point.

Verified clean in current source (no findings):

- Edge-resize math (gestures.ts:570-606): inverse-rotate to local frame, width = 2·startHalf + dir·(localX − startLocal), opposite edge fixed, center shifts half the delta along the rotated axis, MIN_ITEM_SCALE clamp with matching position shift; hand-computed all four axis drags, the 90° cutout case ({width:440, centerX:256, centerY:276}) and the min-clamp case (56.005) — all match the committed test expectations.
- startLocal is taken from the actual pointer (gestures.ts:377-384), so clamped handles produce no grab-jump; hit order rotate → corner scale → edge → interior preserved (gestures.ts:330-419); raster excludes edge handles; wheel (770-806) and keyboard (808-866) gate on directlyEditable, which admits decal solids and rejects pattern solids; 44px targets via HANDLE_SCREEN_RADIUS=22 / (canvas scale · viewport scale).
- State: set-placement raster-only (state.ts:525), patch-transform rejects cutouts and non-decal solids (539-544) with patch validation, add-item validates transform and hardcodes placement "decal" (620-637), duplicate preserves legacy placement/transform, commit guarded by deepEquals, undo blocked mid-gesture.
- Back-compat: legacy pattern solids render via drawSolidPattern unchanged (compose.ts:331), selectionRect falls back to patternBounds (workspace.tsx:69-71), itemFootprint returns null for them, onPlacement early-returns for non-rasters, segmented control shows Fill Clothing active with no clickable resurrection path; recolor works via set-color for both placements.
- Compositor renders decal solids through transform (fillSolidCentered, compose.ts:186-194, 218); More-sheet field visibility, Crop group raster-only, two-column grid, and nonce resync all match the settled spec.

Assumptions and gaps:

- No shell access in this session: typecheck, lint, unit/browser/e2e suites, build/bundle budgets, and PWA offline behavior could not be executed; verification is by source reading and hand-computed math against the committed test expectations (tests/browser/gestures.test.ts:1042-1151, tests/unit/editor-state.test.ts:690-722).
- I could not confirm the git ref: the worktree additionally contains reviews/direct-rectangle-editing.review-{deepseek,qwen}-20260830-1716.md, which the embedded diff (base d5a8ae7 → HEAD 514fad3) does not account for; I did not read those files to keep this review independent.
- Touch-target ergonomics (44px) and handle rendering were verified arithmetically, not on a device; the known inherent limits (legacy pattern solids not canvas-selectable; very short items' edge handles encroaching on the interior move area) were treated as settled per the brief.
