# Review: roblox-clothing-designer-lean-mvp.review-deepseek-20260826-1627.md

| field | value |
|---|---|
| reviewer | `deepseek` |
| backend | `opencode` |
| model | `deepseek/deepseek-v4-pro` |
| workdir | `/home/v/Documents/Dev/rbx-fashion` |
| write access | none (read-only, enforced) |
| started | 2026-08-26T16:28:31+02:00 |
| finished | 2026-08-26T16:31:56+02:00 |
| exit code | 0 |

---

VERDICT: APPROVE WITH CHANGES

- IMPORTANT - docs/roblox-clothing-designer-implementation-plan.md:84-94 - The plan never implements the design's import-routing rule (docs/roblox-clothing-designer-design.md:33): a 512×512 Roblox-map import must open as a T-shirt, a 585×559 import must prompt Shirt-vs-Pants, and only other images join the current garment; "Existing Roblox texture maps" (design.md:29) is an enumerated input with no plan task. - Add an explicit import-classification step to Milestone 2 with tests for the three routing cases.

- IMPORTANT - docs/roblox-clothing-designer-implementation-plan.md:103-104 - The 50 MiB compressed / 128 MiB expanded ZIP limits are enforced only on import ("Stream ZIP import"); `saveProjectZip` has no mirrored cap. A project whose normalized PNG assets exceed these limits can be saved but then rejected on reopen, breaking the design's save/reopen round-trip guarantee (design.md:188-192). - Enforce the same caps on save (or bound normalized-asset size so save always stays reopenable) so save ⟺ reopen holds transactionally.

- MINOR - docs/roblox-clothing-designer-implementation-plan.md:73 - Export validation is stated only as "re-decode validation for 512×512 and 585×559"; design.md:218 also requires MIME type, exact dimensions, nonempty pixel data, and alpha range, plus an empty-result warning. - Enumerate MIME/dimension/nonempty/alpha checks in Milestone 1 and add a nonempty-pixel assertion and empty-result warning.

- MINOR - docs/roblox-clothing-designer-implementation-plan.md:87 - "oriented in-memory canvas" does not pin `imageOrientation`; browser defaults differ (Chrome/Firefox honor EXIF by default, Safari's `createImageBitmap` does not), so the same JPEG normalizes to different pixels per browser despite design.md:177's claim. - Pass an explicit `imageOrientation: 'from-image'` in the decode call to make normalization deterministic.

- MINOR - docs/roblox-clothing-designer-implementation-plan.md:70 - "15 continuous seams" undercounts the records: the preflight defines 15 seam pairs expanded into 30 reciprocal `seams` records (preflight.md:101,120); the plan's own test line says "reciprocal seams." - State "15 seam pairs / 30 reciprocal records" and test all 30, not 15.

- MINOR - docs/roblox-clothing-designer-implementation-plan.md:117,122 - "independent ... fixtures" and "independent R6 checklist" do not state the preflight's anti-self-validation requirement that the checklist be authored from the official templates, not the registry (preflight.md:361). - Require the expected checklist to be authored from the official template PNGs, independent of the registry, so a bad registry cannot validate itself.

- MINOR - docs/roblox-clothing-designer-implementation-plan.md:117-122 - The garment-change invariant (design.md:170: changing garment creates a new project, layers are never silently reinterpreted) has no reducer action or test in the plan. - Add a reducer invariant and a test asserting garment change resets rather than reinterprets layers.

- MINOR - docs/roblox-clothing-designer-implementation-plan.md:120 - The polygon-offset approach is implemented, but the preflight's explicit "browser tests must confirm this remains stable on the supported WebGL implementations" (preflight.md:340) has no corresponding test task. - Add a z-fighting/polygon-offset stability check to the Chromium/WebKit browser suites.

## Assumptions and gaps

- Proxy production hosting is unspecified: the plan deploys only the static artifact to GitHub Pages with an "optional public proxy URL" but never states where the portable `Request -> Response` handler runs in production (Cloudflare Workers/Deno/other), or whether it is out-of-repo. Could not verify.
- Pinned dependency versions (Vite 8.2.2, TypeScript 7.0.2, Vitest 4.1.11, Playwright 1.62.1, etc.) could not be verified as existing/current; the lockfile task is assumed sufficient to pin them.
- The 150 KiB / 250 KiB gzip budget with tree-shaken Three.js 0.185.1 is plausible but unproven; no evidence yet that the preview chunk stays under 250 KiB gzip.
