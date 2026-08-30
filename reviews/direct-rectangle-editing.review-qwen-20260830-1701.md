# Review: direct-rectangle-editing.review-qwen-20260830-1701.md

| field | value |
|---|---|
| reviewer | `qwen` |
| backend | `opencode` |
| model | `openrouter/qwen/qwen3.8-max` |
| workdir | `/home/v/Documents/Dev/rbx-fashion` |
| write access | none (read-only, enforced) |
| started | 2026-08-30T17:01:15+02:00 |
| finished | 2026-08-30T17:12:15+02:00 |
| exit code | 0 |

---

I have the full review brief and embedded diff. Now verifying the actual worktree state against it — reading the changed sources and git ref.
The worktree matches the embedded diff in `gestures.ts`, and I've manually verified the edge-resize calculations (1:1 pointer tracking, fixed opposite edge, correct rotation axis, correct clamp). Currently compressing the brief, then reading the remaining modified sources.
Now reading the remaining changed sources.
I've confirmed that state.ts and workspace.tsx match the diff. Next up: sheets.tsx, designer-app.tsx, and editor-screen.tsx.
I've reviewed all four core sources and cross-checked them against the brief's priority list. Now I'll compress these raw reads and then check the remaining files (editor-screen, styles, tests, git log).
I found one post-diff commit in the git log that matches the current state, so I'll note that in gaps. Now I'm checking the selection-bar logic for pattern-solid handling.
VERDICT: APPROVE WITH CHANGES

- SEVERITY MINOR - src/editor/ui/sheets.tsx:342 (vs 372-373, 396-399) - `FIELDS.size.min` is 1, but a decal solid or cutout dragged down to `MIN_ITEM_SCALE` (0.01) displays `Math.round(0.01)` = "0" in its own Size field, a value below the field's declared minimum. `commitField`'s `value > 0` guard makes committing 0 a no-op, so no invalid state results — cosmetic, but flagged in the prior deepseek round and still unfixed. Fix: clamp the display value (`Math.max(1, ...)`) in `fieldValue` for the cutout and decal-solid size cases, or set the field's min to 0.
- SEVERITY MINOR - src/editor/state.ts:534-550 (and 523-533) - the `patch-transform` and `set-placement` reducers accept any non-cutout layer, including legacy pattern solids. Currently unreachable from UI (gestures gate on `directlyEditable`/`editableTransform`; More sheet exposes only See-through for pattern solids; `onPlacement` is raster-only at designer-app.tsx:557), so there is no live failure — but a future caller could silently transform a legacy full-clothing solid, contradicting settled decision 2. Fix: guard both reducers to reject solid layers with `placement !== "decal"`.

Verified clean against the scrutiny priorities: edge-resize math is 1:1 pointer-tracking with grab offset preserved via `startLocal`, opposite edge fixed, min-clamp correct (hand-checked against all six drag test expectations including the rotated-90° case); the round-1 2×-gain BLOCKER is fixed in both code and tests. Hit order rotate→corner→edge→interior intact, rasters excluded from edge handles, 44px conversion correct (`22 / (rect.scale * viewport.scale)`), wheel/keyboard include decal solids and exclude pattern solids. State layer: add-item validates and hardcodes `decal`, undo/redo identity via deepEquals commit guard, duplicate/copy preserve placement+transform, cap enforced, no UI path resurrects full-clothing solids (placement controls disabled for solids in editor-screen.tsx:95-204). More sheet px-vs-percent semantics, ratio commit, per-kind field visibility, and nonce resync all correct. Edge handles are bounds-clamped (gestures.ts:80-88), resolving deepseek's other MINOR.

Assumptions and gaps

- No shell access in this session: typecheck, lint, unit/browser tests, build, PWA, and e2e results were taken as claimed-green from the brief; I verified by source reading and hand-computed math only.
- The diff header labels HEAD as 71d839e, but the branch sits one commit ahead at 46adc1b ("fix: track pointer exactly during edge drags"). The embedded diff content matches the worktree byte-for-byte (checked gestures.ts and test expectations), so this review covers the actual current state; the header is stale.
- Legacy pattern solids are not canvas-tap-selectable (`directlyEditable` excludes them); they remain reachable via the Items list, matching pre-feature behavior — noted, not flagged.
- Items whose short side is below 44 CSS px cannot be interior-drag-moved (edge-handle tolerance covers the whole item) — an inherent consequence of the settled hit order and 44px targets; keyboard arrows remain as a desktop alternative. Noted, not flagged.
- Compositor left unchanged per settled decision 5 and was not audited; README/docs changes were not reviewed in depth.
