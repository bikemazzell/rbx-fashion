# R6 Studio Calibration

## What this is

This directory holds the MVP R6 release calibration: the measurement script, the generated test fixtures, and the expected-results checklist. Calibration is **compatibility testing, not a runtime dependency** — nothing in `src/` reads these files at app runtime.

Until the calibration passes:

- The 3D preview must not be called accurate.
- `npm run check:release` fails **by design**. That failure is honest: it means no human has yet verified the preview bindings against real Roblox Studio rendering.

## Requirements

- The current production Roblox Studio.
- A Roblox account with permission to upload private test images.
- This repository checkout.

## Procedure

1. In the current production Roblox Studio, use Avatar > Character to insert one Block Avatar R6 rig.
2. Rename it `CalibrationR6`; do not substitute a marketplace avatar package.
3. Record the Studio version and the rig's `Humanoid.RigType`.
4. Run the read-only Command Bar script `calibration/measure-r6.lua` to capture every `BasePart` size and transform relative to `HumanoidRootPart`.
5. Upload the calibration PNGs privately for testing, add the matching `ShirtGraphic`, `Shirt`, or `Pants` object to the rig, and assign its image property as Roblox documents.
6. Capture front, back, left, right, top, and bottom views for all three garments on the R6 rig.
7. Capture the same views in the web preview.
8. For every visible face, verify panel ID, arrow direction, four edge numbers, segment boundary, and seam partner against `calibration/r6-checklist.md`. Record pass/fail per row; screenshots alone are not the checklist.
9. Correct the authored `PreviewFaceBinding` records and repeat until every check passes.
10. Commit the fixture PNGs, Studio/web screenshots, JSON measurements, checklist, Studio version, date, and resulting `calibrationVersion` beside the registry.

## Fixture generation

```
npm run calibration:fixtures
```

regenerates `calibration/fixtures/shirt.png`, `calibration/fixtures/pants.png`, and `calibration/fixtures/tshirt.png` deterministically from the registry in `src/domain/registry-data.ts` (script: `scripts/generate-calibration.mjs`, headless Chromium via the pinned Playwright package). The fixtures are committed artifacts and are regenerated only deliberately. The script prints each fixture's byte size and sha256 and self-verifies the PNG signature and IHDR dimensions before exiting non-zero on any mismatch.

## Evidence contract

`npm run check:release` validates exactly the following. Every item must hold for the gate to pass.

1. `calibration/evidence/measurements.json` exists, parses as JSON, and satisfies:
   - `studioVersion`: non-empty string (the Studio version recorded in step 3).
   - `capturedOn`: string matching `YYYY-MM-DD`.
   - `rigType`: exactly `"R6"`.
   - `parts`: array with at least 7 entries, each having `name` (string), `size` (3 finite numbers), and `relativeCFrame` (12 finite numbers). Build this file from the JSON printed by `measure-r6.lua` (its `parts` array) plus the recorded `studioVersion` and `capturedOn`.
2. Studio captures: `calibration/evidence/captures/{shirt,pants,tshirt}-studio-{front,back,left,right,top,bottom}.png` — all 18 files exist, are non-empty, and start with the PNG signature.
3. Web captures: the same 18 files with `-web-` in the name, captured from the web preview.
4. Completed checklist: `calibration/evidence/r6-checklist-completed.md` exists, contains `RESULT: PASS`, contains neither `RESULT: FAIL` nor `RESULT: PENDING`, and no table row has an empty `Result` cell.
5. Registry calibration: `src/domain/registry-data.ts` contains no occurrence of `calibrationVersion: null` (after calibration the three entries carry the recorded calibration version).

## Where the evidence lives

Evidence lives under `calibration/evidence/`, which is **gitignored until it is real** — no fabricated evidence can be committed accidentally. When the calibration actually passes, the reviewer un-ignores the directory and commits the real evidence as part of the `test: record R6 Studio calibration` commit, which also records the resulting `calibrationVersion` beside the registry.
