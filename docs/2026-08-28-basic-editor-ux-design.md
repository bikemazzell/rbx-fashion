# Basic Editor UX Completion Design

## Goal

Make the current editor reliably usable by an 8- to 10-year-old on a phone, tablet, or desktop without turning it into a general-purpose design application. This work completes the two approved interaction specs and fixes basic first-use and mobile-layout gaps found in a live Brave/CDP audit.

## Verified findings

The audit used the local Vite app at desktop (1440x900), phone portrait (390x844), and phone landscape (844x390), plus the supplied physical-device screenshot.

1. At 844x390, CSS displays two panes but `PreviewPane` is inactive unless the app is in desktop mode or the Preview tab was already selected. The right pane is therefore empty after rotating from Edit.
2. If Preview was selected before rotating, the document grew to 1,064px tall in a 390px viewport. The 3D stage grew to 923px and pushed the toolbar off-screen. Sub-700px landscape phones have the same short-height risk even though they keep the single-pane tab layout.
3. The existing viewport browser test passes because it checks the visibility of the empty `.pane-preview` section, not the presence of `.preview-stage` or page overflow.
4. The More sheet puts Done below the viewport on desktop and mobile. Clicking the backdrop and pressing Escape do not close it.
5. A full-map or oversized selected picture can put its scale and rotate handles outside the clothing canvas. Mouse-wheel scaling is absent even though touch and keyboard transformations exist.
6. The 3D preview supports drag and pinch but not mouse-wheel or trackpad zoom.
7. The welcome screen does not explain the garment choices and cannot open a saved `.rbxcloth.zip` project. A returning user must start a throwaway garment first.
8. A new project shows a blank 2D stage. The only instruction is in the Items panel, which is hidden behind a button on mobile.
9. Repeat remains enabled with no selected picture or with a solid-color layer, even though activating it has no effect. More exposes picture transform and crop fields for solid colors even though a color is intended to fill the garment.

The existing save/open archive logic, image dimension routing, layer management, touch item gestures, 3D orbit/pinch, compositing, and export paths are already covered by passing tests and do not need redesign.

## Chosen approach

Use targeted corrections inside the current Preact, Canvas, and Three.js architecture:

- Add one `dualPane` media-query state that matches the existing 700px landscape CSS breakpoint. It controls whether the 3D component is mounted; `desktop` continues to control only the Items rail.
- In landscape, make the editor a fixed `100dvh` flex shell and let stages shrink at every width. Portrait retains its current minimum-height/page-scroll fallback for unusually short split-screen viewports. Sheets retain their own scrolling.
- Reuse the existing archive input and loader on the welcome screen. No persistence, account, server, or browser database is introduced.
- Add short garment descriptions and one pointer-transparent empty-stage prompt.
- Disable Repeat unless a visible raster layer is selected. Keep Move as the existing return-to-edit action, and show only opacity in More for solid-color layers.
- Extend the current gesture controller with an eligible, non-passive wheel interaction. Wheel events over the selected picture read the synchronously updated session reference, scale it uniformly, and coalesce into one undo entry per burst.
- Clamp the displayed and hit-tested scale/rotate handles to the clothing canvas so they remain reachable for full-map and oversized images.
- Add a non-passive wheel handler directly to the Three.js canvas for camera-distance zoom.
- Make only the More sheet dismissible by backdrop click and Escape, and keep its Done button anchored while only the fields scroll. Other sheets retain their current explicit actions.

This approach adds no runtime dependency and no project-file field.

## User-visible behavior

### Welcome and reopening

The garment cards read:

- **T-Shirt** — “A picture on the front”
- **Shirt** — “Wraps the body and arms”
- **Pants** — “Covers the waist and legs”

The pants wording intentionally explains why the classic pants texture includes the avatar's waist/torso region. The mapping itself does not change.

An **Open Saved Project** button accepts `.rbxcloth.zip` and `.zip` files directly from the welcome screen. A valid project opens normally. An invalid or oversized file leaves the welcome screen in place and shows the existing plain-language error.

### Empty and inapplicable states

A project with no layers shows “Tap Add to add a picture or color.” centered over the 2D stage. It disappears as soon as the first layer exists.

Repeat is disabled when there is no selected visible raster picture. It is enabled for a selected visible picture. A solid color still shows Fill Clothing as its fixed placement, and More shows only See-through.

### Mobile layout

Portrait keeps Edit/Preview tabs and may page-scroll only when a very short split-screen viewport cannot contain its minimum stage. Every landscape size fits the header, active pane(s), tabs where applicable, and toolbar inside `100dvh`; neither the document nor body scrolls vertically. At 700px or wider in landscape, Edit and Preview are both mounted and visible even if the device rotated while Edit was active. Stages may shrink below 240px in short landscape viewports.

### Picture and preview interaction

- Dragging selected artwork continues to move it.
- The cyan corner handle uniformly scales it.
- The white top handle rotates it.
- Both handles stay within the clothing canvas for full-map and oversized artwork.
- A wheel/trackpad gesture over the selected picture scales the picture, keeps its center fixed, prevents page scrolling, and creates one undo step for the burst.
- A wheel outside the selected picture neither changes it nor prevents normal scrolling.
- A wheel/trackpad gesture over the 3D canvas changes camera distance within the existing pinch limits and prevents page scrolling only over that canvas.
- Reset restores the default 3D camera.

### More sheet

The More sheet closes when the user taps/clicks its dim backdrop, presses Escape, or presses Done. Interacting inside it does not dismiss it, and already-committed changes remain. Done stays visible at the bottom while only the fields scroll.

## Testing

Tests must reproduce the observed failures rather than only inspect CSS classes:

- At 844x390 after choosing Shirt from the welcome screen, `.preview-stage` is mounted, both stages have positive usable height, the toolbar bottom is within `innerHeight`, and document/body scroll height does not exceed the viewport by more than rounding tolerance.
- At 667x375, the single-pane landscape layout keeps its tabbar, stage, and toolbar visible without document/body overflow.
- Portrait 390x844 and desktop 1440x900 retain their current tab/rail behavior.
- The welcome screen can open a generated valid project archive and reports invalid input without leaving the screen.
- Garment descriptions, the empty prompt, Repeat enablement, and solid-only More fields have browser assertions.
- Wheel tests prove eligibility, scaling direction, cumulative same-task updates, clamping, `preventDefault`, burst undo grouping, and cleanup.
- A real WebGL browser test proves that 3D wheel zoom changes the rendered avatar size and Reset restores it.
- More tests cover backdrop, inside click, Escape, anchored Done geometry, and preserved edits.

The existing unit, browser, bundle, PWA, and three-engine end-to-end gates remain mandatory. The Roblox Studio calibration release gate remains separate and must not be represented as completed by this UX work.

## Explicitly deferred

- 3D geometry editing or layered clothing
- A visible Roblox UV/template editing mode
- Autosave, cloud storage, accounts, or browser project libraries
- A tutorial carousel, onboarding wizard, or tooltip system
- New transform panels, extra toolbar modes, or new runtime dependencies
- Changing the classic pants mapping
- Full-template AI generation
