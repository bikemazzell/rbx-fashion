# Review: roblox-technical-preflight.review-deepseek-20260825-2042.md

| field | value |
|---|---|
| reviewer | `deepseek` |
| backend | `opencode` |
| model | `deepseek/deepseek-v4-pro` |
| workdir | `/home/v/Documents/Dev/rbx-fashion` |
| write access | none (read-only, enforced) |
| started | 2026-08-25T20:42:01+02:00 |
| finished | 2026-08-25T20:49:49+02:00 |
| exit code | 0 |

---

# Review: Roblox Classic-Clothing Editor — Technical Preflight

## Findings

**IMPORTANT** — `preflight:135` vs `preflight:144-146`: full-map panel targeting is contradictory. Line 135 states full-map "is not panel-clipped," but line 146 states "a panel list clips drawing to the union of only those rectangles" as a general rule, and the `Layer` type permits `targetPanels: string[]` on full-map layers. It is unresolved whether a full-map layer may carry a panel list, and if so whether it clips (contradicting "not panel-clipped") or is ignored. Fix: state explicitly that full-map layers always render to the complete canonical canvas and that `targetPanels` is forced to `"all"` (or rejected) for them.

**MINOR** — `preflight:193-198` `PreviewFaceBinding.bodyPart` is a freeform `string` with no defined vocabulary, and one `atlasRect`/`uv` per binding. R15 requires the single 585x559 torso/limb to be subdivided (UpperTorso/LowerTorso, upper/lower limb, hands/feet), so multiple bindings must share a face with sub-rect `atlasRect`s — but neither the bodyPart naming nor sub-rectangle representation is documented. Fix: define the bodyPart vocabulary and clarify the multiple-bindings-per-face convention.

**MINOR** — `preflight:124` `scaleX`/`scaleY` are called "dimensionless" but are actually dest-px-per-source-px (disambiguated only later by the full-map formula `scaleX = canvasWidth / cropWidth`). Fix: state the unit explicitly.

**MINOR** — `preflight:183-187,222` the seams `reversed` flag has no edge-direction convention. An implementer cannot use `reversed` without inventing the direction semantics. Fix: define the forward traversal convention (e.g., clockwise around a panel).

**MINOR** — `preflight:114-119` the transform matrix `T(pos)*R*S*T(-cw/2,-ch/2)` is presented as math (column-vector, right-to-left). Canvas 2D `transform()` post-multiplies, so the literal call order `translate(position); rotate(); scale(); translate(-cw/2,-ch/2)` is not stated. Fix: add the Canvas call sequence.

**MINOR** — `design:80` "slightly expanded transparent clothing-overlay meshes" — the expansion offset/thickness is undefined and appears nowhere in either doc. Fix: specify the inflation distance or make it a calibration parameter.

## Assumptions and gaps

- Absolute atlas x/y positions were verified for internal consistency (uniform 2px gutters, correct garment-rect collapse, valid cube unfoldings) and sizes against public references, but not against the actual template pixels — the preflight's SHA-256 hashes pin the source, which I did not re-download.
- FBX UV = body-texture (not a 585x559 projection) claim could not be inspected.
- Claim that orientation matrices are currently identity (no rotation in template faces) could not be inspected.
- Gemini model ID `gemini-3.1-flash-image` (`design:216`) not verified (out of scope).

## VERDICT

APPROVE WITH CHANGES.
