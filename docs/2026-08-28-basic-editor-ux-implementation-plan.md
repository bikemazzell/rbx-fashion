# Basic Editor UX Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing Roblox clothing editor complete and comfortable for a child on mobile and desktop by fixing short-landscape layout, completing direct picture and 3D zoom interactions, removing dead ends, and improving first-use guidance and project reopening.

**Architecture:** Keep the current Preact/Canvas/Three.js structure and project schema. Add one responsive media-query flag, extend the existing gesture and preview controllers, and reuse the existing archive loader; all UI changes remain presentation or transient editor state, with no storage, server, dependency, or export-format change.

**Tech Stack:** Preact 10, TypeScript, Vite, Canvas 2D, Three.js, Vitest Browser Mode, Playwright, CSS.

---

## Canonical scope

This is the single canonical execution document for the work. It fully incorporates the settled requirements from the earlier interaction-polish, preview-wheel-zoom, and basic-editor-UX designs plus the valid GLM/Qwen review corrections. An implementation session needs this plan and the repository; the earlier design documents are provenance, not additional execution instructions.

Preserve the existing touch gestures, archive format, compositor, export dimensions, lazy Three.js import, offline behavior, eight-item cap, and classic pants mapping. Do not add a UV/template mode, tutorial system, persistence, geometry editing, a new dependency, or a project-schema field.

The current browser suite is green but does not catch the mobile bug: its landscape assertion checks `.pane-preview`, which CSS makes visible even when `.preview-stage` is not mounted. Every layout acceptance below must assert rendered content and geometry, not only CSS class visibility.

## File map

| File | Responsibility in this change |
| --- | --- |
| `src/editor/ui/designer-app.tsx` | Responsive media state and start-screen project opening |
| `src/editor/ui/editor-screen.tsx` | Dual-pane activation and toolbar enablement |
| `src/editor/ui/start-screen.tsx` | Garment explanations and Open Saved Project action |
| `src/editor/ui/workspace.tsx` | Empty-state prompt and bounded picture handles |
| `src/editor/ui/gestures.ts` | Picture wheel scaling, handle geometry, undo burst lifecycle |
| `src/editor/ui/sheets.tsx` | More dismissal and solid-layer field filtering |
| `src/preview/preview.ts` | Three.js canvas wheel zoom |
| `src/styles.css` | Fixed mobile shell, short-landscape sizing, prompt, disabled tools, sticky Done |
| `tests/browser/ui.test.ts` | Responsive, first-use, toolbar, and sheet browser behavior |
| `tests/browser/projects.test.ts` | Open a saved project from the welcome screen |
| `tests/browser/gestures.test.ts` | Picture wheel/handle behavior and undo semantics |
| `tests/browser/smoke/preview-smoke.test.ts` | Rendered 3D wheel zoom and Reset |
| `tests/e2e/mobile-layout.spec.ts` | Real app-shell regression for 844x390 |
| `README.md` | Concise user controls and start-screen reopen behavior |

### Task 1: Make short mobile landscape a real, bounded dual-pane layout

**Files:**
- Modify: `tests/browser/ui.test.ts`
- Create: `tests/e2e/mobile-layout.spec.ts`
- Modify: `src/editor/ui/designer-app.tsx`
- Modify: `src/editor/ui/editor-screen.tsx`
- Modify: `src/editor/ui/workspace.tsx`
- Modify: `src/preview/preview.ts`
- Modify: `src/styles.css`

- [ ] **Step 1: Strengthen the browser viewport matrix so the present bug is RED**

Add `['small-landscape-phone', 667, 375]` immediately before the existing 844x390 landscape entry in `VIEWPORTS`. In the `landscape-phone` branch of `tests/browser/ui.test.ts`, wait for actual preview content and assert page geometry:

```ts
if (name === "landscape-phone") {
  expect(tabbar.offsetParent, `${name} tabbar hidden`).toBeNull();
  expect(previewPane.offsetParent, `${name} preview pane visible`).not.toBeNull();
  await waitFor(
    () => host.querySelector(".preview-stage") !== null,
    `${name} preview stage mounted`,
  );
  const workspace = requireEl(
    host.querySelector<HTMLElement>(".workspace-stage"),
    "workspace stage",
  );
  const preview = requireEl(
    host.querySelector<HTMLElement>(".preview-stage"),
    "preview stage",
  );
  expect(workspace.getBoundingClientRect().height).toBeGreaterThan(80);
  expect(preview.getBoundingClientRect().height).toBeGreaterThan(80);
  expect(toolbar.getBoundingClientRect().bottom).toBeLessThanOrEqual(innerHeight + 1);
  expect(document.documentElement.scrollHeight).toBeLessThanOrEqual(innerHeight + 1);
}
```

Keep the existing portrait and desktop assertions.

For `small-landscape-phone`, add:

```ts
if (name === "small-landscape-phone") {
  expect(tabbar.offsetParent, `${name} tabbar visible`).not.toBeNull();
  expect(previewPane.offsetParent, `${name} preview hidden in Edit`).toBeNull();
  const workspace = requireEl(
    host.querySelector<HTMLElement>(".workspace-stage"),
    "workspace stage",
  );
  expect(workspace.getBoundingClientRect().height).toBeGreaterThan(80);
  expect(toolbar.getBoundingClientRect().bottom).toBeLessThanOrEqual(innerHeight + 1);
  expect(document.documentElement.scrollHeight).toBeLessThanOrEqual(innerHeight + 1);
}
```

This protects narrow landscape phones which do not cross the 700px dual-pane breakpoint.

