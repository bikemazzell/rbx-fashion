# Review: roblox-clothing-designer-implementation-plan.review-glm-20260826-1503.md

| field | value |
|---|---|
| reviewer | `glm` |
| backend | `opencode` |
| model | `zai-coding-plan/glm-5.3` |
| workdir | `/home/v/Documents/Dev/rbx-fashion` |
| write access | none (read-only, enforced) |
| started | 2026-08-26T15:03:53+02:00 |
| finished | 2026-08-26T15:09:43+02:00 |
| exit code | 0 |

---

VERDICT: APPROVE WITH CHANGES

- IMPORTANT - docs/roblox-clothing-designer-implementation-plan.md:132 - The default solid layer (virtual 1×1 source, pattern placement, preflight default scale 1) needs 384×256 = 98,304 tile draws on the torso alone, tripping the plan's own 16,384-draw abort (line 96), so the plan's default layer creation immediately fails compose and blocks export. - Render solid pattern layers as a single `fillRect` per targeted panel/component (a uniform 1×1 source is visually identical under repeat/mirror), bypassing tile enumeration and the cap; or default solid scale to the largest component extent so one tile covers it. State the chosen path in milestones 3/4.

- IMPORTANT - docs/roblox-clothing-designer-implementation-plan.md:146 - The normative limits "Maximum 32 layers" and "Maximum ZIP size: 50 MiB compressed / 128 MiB expanded" (design.md:200,202) appear nowhere in the plan; line 146 says only "compressed and expanded byte counters," and the scenario list (line 230) has no entry-count or size-limit rejection tests, so counters can ship without enforcement and a 33rd layer or 130 MiB expanded archive goes unchallenged. - Restate the 32-layer and 50/128 MiB limits as enforced invariants in milestones 3 and 5, and add rejection tests for the 33rd layer, 65th entry, >50 MiB compressed, and >128 MiB expanded inputs.

- IMPORTANT - docs/roblox-clothing-designer-implementation-plan.md:158 - Pointer arbitration defines only steady states (one pointer = layer gesture, two = viewport pan/zoom), not transitions: a second finger landing mid-layer-gesture or lifting one of two fingers leaves the open begin/update/commit transaction undefined, which on touch (palm/second finger) will corrupt the layer transform or pollute undo history. - Specify that a second pointerdown cancels and rolls back the uncommitted layer transaction before starting the viewport gesture, that a new layer gesture requires all pointers released after any two-pointer gesture, and add browser tests for both transitions.

- MINOR - docs/roblox-clothing-designer-implementation-plan.md:172 - Milestone 7 builds rigs "from stored Studio measurements," but no milestone captures them: milestone 2 (line 118) adds only the script, schema, and templates, and the preflight's derivation path for initial R15 proportions from the pinned BlockyCharacter.fbx bounds (preflight.md:335) is never referenced. - Add an explicit ordered step (end of milestone 2 or start of 7): run the preflight Lua script on `CalibrationR6`/`CalibrationR15`, commit the measurement JSON, and derive initial R15 segment bounds from BlockyCharacter.fbx before constructing geometry.

- MINOR - docs/roblox-clothing-designer-implementation-plan.md:166 - Layout rules cover <700 px (tabs), ≥700 landscape (panes), and desktop (rail) but leave ≥700 px portrait (tablets) undefined; the design's portrait rule ("full-screen tabs") plausibly conflicts with the desktop rail there. - Define tablet-portrait explicitly (e.g., tabs with sheets below a fine-pointer/hover media-query threshold, rail otherwise) and cover it in the layout assertions.

- MINOR - docs/roblox-clothing-designer-implementation-plan.md:131 - "Other images can be added as a decal or pattern only" conflicts with the preflight's full-map defaults for non-canonical sources (preflight.md:176: "any other source defaults to scaleX = canvasWidth / cw"), which only make sense if arbitrary images may choose full-map. - Allow full-map for any imported image using the preflight's fit-scale defaults; keep canonical-size detection (512×512 / 585×559) solely as the start-screen auto-project trigger.

- MINOR - docs/roblox-clothing-designer-implementation-plan.md:156 - "Garment switcher" has no defined semantics: switching tshirt↔atlas projects requires layer reinterpretation (full-map vs panels) specified nowhere in the design; shirt↔pants is trivial only because the atlases coincide. - Either remove in-project switching (garment choice only at project creation) or scope it to shirt↔pants and document that layers, targets, and assets transfer unchanged.

- MINOR - docs/roblox-clothing-designer-implementation-plan.md:225 - The required-scenario list omits two design-mandated automated checks: "project data never enters browser persistence" (design.md:286) and same-document-twice export producing identical decoded pixels in pinned Chromium (design.md:276). - Add both scenarios: assert empty localStorage/sessionStorage/IndexedDB/caches after edit/save/export, and export the same document twice comparing decoded RGBA.

## Assumptions and gaps

- Could not verify that the pinned dependency versions exist or are mutually compatible (Preact 10.29.8, Three.js 0.185.1, Vite 8.2.2, TypeScript 7.0.2, @types/node 26.3.0, @preact/preset-vite 2.10.6, Vitest 4.1.11, Playwright 1.62.1, axe-core 4.13.0, ESLint 10.9.1, typescript-eslint 8.68.0, fflate 0.8.3); no registry access in this review.
- Could not verify the `gemini-3.1-flash-image` identifier or the current Gemini image REST request/response shape; the plan itself mandates re-verification before deployment (line 187).
- Could not verify the preflight's SHA-256 digests, atlas rectangles, or seam table against the actual official assets; the preflight was treated as authoritative per the review instructions.
- Could not empirically confirm the bundle budgets (150 KiB initial JS, 250 KiB lazy 3D, 2 MiB precache) are achievable with the pinned stack.
- No implementation code exists yet; this is a document-only review with no executed tests or builds.
