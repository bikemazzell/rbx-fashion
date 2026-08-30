# Direct Rectangle Editing Design

**Date:** 2026-08-30

## Goal

Make rectangular cutouts and solid colors intuitive to shape directly in the 2D workspace. A child should be able to make a cutout skinny, wide, short, or tall by dragging its sides, without opening a scrolling form. Choosing a color should create an editable color rectangle instead of filling all clothing automatically.

This replaces the current new-color behavior. It does not add a second color mode or ask the child to choose between **Fill Clothing** and **Patch**.

## Child-facing behavior

### Add a color

1. Open **Add** and choose **Choose Color**, or use the existing **Color** control.
2. Choose a swatch.
3. If a solid-color layer is already selected, the swatch changes that layer's color as it does today.
4. Otherwise, the editor creates and selects a color rectangle in the middle of the 2D canvas.

The initial rectangle is 40% of the canonical canvas width and 30% of its height. It is large enough to notice and manipulate on a phone without resembling a full-clothing fill.

New color layers are named `Color 1`, `Color 2`, and so on, retain the existing item limit, and support the existing visibility, copy, rename, delete, reorder, undo, redo, opacity, save, open, preview, and export behavior.

### Direct rectangle controls

A selected color rectangle or Cut Out displays:

- a blue outline;
- four side handles at the midpoint of its left, right, top, and bottom edges;
- the existing blue corner handle for proportional resizing;
- the existing white rotation handle.

Dragging inside moves the rectangle. Dragging a side handle moves only that edge along the rectangle's local axis while the opposite edge stays fixed. This changes one dimension and shifts the center by half the dragged distance. The same rule applies after rotation, so the handles continue to follow the visible rectangle rather than the screen axes.

Dragging the corner handle preserves the rectangle's current proportions. Dragging the rotation handle rotates it around its center. Pointer cancellation restores the pre-gesture geometry. Each completed drag produces one undo entry.

The visible side handles remain compact, but each has a minimum 44-by-44 CSS-pixel hit target for touch. Handle hit testing takes priority over dragging the rectangle itself. Rectangle width and height remain finite and positive, with a small minimum that prevents a side from crossing its opposite side.

### More sheet

Direct manipulation replaces the **Wide** and **Tall** fields for color rectangles and Cut Outs. Those fields are removed from their More sheets rather than retained as a second primary resizing system.

The Cut Out More sheet retains precise Left/Right, Up/Down, Turn, and uniform Size controls. The color-rectangle More sheet retains Left/Right, Up/Down, Turn, uniform Size, and See-through. These controls use a compact two-column layout so the sheet and its always-visible Done button fit without an internal scrolling region at supported mobile sizes.

Raster-picture controls are unchanged. Their existing independent width, height, and crop fields remain available because this change is scoped to rectangle cutouts and solid-color rectangles.

## Existing project compatibility

The existing project schema already gives solid layers a placement and transform, so no new layer kind or schema version is required.

Newly created solid layers use decal placement with a centered transform whose `scaleX` and `scaleY` are the rectangle's canonical pixel width and height. The compositor already renders a decal solid as a transformed, garment-clipped rectangle.

Previously saved solid layers that use the old full-clothing representation continue to render unchanged when opened. This compatibility exception does not restore the old creation mode: all newly added colors are rectangles. Recoloring an old selected solid changes only its color and does not unexpectedly alter its coverage.

## Shared geometry and gestures

Extend the existing editable-footprint geometry with four edge-handle points and an edge identifier. Both Cut Out and new decal-solid layers use the same hit testing and edge-resize calculations.

For an edge drag:

1. Transform the pointer into rectangle-local coordinates.
2. Keep the opposite local edge fixed.
3. Clamp the dragged edge before it crosses the minimum size.
4. Calculate the new local center and width or height.
5. Rotate the center offset back into canvas coordinates.
6. Map the result to a Cut Out rectangle patch or solid transform patch.

Raster layers continue using their current move, uniform-resize, rotate, wheel, and keyboard paths. Old full-clothing solid layers remain non-directly-transformable so opening an existing project cannot silently change its result.

## Rendering and ordering

No new rendering path is introduced. A color rectangle remains a normal paint layer and is clipped to the valid Roblox clothing panels by the existing decal compositor. It participates in ordinary paint ordering, so artwork above it covers it and artwork below it is covered by it.

Visible Cut Outs still run after all paint using `destination-out`, so they erase color rectangles and other artwork regardless of paint order. The 2D workspace, 3D preview, PNG export, and saved project continue to consume the same canonical composition.

## Mobile and accessibility

- Side handles work with mouse, touch, and pen pointer events.
- Touch hit targets are at least 44 CSS pixels even when the canvas is zoomed or fitted down.
- Resizing does not cause page scrolling or browser gestures while an item gesture is active.
- Selection handles remain reachable at canvas boundaries and in portrait and landscape layouts.
- The visible handle shapes are distinct from the outline and maintain strong contrast in both themes.
- The change adds no dependency, persistent browser storage, server call, or additional bitmap.

## Validation and failure behavior

- Reject non-finite centers, rotations, widths, heights, and scales.
- Clamp direct resizing to the existing minimum transform size.
- If a gesture is cancelled or loses its pointer, restore the original geometry.
- If the eight-item limit is reached, choosing a color leaves the document unchanged and shows the existing item-limit notice.
- A color rectangle may extend beyond the canonical canvas; rendering remains clipped to valid garment panels.

## Testing

Automated coverage will prove:

- choosing a swatch with no selected solid creates a centered 40%-by-30% decal-solid rectangle;
- choosing a swatch with a selected solid only recolors it;
- left, right, top, and bottom drags resize one axis with the opposite edge fixed;
- edge resizing remains correct at nonzero rotation;
- each side has a touch-sized screen-space hit target;
- corner resizing stays proportional and rotation still works;
- Cut Outs and color rectangles share the edge interaction but dispatch the correct state mutation;
- cancelled gestures restore geometry and completed gestures create one undo entry;
- Wide and Tall are absent from Cut Out and color-rectangle More sheets, whose content fits supported mobile viewports without internal scroll;
- old saved full-clothing colors reopen and render unchanged;
- new color rectangles survive save/open and render identically in 2D, preview, offline mode, and exact-size PNG export;
- portrait, landscape, desktop, typecheck, lint, unit, browser, bundle, PWA, and cross-browser E2E gates remain green.

## Deferred

- freehand color painting;
- circles, polygons, gradients, borders, and feathered rectangles;
- snapping, alignment guides, and numeric edge coordinates;
- independent corner dragging that changes both axes without preserving proportions;
- changing Roblox avatar geometry;
- direct Roblox upload.