- [ ] **Step 2: Add a full-shell Playwright regression at the reported viewport**

Create `tests/e2e/mobile-layout.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("phone landscape mounts both editors without pushing tools below the viewport", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Shirt", exact: true }).click();
  await page.setViewportSize({ width: 844, height: 390 });

  await expect(page.locator(".workspace-stage")).toBeVisible();
  await expect(page.locator(".preview-stage")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Tools" })).toBeVisible();

  const layout = await page.evaluate(() => {
    const rect = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (element === null) throw new Error(`missing ${selector}`);
      return element.getBoundingClientRect().toJSON();
    };
    return {
      viewportHeight: innerHeight,
      documentHeight: document.documentElement.scrollHeight,
      bodyHeight: document.body.scrollHeight,
      workspace: rect(".workspace-stage"),
      preview: rect(".preview-stage"),
      toolbar: rect(".toolbar"),
    };
  });

  expect(layout.workspace.height).toBeGreaterThan(80);
  expect(layout.preview.height).toBeGreaterThan(80);
  expect(layout.toolbar.bottom).toBeLessThanOrEqual(layout.viewportHeight + 1);
  expect(layout.documentHeight).toBeLessThanOrEqual(layout.viewportHeight + 1);
  expect(layout.bodyHeight).toBeLessThanOrEqual(layout.viewportHeight + 1);
  expect(pageErrors.filter((message) => message.includes("ResizeObserver loop"))).toEqual([]);
});
```

- [ ] **Step 3: Run both regressions and verify the current code fails for the observed reasons**

Run:

```bash
npx vitest run --project browser-chromium tests/browser/ui.test.ts
npx playwright test tests/e2e/mobile-layout.spec.ts --project=chromium
```

Expected: at 844x390 the browser test times out waiting for `.preview-stage`, while 667x375 reports the toolbar/document below the viewport; the end-to-end test cannot find `.preview-stage`, reports bad geometry, or records ResizeObserver loop errors during portrait-to-landscape rotation.

- [ ] **Step 4: Add a media-query hook and a distinct dual-pane flag**

Add this helper above `DesignerApp` in `src/editor/ui/designer-app.tsx`:

```ts
function useMediaQuery(queryText: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(queryText).matches);
  useEffect(() => {
    const query = window.matchMedia(queryText);
    const onChange = () => setMatches(query.matches);
    onChange();
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [queryText]);
  return matches;
}
```

Replace the current `desktop` state and its dedicated effect with:

```ts
const desktop = useMediaQuery("(min-width: 1024px) and (pointer: fine)");
const dualPane = useMediaQuery("(min-width: 700px) and (orientation: landscape)");
```

Pass `dualPane={dualPane}` to `EditorScreen`.

- [ ] **Step 5: Mount Preview whenever CSS uses two panes**

Add `dualPane: boolean` to `EditorScreenProps` and change `PreviewPane` activation in `src/editor/ui/editor-screen.tsx` to:

```tsx
<PreviewPane
  garment={doc.garmentType}
  document={doc}
  assets={props.assets}
  active={props.desktop || props.dualPane || props.activeTab === "preview"}
/>
```

Keep `desktop` as the Items-rail condition; do not equate a landscape phone with desktop.

- [ ] **Step 6: Bound the editor shell and allow only the stages to shrink**

Keep the default `.app` scroll fallback for portrait, but fix its flex minimums. Apply the bounded shell and stage relaxation at every landscape width; apply two-pane presentation only at 700px and wider. Adjust `src/styles.css`:

```css
.app {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
}

.app-header,
.tabbar,
.toolbar,
.notice-area {
  flex: 0 0 auto;
}

.app-body,
.panes,
.pane,
.workspace-stage,
.preview-stage {
  min-width: 0;
}

@media (orientation: landscape) {
  .app {
    height: 100dvh;
    min-height: 0;
    overflow: hidden;
  }

  .panes,
  .pane {
    overflow: hidden;
  }

  .workspace-stage,
  .preview-stage {
    min-height: 0;
  }
}

@media (min-width: 700px) and (orientation: landscape) {
  .tabbar {
    display: none;
  }

  .panes {
    flex-direction: row;
  }

  .pane-preview {
    display: flex;
  }

  .panes[data-tab="preview"] .pane-edit {
    display: flex;
  }
}
```

Do not set global `body { overflow: hidden; }` and do not make portrait `.app` a fixed height; the welcome screen and an unusually short portrait/split-screen editor must remain scrollable.

- [ ] **Step 7: Coalesce resize-observer writes outside the observer delivery cycle**

In the overlay-sync effect in `src/editor/ui/workspace.tsx`, replace the synchronous observer callback with one queued frame:

```ts
let syncFrame = 0;
const syncNow = () => {
  syncFrame = 0;
  overlay.style.left = `${canvas.offsetLeft}px`;
  overlay.style.top = `${canvas.offsetTop}px`;
  overlay.style.width = `${canvas.offsetWidth}px`;
  overlay.style.height = `${canvas.offsetHeight}px`;
};
const scheduleSync = () => {
  if (syncFrame === 0) syncFrame = requestAnimationFrame(syncNow);
};
const observer = new ResizeObserver(scheduleSync);
observer.observe(canvas);
observer.observe(stage);
scheduleSync();
return () => {
  observer.disconnect();
  if (syncFrame !== 0) cancelAnimationFrame(syncFrame);
};
```

In `src/preview/preview.ts`, keep the current `resize()` math but schedule it separately from render work:

