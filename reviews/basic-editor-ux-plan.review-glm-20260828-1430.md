# Review: basic-editor-ux-plan.review-glm-20260828-1430.md

| field | value |
|---|---|
| reviewer | `glm` |
| backend | `opencode` |
| model | `zai-coding-plan/glm-5.3` |
| workdir | `/home/v/Documents/Dev/rbx-fashion` |
| write access | none (read-only, enforced) |
| started | 2026-08-28T14:27:36+02:00 |
| finished | 2026-08-28T14:36:12+02:00 |
| exit code | 0 |

---

All remaining verifications pass: registry.ts:172-173 + registry-data.ts:15-16 confirm 585x559 shirt/pants templates (T5 bounds math grounded); playwright.config.ts:14 has the chromium project for `--project=chromium`; README.md:3 has the opening paragraph for T7 insertion.

VERDICT: APPROVE WITH CHANGES

- IMPORTANT - docs/2026-08-28-basic-editor-ux-implementation-plan.md Task 1 Step 6 / src/styles.css:105,241,265 - The new `.app{height:100dvh;overflow:hidden}` removes the document scroll surface while `.workspace-stage`/`.preview-stage` keep `min-height:240px` outside the new `(min-width:700px) and (orientation:landscape)` query. On sub-700px landscape phones (SE/8 class, 375px tall: header 56 + toolbar 64 + stage 240 + margins ≈ 380-420px) and short split-screen portrait (390x400: 56+48+64+240 = 408 > 400), the stage bottom or toolbar is clipped with no way to scroll — today `min-height:100dvh` lets the page scroll, so this is a regression the plan's viewport matrix (844x390 only) cannot catch. Fix: also relax stage min-height on short viewports outside the ≥700px query, e.g. `@media (orientation: landscape){.workspace-stage,.preview-stage{min-height:0}}` (orientation, not width, is the discriminator for tall-enough chrome), and add one sub-700 landscape viewport (e.g. 667x375) to ui.test.ts asserting toolbar visibility.
- IMPORTANT - docs/2026-08-28-basic-editor-ux-implementation-plan.md Task 5 Step 4 / src/editor/ui/designer-app.tsx:775 - The wheel burst reads `layer.transform` via `options.getSession()` → Workspace propsRef → EditorScreen prop `getSession={() => session}`, a render-time closure. Two or more wheel events arriving in one task before Preact re-renders (real trackpad bursts; the plan's own 100-event test loop dispatches synchronously) all read the same stale transform, and since each `update-gesture` patch-transform is an absolute merge (`{...base,...patch}`), earlier same-frame deltas are silently discarded — fast scrolls under-scale. The plan's tests stay green (uniformity and undo count still hold), so TDD won't catch it. Fix: DesignerApp passes `getSession={() => sessionRef.current}` to EditorScreen (sessionRef is updated synchronously in commitSession; the gesture controller is the only consumer, so no other behavior changes), or the plan explicitly notes this as part of Task 5.
- MINOR - src/editor/ui/gestures.ts:27-56 - With handle clamping, an oversized picture's clamped scale handle and rotate handle can land on the same corner point (rotate is hit-tested first, scale becomes temporarily unreachable by pointer there). Acceptable for first release; keyboard Size field in MoreSheet remains the escape hatch. No plan change required; worth one line in the plan's known-limitations if desired.

Assumptions and gaps:
- Review is static: no tests were executed; RED/GREEN reasoning is analytical against the read source (state.ts pending-gesture machine, gestures.ts harness, preview.ts math, styles.css cascade all verified by reading).
- Real trackpad/touch event coalescing behavior on physical devices is unverified; synthetic WheelEvent loops approximate it.
- T5's prose rule "call finishWheelGesture() at the start of valid pointer/keyboard interaction" is load-bearing, not cosmetic: while a burst is pending, state.ts silently drops patch-transform and undo. The plan states the rule but doesn't test the keyboard-during-burst path; acceptable gap.
- Manual gates (Brave CDP pass, physical iOS/Android smoke, Roblox Studio calibration evidence, `check:release` exit 1) remain honestly incomplete per the review constraints; Task 7 preserves that honesty.
- Template dims (585x559 shirt/pants, 512x512 T-shirt) confirmed against src/domain/registry.ts:172 and registry-data.ts:15-16; T5 bounds test values [16,569]x[16,543] and the T4/T5 rate constants check out arithmetically (exp(-240*0.0015)≈0.70 zoom-in; clamp at MIN_DISTANCE 4).
