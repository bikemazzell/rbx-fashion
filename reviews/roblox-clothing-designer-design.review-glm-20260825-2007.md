# Review: roblox-clothing-designer-design.review-glm-20260825-2007.md

| field | value |
|---|---|
| reviewer | `glm` |
| backend | `opencode` |
| model | `zai-coding-plan/glm-5.3` |
| workdir | `/home/v/Documents/Dev/rbx-fashion` |
| write access | none (read-only, enforced) |
| started | 2026-08-25T20:08:06+02:00 |
| finished | 2026-08-25T20:10:52+02:00 |
| exit code | 0 |

---

VERDICT: APPROVE WITH CHANGES

- IMPORTANT - docs/roblox-clothing-designer-design.md:47 - The template registry (panel masks, orientation, garment-space coordinates, seam adjacency, R6/R15 UV assignments) must be hand-authored from the official template PNG because Roblox publishes no machine-readable panel/UV data — the app's largest and most error-prone subsystem hides behind one line. Tests at line 214 are circular (fixtures generated from the same hand-authored data), and the release smoke test (line 237) validates only PNG uploadability, not preview or mask accuracy; wrong masks/UVs would silently mislead users while exports still upload successfully. - Specify the registry authoring method (e.g., coordinate extraction from the official template with documented manual review), and add a calibration acceptance gate: export/upload a numbered-panel calibration PNG, verify panel placement in Roblox Studio on both R6 and R15, and compare Studio screenshots against the 3D preview; record results alongside the template registry.
- IMPORTANT - docs/roblox-clothing-designer-design.md:123 - `AssetManifestEntry` is referenced by `ProjectDocumentV1` but never defined; `schemaVersion: 1` makes the project ZIP a forward-compatibility contract, so the implementer must invent persisted fields (original filename, MIME, decoded dimensions, prompt provenance) that become locked in. - Fully specify `AssetManifestEntry` in Core types before implementation.
- MINOR - docs/roblox-clothing-designer-design.md:126 - `cameraPreset: "custom"` is persisted without any camera parameters, so a project saved with a custom camera cannot restore that view on reopen; the implementer must invent behavior. - Persist custom camera parameters (azimuth/elevation/distance) or normalize `custom` to the nearest preset on save.
- MINOR - docs/roblox-clothing-designer-design.md:152 - "Deterministic" PNG rendering is not achievable cross-browser with native Canvas 2D `drawImage` resampling (engine-specific filtering); the claim as written will fail the pixel-fixture/determinism tests (line 217) if run across engines. - Scope determinism to a pinned browser engine, or specify a software resampler for the export compositor path.
- MINOR - docs/roblox-clothing-designer-design.md:166 - The custom `X-Gemini-Api-Key` header forces a CORS preflight; the proxy's `Request -> Response` handler must answer `OPTIONS` with the allowlisted origin and headers, but preflight behavior is unspecified and untested (line 219 covers origin enforcement only). - Specify `OPTIONS`/preflight response behavior and add a preflight test.
- MINOR - docs/roblox-clothing-designer-design.md:179 - "Request limits" on a stateless proxy have no specified mechanism or storage; in-memory per-IP limits are ineffective on multi-instance serverless deployments. - Specify the mechanism (e.g., best-effort per-instance token bucket) and label it abuse-reduction, not enforcement.
- MINOR - docs/roblox-clothing-designer-design.md:204 - Update-activation behavior is specified only for the unsaved-work prompt; deferral policy when the user declines (retry cadence, whether activation can be blocked indefinitely) is left to the implementer. - Specify deferral (e.g., re-prompt on next load; never auto-activate while a document is dirty).

## Assumptions and gaps

- Repository contains only the design document; no implementation exists to inspect (per review context).
- `gemini-3.1-flash-image` was verified as a current Gemini API model via Google AI docs (retrieved 2026-08-25); the spec's deployment-configurable model field (line 177) further mitigates drift.
- Roblox's exact 585x559 upload requirement for shirts/pants was corroborated only via DevForum/wiki sources, not an official docs statement; T-shirt 512x512 could not be independently confirmed from retrieved official content. The spec's own requirement to record official template source and verification date (line 237) should cover both at release.
- Actual R6/R15 per-part UV mappings cannot be verified against Roblox's internal meshes (not published); the calibration gate proposed in finding 1 is the only practical verification.