```ts
let resizeFrame = 0;
const scheduleResize = (): void => {
  if (resizeFrame !== 0 || disposed || contextLost) return;
  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = 0;
    resize();
  });
};
const observer = new ResizeObserver(scheduleResize);
observer.observe(container);
scheduleResize();
```

In `dispose()`, cancel a non-zero `resizeFrame` before disconnecting the observer. Keep render scheduling and the `ResizeObserver` itself; do not poll dimensions or add a continuous render loop.

- [ ] **Step 8: Run the responsive tests and the complete existing viewport/accessibility test**

Run:

```bash
npx vitest run --project browser-chromium tests/browser/ui.test.ts
npx playwright test tests/e2e/mobile-layout.spec.ts --project=chromium
```

Expected: PASS; at 844x390 both stages exceed 80px, at both 844x390 and 667x375 the toolbar is visible and body/document heights stay within one rounding pixel of `innerHeight`, and portrait-to-landscape rotation emits no ResizeObserver loop page error. Existing portrait and desktop behavior remains green.

- [ ] **Step 9: Commit the mobile blocker fix**

```bash
git add src/editor/ui/designer-app.tsx src/editor/ui/editor-screen.tsx src/editor/ui/workspace.tsx src/preview/preview.ts src/styles.css tests/browser/ui.test.ts tests/e2e/mobile-layout.spec.ts
git commit -m "fix: make mobile landscape editor usable"
```

### Task 2: Let returning users open a saved project from the welcome screen

**Files:**
- Modify: `tests/browser/projects.test.ts`
- Modify: `tests/browser/ui.test.ts`
- Modify: `src/editor/ui/start-screen.tsx`
- Modify: `src/editor/ui/designer-app.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Add RED tests for welcome-screen reopening and garment explanations**

In `tests/browser/projects.test.ts`, use the existing `garmentProject`, `saveProject`, file-input, and wait helpers to add:

```ts
test("Open Saved Project opens a valid archive without starting a throwaway garment", async () => {
  const host = mountApp();
  const { document, assets } = await garmentProject("pants");
  const saved = await saveProject(document, (id) => {
    const asset = assets.get(id);
    if (asset === undefined) throw new Error(`missing asset ${id}`);
    return asset.bytes;
  });
  expect(saved.ok).toBe(true);
  if (!saved.ok) return;

  const inputClickSpy = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
  try {
    (byLabel(host, "Open Saved Project") as HTMLButtonElement).click();
    expect(inputClickSpy).toHaveBeenCalledTimes(1);
  } finally {
    inputClickSpy.mockRestore();
  }
  await chooseOpenFile(host, new File([saved.blob], "saved.rbxcloth.zip", {
    type: "application/zip",
  }));
  await waitFor(
    () => host.querySelector(".project-name")?.textContent === document.name,
    "saved project opens from start",
  );
  expect(await itemNames(host)).toEqual(["Picture 1", "Color 1"]);
});

test("an invalid welcome-screen project leaves garment choices visible and explains the error", async () => {
  const host = mountApp();
  await chooseOpenFile(
    host,
    new File([new Uint8Array([1, 2, 3])], "broken.zip", { type: "application/zip" }),
  );
  await waitFor(
    () => host.querySelector('[role="status"]')?.textContent?.includes("can't be opened") === true,
    "welcome open error",
  );
  expect(byLabel(host, "Shirt")).toBeTruthy();
  expect(host.querySelector(".project-name")).toBeNull();
});
```

In the welcome-screen test in `tests/browser/ui.test.ts`, assert these exact descriptions:

```ts
expect(host.textContent).toContain("A picture on the front");
expect(host.textContent).toContain("Wraps the body and arms");
expect(host.textContent).toContain("Covers the waist and legs");
expect(byLabel(host, "Open Saved Project")).toBeTruthy();
```

- [ ] **Step 2: Run the two browser files and confirm missing-control failures**

Run:

```bash
npx vitest run --project browser-chromium tests/browser/projects.test.ts tests/browser/ui.test.ts
```

Expected: FAIL because `Open Saved Project` and the three descriptions do not exist.

- [ ] **Step 3: Add descriptions and the welcome Open action**

Change `CARDS` in `src/editor/ui/start-screen.tsx` to:

```ts
const CARDS: readonly { garment: GarmentType; label: string; description: string }[] = [
  { garment: "tshirt", label: "T-Shirt", description: "A picture on the front" },
  { garment: "shirt", label: "Shirt", description: "Wraps the body and arms" },
  { garment: "pants", label: "Pants", description: "Covers the waist and legs" },
];
```

Add `onOpen: () => void` and `notice: string | null` props. Render the card text as:

```tsx
<span class="garment-card-label">{card.label}</span>
<span class="garment-card-description">{card.description}</span>
```

Then render this after `.garment-cards`:

```tsx
<button
  type="button"
  class="start-open-button"
  aria-label="Open Saved Project"
  onClick={onOpen}
>
  Open Saved Project
</button>
{notice !== null && (
  <p class="start-notice" role="status">
    {notice}
  </p>
)}
```

Add compact styles:

```css
.garment-card-description {
  max-width: 9rem;
  color: var(--muted);
  font-size: 0.85rem;
}

.start-open-button {
  min-height: 48px;
  padding: 0 1.25rem;
  border: 1px solid var(--line);
  border-radius: 0.85rem;
  background: var(--surface);
  cursor: pointer;
  font-weight: 600;
}

