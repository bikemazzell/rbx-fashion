# Editor Navigation Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the redundant bottom toolbar, group Save and Export as file actions, make Layers own Add Layer, and separate new-color creation from More-based recoloring.

**Architecture:** Keep the current reducer and persisted schema unchanged. Reshape only the Preact UI and transient `DesignerApp` sheet state: dedicated callbacks replace the generic toolbar dispatcher, the existing layer panel gains one Add Layer entry point, and a short-lived color intent distinguishes adding from editing. Existing compositor, preview, archive, and export consumers remain untouched.

**Tech Stack:** Preact, TypeScript, Canvas 2D, Vitest browser mode, Playwright, Vite PWA build

---

## File map

- `src/editor/ui/editor-screen.tsx`: two-row header, Project files navigation, Layers/Add Layer wiring, no Tools toolbar.
- `src/editor/ui/designer-app.tsx`: dedicated UI callbacks and add/edit color intent.
- `src/editor/ui/items-panel.tsx`: user-facing Layers content and Add Layer cap state.
- `src/editor/ui/sheets.tsx`: Add Layer title and solid-layer Change Color action in More.
- `src/styles.css`: two-row header, file action row, Add Layer and Change Color controls; delete toolbar rules.
- `tests/browser/ui.test.ts`: primary information architecture, color behavior, accessibility, and overflow regressions.
- `tests/browser/{asset-lifecycle,generate-ui,gestures,projects}.test.ts`: helpers and flows updated to Layers/Add Layer without weakening their existing assertions.
- `tests/e2e/mobile-layout.spec.ts`: portrait/landscape bounded-layout and no-toolbar assertions.
- `scripts/test-pwa.mjs`: offline journey updated to Layers/Add Layer.
- `README.md`, `docs/roblox-clothing-designer-design.md`: canonical control documentation.

### Task 1: Lock the new navigation contract with failing browser tests

**Files:**
- Modify: `tests/browser/ui.test.ts`
- Modify: `tests/e2e/mobile-layout.spec.ts`

- [ ] **Step 1: Add focused RED browser assertions**

Add helpers that address semantic homes rather than the removed toolbar:

```ts
function projectButton(host: HTMLElement, label: "New" | "Open" | "Save" | "Export") {
  return requireEl(
    host.querySelector(`nav[aria-label="Project files"] [aria-label="${label}"]`),
    `project action ${label}`,
  ) as HTMLButtonElement;
}

async function openLayers(host: HTMLElement): Promise<HTMLElement> {
  (byLabel(host, "Layers") as HTMLButtonElement).click();
  await waitFor(
    () => host.querySelector('[role="dialog"][aria-label="Layers"]') !== null,
    "Layers sheet",
  );
  return dialog(host, "Layers");
}

async function openAddLayer(host: HTMLElement): Promise<void> {
  const layers = await openLayers(host);
  (requireEl(layers.querySelector('[aria-label="Add Layer"]'), "Add Layer") as HTMLButtonElement).click();
  await waitFor(
    () => host.querySelector('[role="dialog"][aria-label="Add Layer"]') !== null,
    "Add Layer sheet",
  );
}
```

Add one test asserting:

```ts
expect(host.querySelector('nav[aria-label="Tools"]')).toBeNull();
expect(host.querySelector('[aria-label="Move"]')).toBeNull();
expect(host.querySelector('.toolbar')).toBeNull();
const files = requireEl(host.querySelector('nav[aria-label="Project files"]'), "Project files");
expect(Array.from(files.querySelectorAll("button")).map((button) => button.textContent)).toEqual([
  "New", "Open", "Save", "Export",
]);
expect(byLabel(host, "Layers")).toBeInstanceOf(HTMLButtonElement);
```

Assert the empty workspace says `Open Layers to add a picture, color, or cutout.` and the Layers sheet puts enabled `Add Layer` before `No layers yet. Choose Add Layer to begin.`.

- [ ] **Step 2: Add RED mobile layout assertions**

At 390x844 and 844x390 assert `.toolbar` and Tools navigation are absent, `Project files` is visible, document width/height stay within the viewport, and Save/Export bounding rectangles are adjacent with Export immediately to Save's right.

- [ ] **Step 3: Run RED tests**

Run:

```bash
npx vitest run tests/browser/ui.test.ts -t "project files|Layers owns"
npm run test:e2e -- --grep "phone landscape|phone portrait"
```

Expected: failures show the old single-row header, Tools toolbar, Items names, and missing Add Layer control.

### Task 2: Implement the two-row header and Layers-owned creation

**Files:**
- Modify: `src/editor/ui/editor-screen.tsx`
- Modify: `src/editor/ui/designer-app.tsx`
- Modify: `src/editor/ui/items-panel.tsx`
- Modify: `src/editor/ui/sheets.tsx`
- Modify: `src/styles.css`
- Test: `tests/browser/ui.test.ts`

- [ ] **Step 1: Replace the toolbar API with dedicated callbacks**

