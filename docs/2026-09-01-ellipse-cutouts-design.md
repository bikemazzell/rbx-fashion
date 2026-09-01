# Ellipse Cutouts Design

**Date:** 2026-09-01

## Goal

Let a child make transparent circles and ovals with the same Cut Out tool already used for rectangles. The result must remain easy to draw and reshape on a phone, visible in the 2D and 3D previews, preserved in saved projects, and exported as alpha in the canonical Roblox PNG.

This feature also closes the discovered mobile-landscape regression where the rectangle More form still scrolls internally.

## Child-facing interaction

### Choose a shape

**Add** continues to contain one **Cut Out** action. Selecting it opens a compact shape sheet with two large choices:

- **Rectangle**;
- **Oval**.

Each choice includes a simple code-native shape icon and a visible text label. Choosing a shape closes the sheet, activates the 2D editor, and shows the existing draw instruction and Cancel action. There is no second toolbar tool and no permanent shape selector.

### Draw and edit

Dragging after choosing Rectangle creates the existing rectangular cutout. Dragging after choosing Oval creates an ellipse inscribed within the dragged bounding rectangle. A tap creates a useful centered default: Rectangle uses the current default rectangle, while Oval uses a circle whose diameter fits the existing default bounds.

After creation, both shapes share the existing direct controls:

- drag inside the visible shape to move it;
- drag a side handle to change one dimension while keeping the opposite side fixed;
- drag the corner handle to resize proportionally;
- drag the rotation handle to rotate;
- use wheel or keyboard controls where the existing editor supports them.

For an ellipse, hit testing follows the visible oval rather than its full bounding box. Empty corner areas of the bounding box do not select or move it. Handles remain on the bounding box because they express width and height clearly. A circle is simply an ellipse whose width equals its height; proportional corner resizing preserves that equality.

New layers are named `Rectangle Cut Out 1`, `Oval Cut Out 2`, and so on using one monotonic cutout counter. Existing saved layer names are preserved.

## Items and precision controls

Rectangle and Oval Cut Outs share visibility, copy, rename, delete, selection, undo, redo, and the existing paint-suffix ordering rules. Copy preserves the shape.

The selection bar says **Rectangle Cut Out** or **Oval Cut Out**. The More sheet retains Left/Right, Up/Down, Turn, and uniform Size. Independent width and height remain direct side-handle operations rather than modal fields.

The Rectangle Cut Out, Oval Cut Out, and Color Patch More forms use a compact two-column layout that fits, together with the Done button, at the supported 844-by-390 landscape viewport. Neither these forms nor their sheets have a vertical scrollbar. Raster More remains unchanged because its larger precision/crop form legitimately needs overflow handling.

## Project schema and migration

Saved projects move to schema version 3. A v3 Cut Out adds one required field:

```ts
shape: "rectangle" | "ellipse";
```

The rest of the Cut Out remains its center, width, height, and rotation rectangle. This is the shape's bounding rectangle, not a second visual object.

Opening behaves as follows:

- valid v1 projects migrate through the current v1-to-v2 path and then to v3;
- valid v2 projects migrate in memory to v3, adding `shape: "rectangle"` to every existing Cut Out;
- valid v3 projects open directly;
- unknown versions and malformed or unknown shape values are rejected;
- all new saves use v3.

A schema bump is required because an older editor does not understand ellipse semantics and must not silently open and later resave an ellipse project as rectangles or discard shape data.

The persisted Cut Out shape remains strict: v3 rejects missing shape, unknown values, and paint-only properties. Migration never changes existing layer names, IDs, visibility, geometry, assets, paint ordering, or pixels.

## Rendering

The canonical Canvas 2D compositor remains the only rendering source.

- Rectangle uses the existing rotated `fillRect` under `destination-out`.
- Ellipse translates to the Cut Out center, rotates by its angle, begins a path, calls `ellipse(0, 0, width / 2, height / 2, 0, 0, 2π)`, and fills under `destination-out`.

Both clear to alpha zero and run after every paint layer. Antialiasing may create partial alpha only along the edge. The checkerboard and editing handles stay editor-only. The 2D workspace, Three.js preview, exact-size PNG export, save/open archive, and offline PWA all consume the same composed canvas.

## Geometry and gestures

Cut Outs continue to use one shared bounding-footprint geometry. Side and corner resizing therefore require no ellipse-specific scale math.

Selection and move hit testing become shape-aware:

- rectangle: the existing rotated local bounds test;
- ellipse: inverse-rotate the point around the center and test `(x / halfWidth)^2 + (y / halfHeight)^2 <= 1`;
- handles: test first using the existing screen-space touch radius, independent of interior shape;
- hidden layers: remain non-interactive.

Drawing mode stores the chosen shape only as short-lived UI state. Starting a different tool, changing tabs, opening/starting a project, Cancel, Escape, or pointer cancellation clears both the draft and chosen shape. Pointer-up creates exactly one layer and one undo entry.

The overlay draft and selected outline use `strokeRect` for Rectangle and a rotated `ellipse` path for Oval. Side, corner, and rotation handles are unchanged.

## Mobile and accessibility

- Rectangle and Oval choices have visible labels and accessible names.
- Shape choices and Cancel meet the existing 44 CSS-pixel target minimum.
- Drawing and transforms work with mouse, touch, and pen pointer events.
- The shape sheet and draw instruction stay within portrait and landscape viewports.
- The compact Cut Out and Color Patch More sheets have no nested scroll at 390-by-844 or 844-by-390.
- No dependency, server call, extra bitmap, account, or persistent browser setting is introduced.

## Error handling and compatibility

- Reject a v3 Cut Out with a missing or unknown shape.
- Reject zero, negative, or non-finite bounding dimensions and non-finite position/rotation as today.
- Pointer cancellation restores the pre-gesture geometry.
- Cancelling shape selection or drawing does not dirty the project.
- Item-limit rejection exits drawing without creating an orphan selection or history entry.
- Existing v1/v2 archives remain openable; the old implementation correctly rejects v3 rather than damaging it.
- Fully transparent export retains the existing warning; partial ellipse transparency exports normally.

## Testing

Automated tests cover:

- v1/v2 migration to v3 and required rectangle shape insertion;
- strict v3 validation, unknown-version rejection, unknown shapes, hybrid fields, ordering, duplicate IDs, and round trips;
- state creation, naming, copy, hide/show, delete, item cap, undo/redo, and shape preservation;
- compositor pixels inside/outside axis-aligned, rotated, overlapping, and hidden ellipses for T-Shirt, Shirt, and Pants;
- rectangle rendering unchanged after migration;
- Add → Cut Out → Rectangle/Oval selection, cancellation, Escape, taps, mouse/touch drags, and instruction text;
- ellipse-aware hit testing, empty bounding-box corners, move, four side handles, proportional corner resize, rotation, wheel/keyboard controls, pointer cancellation, and one-entry history;
- selection labels, Items labels, preview, save/open, exact-size PNG alpha, offline PWA behavior, and mobile layout;
- a RED-first regression asserting Cut Out/Color rectangle More sheets have no inner overflow at 844-by-390;
- typecheck, lint, unit, browser, build, bundle, PWA, Chromium/Firefox/WebKit E2E, and public Pages smoke checks.

## Deferred

- freehand masks and brush erasing;
- polygons, rounded rectangles, stars, and arbitrary vector paths;
- combining shapes with boolean operations;
- feathered edges or partial mask strength;
- snapping a changed oval back to a perfect circle;
- 3D geometry modification;
- direct Roblox upload.