.start-notice {
  max-width: 30rem;
  margin: 0;
  padding: 0.6rem 0.9rem;
  border-radius: 0.75rem;
  background: #fef3c7;
  color: #6b4700;
}
```

- [ ] **Step 4: Reuse the current archive loader when no editor session exists**

In `src/editor/ui/designer-app.tsx`:

1. Change `requestOpen` so a null session clicks `openFileInputRef` instead of returning.
2. Remove the early `captured === null` return from `onOpenFile`.
3. Keep the existing stale-result guard `if (sessionRef.current !== captured) return;`. This ensures a slow welcome-screen open cannot replace a garment the user started while the archive was loading.
4. Render the same hidden project input in both the welcome and editor branches.

The welcome branch must be:

```tsx
if (session === null) {
  return (
    <>
      <StartScreen
        onChoose={startGarment}
        onOpen={requestOpen}
        notice={notice}
        onParentSettings={generateEnabled ? () => setParentSheetOpen(true) : undefined}
      />
      {parentSheetOpen && (
        <ParentSettingsSheet
          hasKey={apiKey !== null}
          onSaveKey={(key) => setApiKey(key)}
          onForgetKey={() => setApiKey(null)}
          onClose={() => setParentSheetOpen(false)}
        />
      )}
      <input
        ref={openFileInputRef}
        type="file"
        accept=".rbxcloth.zip,.zip,application/zip"
        hidden
        onChange={onOpenFile}
      />
    </>
  );
}
```

Keep the identical input in the editor branch. Only one branch is mounted at a time.

- [ ] **Step 5: Run archive and welcome tests**

Run:

```bash
npx vitest run --project browser-chromium tests/browser/projects.test.ts tests/browser/ui.test.ts
```

Expected: PASS. Valid saved Pants content opens directly; invalid input keeps all garment cards visible and announces the existing error.

- [ ] **Step 6: Commit the welcome reopening flow**

```bash
git add src/editor/ui/start-screen.tsx src/editor/ui/designer-app.tsx src/styles.css tests/browser/projects.test.ts tests/browser/ui.test.ts
git commit -m "feat: reopen saved projects from welcome screen"
```

### Task 3: Add a clear empty state and remove no-op controls

**Files:**
- Modify: `tests/browser/ui.test.ts`
- Modify: `src/editor/ui/workspace.tsx`
- Modify: `src/editor/ui/editor-screen.tsx`
- Modify: `src/editor/ui/sheets.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Write RED browser assertions for the basic states**

Add tests to `tests/browser/ui.test.ts` which prove:

```ts
test("a new editor points to Add and disables Repeat until a visible picture is selected", async () => {
  const host = mountApp();
  await startEditing(host, "Shirt");
  expect(host.querySelector(".workspace-empty")?.textContent).toBe(
    "Tap Add to add a picture or color.",
  );
  expect(toolbarButton(host, "Repeat").disabled).toBe(true);

  await addColor(host, 0);
  expect(host.querySelector(".workspace-empty")).toBeNull();
  expect(toolbarButton(host, "Repeat").disabled).toBe(true);
  moreButton(host).click();
  await waitFor(() => host.querySelector('[role="dialog"][aria-label="More"]') !== null, "more");
  const more = dialog(host, "More");
  expect(Array.from(more.querySelectorAll("input")).map((input) => input.getAttribute("aria-label"))).toEqual([
    "See-through",
  ]);
});
```

Extend an existing picture-import test to assert Repeat becomes enabled for the visible selected raster, becomes disabled after its visibility is toggled off in Items, and becomes enabled again when shown.

- [ ] **Step 2: Run the UI file and verify empty/dead-state failures**

Run:

```bash
npx vitest run --project browser-chromium tests/browser/ui.test.ts
```

Expected: FAIL because the empty prompt does not exist, toolbar Repeat is enabled, and a solid's More sheet includes transform/crop inputs.

- [ ] **Step 3: Render one pointer-transparent empty-stage prompt**

In the `Workspace` return in `src/editor/ui/workspace.tsx`, insert before the canvases:

```tsx
{props.document.layers.length === 0 && (
  <p class="workspace-empty">Tap Add to add a picture or color.</p>
)}
```

Add:

```css
.workspace-empty {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 1rem;
  color: var(--muted);
  text-align: center;
  pointer-events: none;
}
```

Place the canvas/overlay above or below it consistently so the message remains visible only while the transparent project is empty.

- [ ] **Step 4: Disable Repeat unless it can act**

In `EditorScreen`, derive:

```ts
const repeatDisabled =
  selected === null || selected.kind !== "raster" || !selected.visible;
```

Apply it to the toolbar Repeat button:

```tsx
<button
  type="button"
  aria-label="Repeat"
  disabled={repeatDisabled}
  aria-disabled={repeatDisabled ? "true" : "false"}
  onClick={() => props.onToolbar("repeat")}
>
```

Add `.toolbar button:disabled { opacity: 0.4; cursor: default; }`. Do not change Move: it remains the return-to-Edit action and becomes useful on portrait mobile after visiting Preview.

- [ ] **Step 5: Show only opacity for a solid layer**

In `MoreSheet`, derive the visible main fields and conditionally omit Crop:

```ts
const visibleFields = layer.kind === "solid"
  ? FIELDS.filter((field) => field.key === "see")
  : FIELDS;
```

Use `visibleFields.map` for the existing main-field label/input block. Replace the unconditional Crop block with:

