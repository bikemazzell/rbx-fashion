# Review: ellipse-cutouts.review-deepseek-20260901-1020.md

| field | value |
|---|---|
| reviewer | `deepseek` |
| backend | `opencode` |
| model | `deepseek/deepseek-v4-pro` |
| workdir | `/home/v/Documents/Dev/rbx-fashion/.worktrees/ellipse-cutouts` |
| write access | none (read-only, enforced) |
| started | 2026-09-01T10:20:41+02:00 |
| finished | 2026-09-01T10:25:04+02:00 |
| exit code | 0 |

---

IMPORTANT - src/editor/ui/gestures.ts:762-767 - `onPointerCancel` clears the cutout draft (`cutoutDraw = null`) and the overlay via `onCutoutDraft(null, null)`, but never clears the chosen shape (`drawingCutoutShape`). The gesture controller has no cancel-cutout callback, so after a `pointercancel` the app stays in draw mode (instruction bar + Cancel remain visible) while the draft is gone. This contradicts the settled design (`docs/2026-09-01-ellipse-cutouts-design.md` line 88: pointer cancellation clears both draft and chosen shape) and is untested — no test exercises the `cutoutDraw !== null` branch of `onPointerCancel`. Fix: add an `onCancelCutout` callback to `GestureControllerOptions`, wire `Workspace` to `props.onCancelCutout`, and invoke it in `onPointerCancel` when `cutoutDraw` was active (or explicitly document the deviation in the design doc).

MINOR - src/editor/ui/gestures.ts:660-662 - the cutout branch of `onPointerDown` early-returns on `if (cutoutDraw !== null) return;` without re-validating `drawingCutout()`/`cutoutShape()`. In a contrived multitouch sequence (Escape/tab-change mid-drag clears `drawingCutoutShape`, then re-entering draw mode and issuing a second pointerdown before the original pointerup is delivered), the new pointerdown is silently dropped because stale `cutoutDraw` is still non-null. The Move/Up handlers already clear via the `!drawingCutout?.() || cutoutShape?.() !== cutoutDraw.shape` guard, so it self-heals on pointerup; onPointerDown does not. Fix: mirror the mismatch guard in `onPointerDown` (if `cutoutShape() !== cutoutDraw.shape`, reset `cutoutDraw` and clear the draft before proceeding).

VERDICT: APPROVE WITH CHANGES