Remove `ToolKind`, `onToolbar`, toolbar icon imports, `onRepeatToolbar`, and the `<nav aria-label="Tools">`. Add `onExport`, `onAddLayer`, and `onChooseNewColor` props. Keep Preview reachable only through `onTabChange`, Repeat through `onPlacement`, and movement through gestures.

Render:

```tsx
<header class="app-header">
  <div class="project-row">
    <h1 class="project-name">{doc.name}</h1>
    {/* Undo, Redo, and non-desktop Layers */}
  </div>
  <nav class="file-actions" aria-label="Project files">
    <button aria-label="New" onClick={props.onNew}>New</button>
    <button aria-label="Open" onClick={props.onOpen}>Open</button>
    <button aria-label="Save" onClick={props.onSave}>Save</button>
    <button aria-label="Export" onClick={props.onExport}>Export</button>
  </nav>
</header>
```

- [ ] **Step 2: Make the shared layer panel own Add Layer**

Extend `ItemsPanelProps`:

```ts
onAddLayer: () => void;
addDisabled: boolean;
```

Render an `Add Layer` button before the empty message/list with `disabled` and `aria-disabled`. Change the empty message to `No layers yet. Choose Add Layer to begin.`. Pass the same callback/cap flag to the mobile sheet and desktop rail. Rename child-facing `Items` labels, dialog names, headings, rail accessible name, and buttons to `Layers`; change the sheet discriminator from `items` to `layers`.

- [ ] **Step 3: Rename the creation sheet**

Change `AddSheet`'s backdrop label and title from `Add` to `Add Layer`. Its Cancel behavior and choices remain unchanged.

- [ ] **Step 4: Add responsive CSS**

Use:

```css
.app-header { display: flex; flex-direction: column; gap: 0.35rem; }
.project-row, .file-actions { display: flex; align-items: center; width: 100%; gap: 0.35rem; }
.file-actions button { flex: 1; min-width: 0; min-height: 44px; }
.add-layer-button, .change-color-button { min-height: 48px; }
```

Remove `.toolbar` rules. Keep `.app-header .layers-toggle` hidden with the desktop rail. Ensure header buttons do not create horizontal overflow at 390px.

- [ ] **Step 5: Make navigation tests green**

Run the Task 1 commands. Expected: pass, with layout failures deferred only if they depend on later Change Color height.

- [ ] **Step 6: Commit**

```bash
git add src/editor/ui/editor-screen.tsx src/editor/ui/designer-app.tsx src/editor/ui/items-panel.tsx src/editor/ui/sheets.tsx src/styles.css tests/browser/ui.test.ts tests/e2e/mobile-layout.spec.ts
git commit -m "feat: organize editor actions around layers"
```

### Task 3: Separate new-color creation from selected-layer recoloring

**Files:**
- Modify: `src/editor/ui/designer-app.tsx`
- Modify: `src/editor/ui/editor-screen.tsx`
- Modify: `src/editor/ui/sheets.tsx`
- Modify: `src/styles.css`
- Test: `tests/browser/ui.test.ts`

- [ ] **Step 1: Add RED color-intent tests**

Create one color through Layers, leave it selected, create a second through Layers, and assert two rows and one undo entry per creation. Then select the first solid, open More, click Change Color, select Green, and assert the row count stays two, only that layer's canvas color changes, and one Undo restores its former color. Add a cancellation case that records undo/row state, cancels Colors, and asserts both are unchanged.

Assert solid More contains visible `Change Color` plus a decorative swatch, while raster and cutout More do not.

- [ ] **Step 2: Verify RED**

Run:

```bash
npx vitest run tests/browser/ui.test.ts -t "new color|Change Color|color cancellation"
```

Expected: the second Add recolors the selected solid, and Change Color is missing.

- [ ] **Step 3: Implement transient color intent**

In `DesignerApp` add:

```ts
type ColorIntent = { kind: "add" } | { kind: "edit"; id: string };
const [colorIntent, setColorIntent] = useState<ColorIntent | null>(null);
```

Opening Choose Color from Add Layer sets `{ kind: "add" }`. Opening Change Color from a selected solid captures `{ kind: "edit", id }`. `onSwatch` reads the current session through `sessionRef`: add mode calls `addSolid(color)`; edit mode dispatches `set-color` only when the captured ID still resolves to a solid. It then clears the intent and sheet. Reset, Cancel, project replacement, and generic color-sheet dismissal clear the intent.

- [ ] **Step 4: Add Change Color to More**

Extend `MoreSheetProps` with `onChangeColor?: () => void`. For a solid layer, render:

```tsx
<button type="button" class="change-color-button" onClick={props.onChangeColor}>
  <span class="current-color-swatch" style={{ backgroundColor: layer.color }} aria-hidden="true" />
  Change Color
</button>
```

Keep the palette in the existing Colors sheet. Do not add a custom picker or schema field.

- [ ] **Step 5: Verify GREEN and compact More layout**