```tsx
{layer.kind === "raster" && (
  <>
    <h3 class="field-group">Crop</h3>
    {CROP_FIELDS.map((field) => (
      <label key={field.key} class="field">
        <span class="field-label">{field.label}</span>
        <input
          type="number"
          data-field={field.key}
          aria-label={`Crop ${field.label}`}
          min={0}
          max={1}
          step={0.01}
          defaultValue={fieldValue(layer, field.key)}
          onChange={onCommit(field.key)}
        />
      </label>
    ))}
  </>
)}
```

- [ ] **Step 6: Run UI tests and commit**

Run:

```bash
npx vitest run --project browser-chromium tests/browser/ui.test.ts
```

Expected: PASS with the exact prompt, accurate Repeat states, and only See-through for solid colors.

```bash
git add src/editor/ui/workspace.tsx src/editor/ui/editor-screen.tsx src/editor/ui/sheets.tsx src/styles.css tests/browser/ui.test.ts
git commit -m "fix: clarify empty and inactive editor states"
```

### Task 4: Add mouse-wheel and trackpad zoom to the 3D preview

**Files:**
- Modify: `tests/browser/smoke/preview-smoke.test.ts`
- Modify: `src/preview/preview.ts`

- [ ] **Step 1: Add a RED rendered-pixel test for wheel direction and Reset**

Extract the existing red-pixel width calculation from the pinch test into `redPanelWidth(canvas)` and add:

```ts
test("wheel zoom changes avatar size, prevents canvas scroll, clamps, and Reset restores it", async () => {
  const harness = setup("shirt");
  try {
    harness.handle.updateCanvas(atlasFixture(STANDARD_QUADRANTS));
    await settle();
    const before = redPanelWidth(harness.canvas);

    const zoomIn = new WheelEvent("wheel", { deltaY: -240, cancelable: true, bubbles: true });
    harness.canvas.dispatchEvent(zoomIn);
    await settle();
    const afterIn = redPanelWidth(harness.canvas);
    expect(zoomIn.defaultPrevented).toBe(true);
    expect(afterIn).toBeGreaterThan(before);

    for (let index = 0; index < 100; index += 1) {
      harness.canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: -1000, cancelable: true }));
    }
    await settle();
    const clampedIn = redPanelWidth(harness.canvas);
    expect(clampedIn).toBeGreaterThanOrEqual(afterIn);

    harness.canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: 1000, cancelable: true }));
    await settle();
    expect(redPanelWidth(harness.canvas)).toBeLessThan(clampedIn);

    harness.handle.resetView();
    await settle();
    expect(redPanelWidth(harness.canvas)).toBeCloseTo(before, 0);
  } finally {
    harness.dispose();
  }
});
```

Keep the pinch test using the same helper so touch behavior remains covered.

- [ ] **Step 2: Run the real WebGL test and confirm wheel has no effect**

Run:

```bash
npx vitest run --project browser-preview-smoke tests/browser/smoke/preview-smoke.test.ts
```

Expected: FAIL because `defaultPrevented` is false and the rendered red-panel width is unchanged.

- [ ] **Step 3: Implement bounded multiplicative wheel zoom on the renderer canvas**

In `src/preview/preview.ts`, add:

```ts
const WHEEL_ZOOM_RATE = 0.0015;

function wheelDeltaPixels(event: WheelEvent, pageHeight: number): number {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * 16;
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return event.deltaY * pageHeight;
  return event.deltaY;
}
```

Inside `createPreview`, after `applyOrbit` exists:

```ts
const onWheel = (event: WheelEvent): void => {
  const delta = wheelDeltaPixels(event, Math.max(1, domElement.clientHeight));
  if (delta === 0) return;
  event.preventDefault();
  distance = Math.min(
    MAX_DISTANCE,
    Math.max(MIN_DISTANCE, distance * Math.exp(delta * WHEEL_ZOOM_RATE)),
  );
  applyOrbit();
};
```

Register and remove it on the same canvas:

```ts
domElement.addEventListener("wheel", onWheel, { passive: false });
// in dispose()
domElement.removeEventListener("wheel", onWheel);
```

Do not add OrbitControls or a render loop. Positive `deltaY` zooms out; negative `deltaY` zooms in; the existing `MIN_DISTANCE`, `MAX_DISTANCE`, and `resetView()` remain the single camera limits/default source.

- [ ] **Step 4: Run preview tests and commit**

Run:

```bash
npx vitest run --project browser-preview-smoke tests/browser/smoke/preview-smoke.test.ts
```

Expected: PASS in Chromium and WebKit; the existing drag, pinch, texture, context-loss, and disposal tests remain green.

```bash
git add src/preview/preview.ts tests/browser/smoke/preview-smoke.test.ts
git commit -m "feat: zoom 3d preview with the wheel"
```

### Task 5: Keep picture controls reachable and add wheel scaling with one-step undo

**Files:**
- Modify: `tests/browser/gestures.test.ts`
- Modify: `src/editor/ui/gestures.ts`
- Modify: `src/editor/ui/workspace.tsx`
- Modify: `src/editor/ui/designer-app.tsx`

- [ ] **Step 1: Add RED geometry and wheel tests**

In `tests/browser/gestures.test.ts`, add a pure handle-bounds assertion using a new optional bounds argument:

```ts
test("full-map and oversized artwork handles stay inside the clothing canvas", () => {
  const full = footprintGeometry(
    { ...DECAL_DEFAULT, positionX: 292.5, positionY: 279.5, scaleX: 4, scaleY: 4 },
    { width: 400, height: 300 },
    { width: 585, height: 559, inset: 16 },
  );
  for (const handle of [full.scaleHandle, full.rotateHandle]) {
    expect(handle.x).toBeGreaterThanOrEqual(16);
    expect(handle.x).toBeLessThanOrEqual(569);
    expect(handle.y).toBeGreaterThanOrEqual(16);
    expect(handle.y).toBeLessThanOrEqual(543);
  }
});
```

