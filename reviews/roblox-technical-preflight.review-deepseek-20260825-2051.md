# Review: roblox-technical-preflight.review-deepseek-20260825-2051.md

| field | value |
|---|---|
| reviewer | `deepseek` |
| backend | `opencode` |
| model | `deepseek/deepseek-v4-pro` |
| workdir | `/home/v/Documents/Dev/rbx-fashion` |
| write access | none (read-only, enforced) |
| started | 2026-08-25T20:50:34+02:00 |
| finished | 2026-08-25T20:55:38+02:00 |
| exit code | 0 |

---

- BLOCKER - `docs/roblox-technical-preflight.md:135` - The full-map default scale uses an undefined variable: `scaleX = canvasWidth / cropWidth`. `crop` is defined as normalized `[0,1]` (line 100-106), so reading `cropWidth` as `crop.width` yields `585/1 = 585` for a full crop, directly contradicting "A canonical-size source defaults to scale 1" in the same sentence. Fix: define `cropWidth := crop.width * decodedSourceWidth` (and `cropHeight := crop.height * decodedSourceHeight`) and state the full-map default is computed in source-pixel space.

- IMPORTANT - `docs/roblox-technical-preflight.md:205-207,215` - `TemplateRegistryEntry.garment: "shirt" | "pants"` and the literal types `width: 585; height: 559` cannot express a T-shirt entry. This contradicts the preflight's own claim to lock "the three MVP garment types" (line 11), the T-shirt target definition (line 54), and the design doc's `GarmentType = "tshirt" | "shirt" | "pants"` (`roblox-clothing-designer-design.md:93`). `PreviewFaceBinding` also has no way to represent the single `torso-graphic` front-torso binding versus six-face wrapping. Fix: add `"tshirt"` to the union, replace the literal dims with `width: number; height: number`, and either add a distinct graphic-binding shape or document how `face`/`bodyPart` degrade for T-shirts.

- IMPORTANT - `docs/roblox-technical-preflight.md:94,183-188` - The "exact panel registry" table (line 69) locks only rectangles. The `seams` records and `atlasToGarment` orientation matrices — required for the "seamless pattern evaluation" promised at line 71 and for correct wrapping — are described ("store explicit orientation matrices and seam records") but never enumerated. A task-by-task plan cannot encode seam data or per-face reversal/rotation it has not been given. Fix: add a locked seam table (edge pairs with `reversed`) and the per-panel `atlasToGarment` affine values (or explicitly assert they are all translation-only and give the translation).

- IMPORTANT - `docs/roblox-technical-preflight.md:100-106 vs 112-118` - The transform contract mixes units: crop is normalized (line 100) but the matrix uses "cropped source of width `cw` and height `ch`" in `T(-cw/2, -ch/2)` and `S(scaleX,scaleY)`, which is only coherent if `cw`/`ch` are source-pixel dimensions. The conversion `cw = crop.width * decodedWidth` is never stated, so `scaleX` (dest-pixel per source-pixel) is underdetermined. Fix: state the identity once (cropped source pixel size = normalized crop × decoded source size) and make every subsequent formula reference it.

- MINOR - `docs/roblox-technical-preflight.md:220` - The UV formula hardcodes `x/585, 1 - y/559`, and the T-shirt clause "use 512 for both denominators" is not representable by any field. Fix: derive denominators from `entry.width`/`entry.height`.

- MINOR - `docs/roblox-technical-preflight.md:220` + `roblox-clothing-designer-design.md:80` - The bottom-left UV convention depends on `CanvasTexture` `flipY` behavior, which is never pinned. Fix: state that the compositor canvas is uploaded with `flipY = true` (or otherwise) so the `1 - y/h` flip is unambiguous.

- MINOR - `docs/roblox-technical-preflight.md:71,134` - Decal `positionX/Y` is "atlas coordinates" but pattern is "component garment coordinates"; the default decal position is "center of the current target bounds" without saying whether those bounds are `atlasRect` or `garmentRect`, and the garment→atlas write-back path for pattern evaluation ("does not change export coordinates") is asserted but not specified. Fix: name the coordinate space for every transform field/default and document the garment→atlas inverse-mapping step for pattern export.

- MINOR - `docs/roblox-technical-preflight.md:316 vs 261` - "No Roblox login, upload, marketplace publishing... is introduced by this preflight" is too strong: the calibration gate itself (line 261) requires a human to "Upload the calibration PNGs privately" under a Roblox account. Fix: qualify line 316 as "no login/upload in the product implementation", and explicitly record that the manual release gate requires a reviewer with Roblox Studio and an account.

- MINOR - `docs/roblox-technical-preflight.md:235` - The "64-pixel-per-stud surface proportions" claim is inference from template rectangles, not an official statement; every pinned FBX in the evidence table (lines 30-32) is R15, so R6 has no reference asset at all and is purely calibration-derived. Fix: label the 64px/stud ratio as inference and note R6's basis is the Studio Block Avatar R6 capture only.

Assumptions and gaps

- Absolute correctness of the 18 atlas rectangles is asserted via ZIP/PNG hashes but the derivation method (tool/script/manual transcription, and which labeled template was read) is not documented; the rectangles are internally consistent (2px gutters, all rects within 585x559, torso net 384x256, limbs 256x256) and the 4-across torso net ordering (`right|front|left|back`) plausibly explains the left-margin 165 vs right-margin 30 asymmetry, but this should be independently cross-checked against the actual template image and official face labels, not taken on the hash alone.
- R15 upper/lower torso split: classic shirt torso panels must map across `UpperTorso_Geo` and `LowerTorso_Geo`, but `PreviewFaceBinding.bodyPart` is a single string and the preflight only mentions the split at line 233 without defining the binding shape; deferred to calibration (line 235) but the interface does not anticipate it.
- Preview UV corners cannot be machine-extracted (Roblox does not publish the `ShirtTemplate`/`PantsTemplate` projection, line 17); the `uv` values are necessarily hand-authored and corrected via the screenshot-based calibration. The procedure verifies visually but provides no programmatic UV extraction, so UV "goldens" are only as good as the calibration reviewer.

VERDICT: APPROVE WITH CHANGES