Run the focused browser tests and the 844x390 Playwright More-sheet regression. Assert sheet/form scroll heights equal client heights and Done remains inside the viewport.

- [ ] **Step 6: Commit**

```bash
git add src/editor/ui/designer-app.tsx src/editor/ui/editor-screen.tsx src/editor/ui/sheets.tsx src/styles.css tests/browser/ui.test.ts tests/e2e/mobile-layout.spec.ts
git commit -m "feat: edit layer colors from More"
```

### Task 4: Migrate all journeys and documentation without weakening coverage

**Files:**
- Modify: `tests/browser/asset-lifecycle.test.ts`
- Modify: `tests/browser/generate-ui.test.ts`
- Modify: `tests/browser/gestures.test.ts`
- Modify: `tests/browser/projects.test.ts`
- Modify: `scripts/test-pwa.mjs`
- Modify: `README.md`
- Modify: `docs/roblox-clothing-designer-design.md`

- [ ] **Step 1: Update test helpers semantically**

Replace toolbar-based Add/Color/Export/Preview and Items helpers with:

- Layers → Add Layer for creation;
- Project files → Export for export;
- View → Preview/Edit for portrait view changes;
- selected raster Placement → Repeat for pattern changes;
- Layers for row inspection and operations.

Keep every prior assertion about asset closing, save/open, undo, preview fallback, export bytes, layer ordering, and item-cap behavior. Only rename child-facing expected strings from Items to Layers.

- [ ] **Step 2: Update the offline PWA journey**

Rename `openItemsSheet` to `openLayersSheet`. Create Color and Cut Out via Layers → Add Layer, inspect rows in Layers, and keep offline export/save-open/preview checks unchanged.

- [ ] **Step 3: Update canonical docs**

Document the two-row file header, Layers/Add Layer, More → Change Color, portrait Edit/Preview tabs, no Move mode, and selected-picture placement control. Remove claims about a bottom toolbar or child-facing Items.

- [ ] **Step 4: Run all affected suites**

```bash
npm run typecheck
npm run lint
npm run test:unit
npm run test:browser
npm run test:e2e
npm run test:pwa
```

Expected: all pass. Mutation-check the key color tests by temporarily routing add intent through recolor and confirming the new-layer test fails, then restore.

- [ ] **Step 5: Commit**

```bash
git add tests scripts/test-pwa.mjs README.md docs/roblox-clothing-designer-design.md
git commit -m "test: cover simplified editor navigation"
```

### Task 5: Production verification, GLM review, and delivery

**Files:**
- Create: `reviews/editor-navigation-simplification.review-glm-20260901.md`
- Modify only if validated review findings require fixes.

- [ ] **Step 1: Run the complete release-proportional suite**

```bash
npm run typecheck
npm run lint
npm run test:unit
npm run test:browser
npm run build
npm run check:bundle
npm run test:pwa
npm run test:e2e
git diff --check
```

Run `npm run check:release` and confirm any failure remains limited to the named manual Roblox Studio/R6 calibration evidence gaps.

- [ ] **Step 2: Smoke-test the production build**

At 390x844 and 844x390 verify the two header rows, adjacent Save/Export, Layers/Add Layer, new Color creation, More → Change Color, Edit/Preview behavior, no bottom toolbar, bounded document dimensions, and no compact-More nested scroll.

- [ ] **Step 3: Obtain the requested GLM review**

Use the read-only `review-with` workflow with the approved design, this plan, full branch diff, and verification evidence. Require exactly one verdict line. Ask GLM to focus on mobile information hierarchy, stale color targets, cap behavior, accessibility, regression coverage, and layout overflow.

- [ ] **Step 4: Validate and fix review findings RED-first**

Apply `superpowers:receiving-code-review`. Reproduce each accepted defect with a failing test before production edits, rerun focused tests after each fix, and preserve the review artifact and harness log.

- [ ] **Step 5: Reverify, integrate, and deploy**

Rerun the full suite at the final commit. Fast-forward `main`, push `origin/main`, monitor the exact CI SHA, monitor the CI-gated Deploy Pages run, confirm Pages remains `build_type: workflow`, and smoke-test the canonical public URL in a fresh browser session.

## Acceptance checklist

- [ ] No bottom Tools toolbar or child-facing Move shortcut exists.
- [ ] Repeat exists only in selected-raster placement controls.
- [ ] Preview exists only in the portrait View tabs; dual-pane layouts remain unchanged.
- [ ] Project files contains New, Open, Save, Export with Save and Export adjacent.
- [ ] All child-facing Items labels are Layers.
- [ ] Layers owns Add Layer on mobile and desktop and reports the cap truthfully.
- [ ] Add Layer → Choose Color always adds; More → Change Color only edits.
- [ ] No persisted project/schema/compositor/export behavior changes.
- [ ] Portrait and landscape remain bounded with no compact-sheet nested scrolling.
- [ ] Full local suite, GLM review/fixes, GitHub CI, Pages deployment, and public smoke test complete.