Add a browser journey which synchronously dispatches four cancelable `deltaY: -100` wheel events over the selected picture center, checks `defaultPrevented`, waits past the burst timeout, and verifies both axes grew to at least 175%. The lower bound is load-bearing: a stale render-time session closure would apply every event to the original 100% transform and stop near 116%. Prove one Undo restores 100% while a second Undo removes the added picture. Then dispatch over an empty point and assert `defaultPrevented === false`, scale unchanged, and no new Undo entry.

Add a controller-harness test that starts an eligible wheel burst and calls `destroy()` before the timeout; require `cancel-gesture` after `begin-gesture` and no `commit-gesture`.

- [ ] **Step 2: Run gesture tests and verify all three missing behaviors are RED**

Run:

```bash
npx vitest run --project browser-chromium tests/browser/gestures.test.ts
```

Expected: FAIL because the third `footprintGeometry` argument and wheel listener do not exist; dispatched wheel events are not prevented and do not create a grouped history change.

- [ ] **Step 3: Add optional handle bounds without changing existing geometry callers**

In `src/editor/ui/gestures.ts`, add:

```ts
export interface HandleBounds {
  width: number;
  height: number;
  inset: number;
}

function clampPoint(point: Point, bounds: HandleBounds): Point {
  return {
    x: Math.min(bounds.width - bounds.inset, Math.max(bounds.inset, point.x)),
    y: Math.min(bounds.height - bounds.inset, Math.max(bounds.inset, point.y)),
  };
}
```

Give `footprintGeometry` an optional third `bounds?: HandleBounds` argument. Compute the raw handles exactly as today, then return raw handles when bounds are absent or `clampPoint(rawHandle, bounds)` when present. Corners, center, half sizes, and rotation stay unchanged.

In both `Workspace` calls to `footprintGeometry`, pass the current template bounds:

```ts
const handleBounds = { width: template.width, height: template.height, inset: 16 };
const footprint = footprintGeometry(layer.transform, asset, handleBounds);
```

Use the same bounded footprint for drawing and for `itemFootprint`; this keeps what the user sees aligned with hit testing.

- [ ] **Step 4: Add eligible wheel bursts to the existing controller**

In `createGestureController`, add:

```ts
const WHEEL_BURST_MS = 160;
const WHEEL_SCALE_RATE = 0.0015;
let wheelGestureActive = false;
let wheelCommitTimer: number | null = null;

const finishWheelGesture = (): void => {
  if (!wheelGestureActive) return;
  if (wheelCommitTimer !== null) window.clearTimeout(wheelCommitTimer);
  wheelCommitTimer = null;
  wheelGestureActive = false;
  options.dispatch({ type: "commit-gesture" });
};

const cancelWheelGesture = (): void => {
  if (!wheelGestureActive) return;
  if (wheelCommitTimer !== null) window.clearTimeout(wheelCommitTimer);
  wheelCommitTimer = null;
  wheelGestureActive = false;
  options.dispatch({ type: "cancel-gesture" });
};
```

Add a local wheel delta normalizer equivalent to the preview normalizer, using `overlay.offsetHeight` for page units. Then add:

```ts
const onWheel = (event: WheelEvent): void => {
  if (itemGesture !== null || viewportActive || pointers.size > 0) return;
  const id = options.selectedId();
  if (id === null) return;
  const layer = options.getSession().document.layers.find((candidate) => candidate.id === id);
  if (layer === undefined || layer.kind !== "raster" || !layer.visible) return;
  const footprint = options.itemFootprint(id);
  if (footprint === null) return;
  const point = screenToCanvas(event.clientX, event.clientY);
  if (!pointInFootprint(footprint, point)) return;
  const delta = normalizedWheelDelta(event, Math.max(1, overlay.offsetHeight));
  if (delta === 0) return;

  event.preventDefault();
  if (!wheelGestureActive) {
    options.dispatch({ type: "begin-gesture" });
    wheelGestureActive = true;
  }
  const factor = Math.min(1.25, Math.max(0.8, Math.exp(-delta * WHEEL_SCALE_RATE)));
  options.dispatch({
    type: "update-gesture",
    mutation: { op: "patch-transform", id, patch: scaleBy(layer.transform, factor) },
  });
  if (wheelCommitTimer !== null) window.clearTimeout(wheelCommitTimer);
  wheelCommitTimer = window.setTimeout(finishWheelGesture, WHEEL_BURST_MS);
};
```

Call `finishWheelGesture()` at the start of a valid pointer or keyboard interaction so gesture histories never nest. Register with `{ passive: false }`. On `destroy()`, remove the listener and call `cancelWheelGesture()` before clearing controller state.

The existing `MIN_ITEM_SCALE` in `scaleBy` remains the lower bound. Wheel scaling changes only `scaleX`/`scaleY`, so the picture center remains fixed and non-uniform proportions are preserved proportionally.

- [ ] **Step 5: Feed the controller the synchronous session reference**

In the `EditorScreen` props in `src/editor/ui/designer-app.tsx`, replace the render-time closure:

```tsx
getSession={() => session}
```

with:

```tsx
getSession={() => sessionRef.current ?? session}
```

`commitSession` updates `sessionRef.current` synchronously before Preact renders. This makes each same-task wheel event multiply the transform produced by the preceding event instead of overwriting it with another patch derived from the burst's starting transform.

