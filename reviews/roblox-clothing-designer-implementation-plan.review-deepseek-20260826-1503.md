# Review: roblox-clothing-designer-implementation-plan.review-deepseek-20260826-1503.md

| field | value |
|---|---|
| reviewer | `deepseek` |
| backend | `opencode` |
| model | `deepseek/deepseek-v4-pro` |
| workdir | `/home/v/Documents/Dev/rbx-fashion` |
| write access | none (read-only, enforced) |
| started | 2026-08-26T15:03:52+02:00 |
| finished | 2026-08-26T15:06:55+02:00 |
| exit code | 0 |

---

VERDICT: APPROVE WITH CHANGES

- IMPORTANT - docs/roblox-clothing-designer-implementation-plan.md:126 - The normative 32-layer limit (design:199) is never enforced or tested: the reducer/import milestone and the required-scenario list (line 227, which names "history limits" only) both omit it. - Add a layer-count invariant to layer-creation actions and ZIP import, and a test asserting that a 33rd layer is rejected transactionally.

- IMPORTANT - docs/roblox-clothing-designer-implementation-plan.md:91 - EXIF-orientation handling is introduced here but absent from the normative docs, and "store display-oriented decoded dimensions while hashing the exact original bytes" breaks cross-browser round-trip: `createImageBitmap`/`<img>` EXIF behavior differs across engines and formats (notably WebP/WebKit), so a project saved in one browser can decode to different dimensions in another and fail the dimension-match import check transactionally. - Normalize orientation at ingest (re-encode to a canonical orientation so stored bytes equal displayed bytes and dimensions are stable), or ignore EXIF entirely and store raw decoded dimensions; document the chosen semantics in the design.

- IMPORTANT - docs/roblox-clothing-designer-implementation-plan.md:140 - "Independent Chromium RGBA golden fixtures" is ambiguous: if the fixtures are produced by running the compositor under test, they self-validate and prove nothing. - Author goldens independently (hand-computed transforms / manually inspected small fixtures) and state the authoring method, mirroring the preflight:355 independent-authoring rule that prevents a bad registry from validating itself.

- IMPORTANT - docs/roblox-clothing-designer-implementation-plan.md:146 - The streaming ZIP "expanded byte counters" must be a hard incremental abort during fflate decode, not post-hoc accounting, and the concrete 50 MiB compressed / 128 MiB expanded thresholds (design:201) are not restated in this milestone. - Enforce the cumulative expanded-size budget during streaming (abort the entry mid-stream at 128 MiB) and state both thresholds explicitly so the counters have defined limits.

- MINOR - docs/roblox-clothing-designer-implementation-plan.md:96 - The 16,384 tile-draw cap is a plan-only constant, absent from the design and from the scenario list, and 16k full-resolution `drawImage` calls can still stall low-end mobile; the count formula (including 2×2 mirror parity) is unspecified. - Define the exact tile-count formula, add a boundary test, and consider a pixel-budget-based bound rather than a fixed draw count.

- MINOR - docs/roblox-clothing-designer-implementation-plan.md:178 - The milestone commit "add calibrated block avatar preview" implies the manual Studio gate completed inside the milestone, but calibration is a human release gate (preflight:341) requiring current Studio, an account, and private test-image uploads. - Reword the milestone to deliver calibration tooling/fixtures and bind the dated `calibrationVersion` assignment to the manual gate passing, matching the plan's own assumptions (line 255).

- MINOR - docs/roblox-clothing-designer-implementation-plan.md:188 - "Square decoded PNG" implies pixel decode inside the framework-free proxy/Node adapter, but squareness and PNG type are verifiable from magic bytes plus the IHDR header without a decoder. - Clarify that the proxy validates PNG magic bytes and IHDR width==height only, keeping the portable handler dependency-free.

## Assumptions and gaps

- Could not verify that the pinned toolchain versions exist or are stable: TypeScript 7.0.2, Vite 8.2.2, Vitest 4.1.11, ESLint 10.9.1, Three 0.185.1, fflate 0.8.3, Playwright 1.62.1. TypeScript 7.x is plausibly the native "tsgo" compiler rather than a stable release; if any pin is unavailable or beta, `npm ci` fails. Treated as unverified rather than a defect.
- Could not verify `gemini-3.1-flash-image` is a real, available model ID on the Interactions REST endpoint (the design already flags re-verification at deployment; kept as-is).
- "Square PNG output at 0.5K" (line 187) is assumed to mean 512×512; not independently confirmed.
- The 150 KiB initial / 250 KiB lazy-3D / 2 MiB precache budgets are asserted in the plan but not proven achievable with the pinned Three.js/Preact versions.
- The plan does not name the SHA-256 mechanism (presumed Web Crypto `crypto.subtle.digest`); secure-context availability and the PWA/service-worker HTTPS requirement for non-HTTPS local test scenarios are unaddressed.