- [ ] **Step 6: Run gesture tests and preserve all touch/keyboard tests**

Run:

```bash
npx vitest run --project browser-chromium tests/browser/gestures.test.ts
```

Expected: PASS. The existing one-finger drag, two-finger viewport takeover, pinch, pointer-cancel, keyboard transform, and destroy tests must remain green.

- [ ] **Step 7: Commit picture interaction polish**

```bash
git add src/editor/ui/designer-app.tsx src/editor/ui/gestures.ts src/editor/ui/workspace.tsx tests/browser/gestures.test.ts
git commit -m "feat: scale pictures with reachable controls"
```

### Task 6: Make More easy to dismiss and keep Done on-screen

**Files:**
- Modify: `tests/browser/ui.test.ts`
- Modify: `src/editor/ui/sheets.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Add RED More-sheet behavior and geometry tests**

Add one browser test in `tests/browser/ui.test.ts` that:

1. Starts a Shirt, adds a picture, opens More, changes Size, and clicks inside the `.sheet`; the dialog remains.
2. Clicks `.sheet-backdrop`; the dialog closes and the changed Size remains after reopening.
3. Dispatches `keydown` with `key: "Escape"` on `window`; More closes.
4. At viewport 390x844, opens More and asserts `.sheet-done.getBoundingClientRect().bottom <= innerHeight` before any scrolling.

Use the current helpers and restore the default 414x896 viewport in `finally`.

- [ ] **Step 2: Run the UI test and confirm backdrop, Escape, and sticky geometry fail**

Run:

```bash
npx vitest run --project browser-chromium tests/browser/ui.test.ts
```

Expected: FAIL because backdrop and Escape do not close More and Done starts below the viewport.

- [ ] **Step 3: Give SheetBackdrop an opt-in dismiss action**

Change `SheetBackdrop` in `src/editor/ui/sheets.tsx` to accept `onDismiss?: () => void` and `sheetClass?: string`, then use target equality:

```tsx
export function SheetBackdrop({
  label,
  children,
  onDismiss,
  sheetClass,
}: {
  label: string;
  children: ComponentChildren;
  onDismiss?: () => void;
  sheetClass?: string;
}) {
  return (
    <div
      class="sheet-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onDismiss?.();
      }}
    >
      <div
        class={`sheet${sheetClass === undefined ? "" : ` ${sheetClass}`}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        {children}
      </div>
    </div>
  );
}
```

Only `MoreSheet` passes `onDismiss={props.onClose}` and `sheetClass="more-sheet"`. Leave Add, Color, Items, Generate, Question, and Disclaimer behavior unchanged.

- [ ] **Step 4: Add Escape cleanup and give More an anchored footer**

In `MoreSheet`, add an effect:

```ts
useEffect(() => {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") props.onClose();
  };
  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}, [props.onClose]);
```

Give its Done button both classes:

```tsx
<button type="button" class="sheet-done more-sheet-done" aria-label="Done" onClick={props.onClose}>
  Done
</button>
```

Add:

```css
.more-sheet {
  overflow: hidden;
}

.more-sheet .more-form {
  min-height: 0;
  overflow-y: auto;
}

.more-sheet-done {
  flex: 0 0 auto;
  background: var(--surface);
  box-shadow: 0 -0.5rem 0.75rem rgba(15, 18, 25, 0.08);
}
```

The sheet itself no longer scrolls; only its form does. The title and Done footer therefore stay visible without relying on a sticky element whose normal position starts after the long form.

- [ ] **Step 5: Run UI tests and commit**

Run:

```bash
npx vitest run --project browser-chromium tests/browser/ui.test.ts
```

Expected: PASS. Inside clicks do not close More; backdrop, Escape, and Done do; committed changes remain; Done is initially reachable on phone portrait.

```bash
git add src/editor/ui/sheets.tsx src/styles.css tests/browser/ui.test.ts
git commit -m "fix: make more sheet easy to close"
```

### Task 7: Document controls and run the full release-quality verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a concise controls section to README**

After the opening paragraph, add:

```md
## Editor controls

- Start with T-Shirt for a front-only picture, Shirt for body-and-arm wrapping, or Pants for waist-and-leg wrapping. Open Saved Project reopens a local `.rbxcloth.zip` without starting a new garment.
- In Edit, drag a selected picture to move it, use its cyan handle to resize, its white handle to rotate, or use the mouse wheel/trackpad over the picture to resize it.
- In Preview, drag to rotate the avatar and pinch or use the mouse wheel/trackpad to zoom. Reset restores the default view.
- Save downloads an editable `.rbxcloth.zip`; Export downloads the Roblox-sized PNG. The app stores neither file nor API key after the browser session ends.
```

- [ ] **Step 2: Run static checks and focused suites**

Run:

```bash
npm run typecheck
npm run lint
npm run test:unit
npm run test:browser
```

Expected: all commands exit 0. Browser coverage includes real Chromium/WebKit WebGL preview checks and all three portable engines where configured.

- [ ] **Step 3: Run production artifact, offline, and end-to-end gates**

Run:

```bash
npm run build
npm run check:bundle
npm run test:pwa
npm run test:e2e
git diff --check
```

Expected: all commands exit 0, bundle budgets remain within the existing limits, the service worker passes offline/cache isolation checks, the mobile layout journey passes in Chromium/Firefox/WebKit, and `git diff --check` is silent.

- [ ] **Step 4: Reproduce the key layouts through Brave CDP**

With Vite running at `http://127.0.0.1:5173/rbx-fashion/`, launch:

```bash
/usr/bin/brave-browser-stable --remote-debugging-port=9222
agent-browser --cdp 9222 open http://127.0.0.1:5173/rbx-fashion/
```

Check 390x844, 844x390, and 1440x900. At 844x390, choose Shirt while Edit is active and verify both 2D and 3D content are visible, the toolbar is on-screen, the document does not scroll vertically, More has an immediately visible Done button, and wheel interactions affect only the surface under the pointer.

- [ ] **Step 5: Run the honest Roblox release gate without weakening it**

Run:

```bash
npm run check:release
```

Expected before real Roblox Studio/device evidence is supplied: exit 1 with only the named calibration, physical-device, and upload evidence gaps already documented by the repository. Do not fabricate evidence, remove this gate, or describe it as passing.

- [ ] **Step 6: Commit documentation and any test-only final corrections**

```bash
git add README.md
git commit -m "docs: explain editor controls"
git status --short
```

Expected: the commit succeeds and `git status --short` is empty. Do not push or deploy without a separate explicit request.

### Task 8: Make layer visibility and copying obvious

**Files:**
- Modify: `src/editor/ui/icons.tsx`
- Modify: `src/editor/ui/items-panel.tsx`
- Modify: `src/styles.css`
- Test: `tests/browser/ui.test.ts`
- Test: `tests/browser/asset-lifecycle.test.ts`

- [ ] **Step 1: Write failing browser assertions for visible state and wording**

Extend the existing Items-sheet browser test so the visible layer starts with a normal eye and
`aria-pressed="true"`; after Hide is clicked, the same control is labeled Show, has
`aria-pressed="false"`, contains the crossed-eye slash, and computes to reduced opacity. Assert
that the copy control has `aria-label="Copy item"`, visibly renders `Copy`, remains at least 44px
square, and still creates exactly one duplicate. At the phone viewport, assert the item row does
not overflow horizontally. Update existing test selectors from `Duplicate` to `Copy item` without
changing their behavioral expectations.

- [ ] **Step 2: Run the focused test and verify RED**

```bash
npx vitest run tests/browser/ui.test.ts --project browser-chromium -t "items sheet supports"
```

Expected: FAIL because the current eye never changes or dims and the duplicate button has no
visible label.

- [ ] **Step 3: Add a crossed-eye icon and render the state explicitly**

Add `IconEyeOff` beside `IconEye` in `src/editor/ui/icons.tsx`, reusing the eye paths plus a
diagonal slash:

```tsx
export function IconEyeOff(): JSX.Element {
  return strokeIcon([
    "M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z",
    "M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z",
    "M3 3l18 18",
  ]);
}
```

In `ItemsPanel`, render `IconEye` only for a visible layer and `IconEyeOff` otherwise. Give the
visibility button the `item-tool-visibility` class. Change the duplicate control to
`aria-label="Copy item"`, add `item-tool-copy`, and render a visible label after its icon:

```tsx
<span class="item-tool-label">Copy</span>
```

Keep `onToggleVisibility`, `onDuplicate`, reducer actions, item limits, archive format, and layer
semantics unchanged.

- [ ] **Step 4: Add compact mobile-safe styling**

```css
.item-tool-visibility[aria-pressed="false"] {
  color: var(--muted);
  opacity: 0.45;
}

.item-tool-copy {
  flex-direction: column;
  gap: 1px;
  line-height: 1;
}

.item-tool-copy svg {
  width: 17px;
  height: 17px;
}

.item-tool-label {
  font-size: 0.62rem;
  font-weight: 600;
}
```

Do not add tooltips or a second action row. The label must remain visible on touch devices while
the existing scrollable Items sheet handles the eight-item maximum.

- [ ] **Step 5: Run focused and complete verification**

```bash
npx vitest run tests/browser/ui.test.ts tests/browser/asset-lifecycle.test.ts --project browser-chromium
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

Expected: all commands exit 0. Manually verify at 390x844 that hidden state is immediately distinct,
Copy is readable, the row remains within the Items sheet, and both controls still perform exactly
one action per press.

- [ ] **Step 6: Commit and push the approved follow-up**

```bash
git add docs/2026-08-28-basic-editor-ux-implementation-plan.md src/editor/ui/icons.tsx \
  src/editor/ui/items-panel.tsx src/styles.css tests/browser/ui.test.ts \
  tests/browser/asset-lifecycle.test.ts
git commit -m "fix: clarify layer visibility and copying"
git push origin main
```

Expected: local and remote `main` point to the new commit and CI starts for that SHA.

## Completion criteria

- At 844x390, the app mounts usable 2D and 3D stages and keeps Tools inside `100dvh` whether the phone entered landscape from Edit or Preview; at 667x375, the single-pane landscape layout also stays within `100dvh`.
- Welcome-screen users can distinguish the three garment types and reopen a saved local project.
- Empty and inapplicable states do not leave a child with a blank canvas or clickable no-op Repeat action.
- Imported raster artwork can be moved, uniformly resized, and rotated with reachable controls; same-task wheel events accumulate and each burst undoes as one action.
- The 3D preview supports drag, pinch, wheel zoom, clamping, and Reset.
- More closes by backdrop, Escape, or its always-visible Done button without discarding edits.
- Hidden Items use a crossed and dimmed eye; every copy action has a visible `Copy` label without
  overflowing the phone-width Items sheet.
- No dependency, schema, geometry, compositor, export-format, pants-mapping, persistence, or AI-scope expansion occurs.
- All automated gates pass except the deliberately unmet manual Roblox release-evidence gate.
