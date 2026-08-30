# Transparency Cutouts Design

**Date:** 2026-08-30

## Goal

Let a child make rectangular parts of classic Roblox clothing transparent, see the result in 2D and 3D, adjust it without destroying artwork, save it with the project, and export a Roblox-sized PNG with alpha.

The first release supports rectangular cutouts only. Freehand erasing, preset garment shapes, and 3D geometry editing are deferred.

## Roblox scope

Roblox distinguishes the three classic clothing types:

- A classic T-Shirt is a square graphic on the front torso. If Roblox preserves its PNG alpha, transparency removes part of that graphic but cannot change the clothing silhouette.
- A classic Shirt wraps the upper body and arms. The intended alpha behavior is to reveal the avatar beneath and allow effects such as a tank top.
- Classic Pants wrap the lower torso and legs. The intended alpha behavior is to reveal the avatar beneath and allow effects such as shorts.

The editor will preserve alpha for all three garment types and explain this distinction in concise help text. Export remains PNG because JPEG cannot preserve transparency. Roblox still recommends testing classic clothing in Studio before upload. See the official [Classic clothing documentation](https://create.roblox.com/docs/avatar/classic-clothing).

### What Roblox currently documents

The current official documentation establishes that:

- classic T-Shirts are square front-torso graphics, with 512x512 given as an example;
- classic Shirts and Pants wrap their named body regions and use the published panel sizes;
- the official Shirt and Pants templates are 585x559 PNG files;
- creators may export classic clothing as PNG or JPEG;
- Studio testing is recommended because template limits can affect the result.

The official template ZIP retrieved on 2026-08-30 contains 585x559, 8-bit RGBA Shirt and Pants PNGs, but every template pixel is fully opaque. Roblox's current classic-clothing page does **not** explicitly specify how the `Shirt`, `Pants`, or `ShirtGraphic` runtime handles transparent PNG pixels. Roblox's separate [PBR texture documentation](https://create.roblox.com/docs/art/modeling/surface-appearance) defines alpha 0 as transparent for `SurfaceAppearance` color maps, but that is a different rendering system and is not evidence for classic clothing.

Therefore the editor's file operation is well-defined—write a rectangle with a fully alpha-zero interior into an RGBA PNG—but the avatar result remains a Studio-tested behavior, not a documentation-backed guarantee. Normal antialiasing may produce partially transparent pixels only along a rotated edge. The feature must not be described as Roblox-confirmed until the manual Shirt, Pants, and T-Shirt alpha fixtures pass in Studio.

## Child-facing interaction

### Create a cutout

1. Open **Add**.
2. Choose **Cut Out**.
3. The Add sheet closes, the editor returns to the 2D view, and the workspace says **Drag over the part you want see-through**.
4. Dragging creates a rectangle over that part of the canonical clothing map.
5. A simple tap creates a sensible default rectangle centered on the tap, so the tool never appears unresponsive.
6. The new Cut Out becomes selected and drawing mode ends.

A visible, touch-sized **Cancel** action and the Escape key leave drawing mode without changing the project. Switching tools, starting or opening a project, or leaving the editor also cancels an unfinished draw.

### Adjust a cutout

A selected Cut Out uses the existing blue selection outline and familiar handles:

- drag inside to move;
- drag the blue handle to resize uniformly;
- drag the white handle to rotate;
- use **More** for Left/Right, Up/Down, Turn, Size, Width, and Height values.

The picture-specific Sticker, Repeat, Fill Clothing, crop, and opacity controls are not shown for a Cut Out. A cutout is always fully transparent.

### Items and history

Each rectangle appears in Items as `Cut Out 1`, `Cut Out 2`, and so on. It supports:

- hide/show;
- copy;
- delete;
- rename;
- selection;
- undo and redo.

Cut Outs are visually pinned above artwork in Items. Their rendering order cannot be changed because every visible Cut Out always punches through the finished clothing. Cut Outs count toward the existing eight-item cap.

### Showing transparency

The 2D canvas uses a lightweight CSS checkerboard behind transparent pixels. The selected rectangle retains the normal high-contrast outline and handles. The checkerboard and selection graphics are editor-only and never enter the compositor, preview texture, saved image asset, or exported PNG.

## Data model and compatibility

Add a discriminated `cutout` layer kind. It contains:

- `id`;
- `name`;
- `kind: "cutout"`;
- `visible`;
- `transform` with center position, rotation, width, and height.

Cutouts have no image asset, color, opacity, crop, or placement mode. The implementation may adapt the existing transform and gesture geometry internally, but persisted cutout fields must have unambiguous rectangle semantics and strict finite, positive validation.

Maintain one ordering invariant in the canonical document: paint layers come first and cutout layers form a suffix. New paint is inserted before the first cutout; new or copied cutouts are appended. Paint reordering cannot cross into the cutout suffix. Cutout reorder controls are omitted because their mutual order has no visual effect.

Saved projects move to schema version 2. The opener accepts both versions:

- version 1 is validated with its original rules, then migrated in memory to version 2 with the same artwork and no cutouts;
- version 2 is validated directly;
- new saves are always version 2;
- unknown versions are rejected.

This prevents an older editor from silently opening and later saving a project without its transparency edits.

## Rendering

The canonical Canvas 2D compositor remains the single rendering source.

1. Validate the project and assets.
2. Draw every visible solid and raster layer in normal paint order.
3. Draw every visible Cut Out after all artwork with `globalCompositeOperation = "destination-out"`.
4. Restore normal composition state before returning the canvas.

Each cutout clears its transformed rectangle from the complete canonical canvas. It is not clipped to a particular body panel; the canonical map and 3D preview remain the editing truth.

The 2D workspace displays that canvas. The Three.js preview already consumes it through a transparent clothing material, so cleared pixels reveal the underlying avatar without a second rendering path. That is the intended classic-clothing result, not a substitute for Studio confirmation. Export encodes the same canvas as an exact 512x512 T-Shirt PNG or 585x559 Shirt/Pants PNG.

The existing fully-transparent export warning remains. A partially transparent result is valid and downloads normally.

## State and gestures

Cutout creation is a short-lived UI mode, not saved project state. Pointer-down records a canvas-space start point; pointer movement shows a draft rectangle; pointer-up commits exactly one `add-item` action. A drag below the existing tap threshold commits the default tap rectangle instead.

After creation, the gesture controller treats a Cut Out as a transformable rectangular footprint. Move, resize, rotate, keyboard adjustments, and wheel scaling use the existing begin/update/commit transaction so one continuous gesture creates one undo entry. Pointer cancellation rolls the transaction back.

Geometry is clamped to finite positive sizes. Handles remain reachable within the canonical canvas as they do for oversized pictures.

## Accessibility and mobile behavior

- **Cut Out** and **Cancel** use plain visible labels and accessible names.
- Touch targets remain at least 44px.
- Drawing works with mouse, touch, and pen pointer events.
- Escape cancels drawing; existing keyboard transform controls apply after creation.
- Drawing mode is visible in both mobile portrait and landscape layouts without increasing document height or covering the bottom toolbar.
- No dependency, server request, persistent browser storage, or additional bitmap is introduced.

## Validation and failure behavior

Project validation rejects:

- duplicate item or asset IDs;
- more than eight total items;
- cutouts mixed before paint layers;
- non-finite positions or rotations;
- zero, negative, or non-finite cutout sizes;
- cutouts containing paint-only properties when strict shape validation requires their absence;
- raster layers with missing assets;
- unknown schema versions or layer kinds.

Cancelling drawing never dirties the project. A cutout over an already transparent area is allowed because it is harmless and predictable. A project whose visible result becomes completely transparent triggers the existing warning at export.

## Testing

Automated tests will cover:

- state creation, monotonic naming, copy, hide/show, delete, undo/redo, item cap, ordering, and rejected mutations;
- compositor pixels showing that visible cutouts clear all artwork after paint order while hidden cutouts do nothing;
- multiple and rotated rectangles;
- v1 migration, deterministic v2 save/open round trips, unknown-version rejection, malformed cutouts, and asset integrity;
- mouse and touch drawing, tap fallback, cancel/Escape, selection, move, resize, rotation, Items actions, and child-facing labels;
- checkerboard display without checkerboard pixels in export;
- the same alpha result in 2D, Three.js preview, and exact-size PNG export;
- portrait, landscape, and desktop layout stability;
- typecheck, lint, unit, browser, build, bundle, PWA, and Chromium/Firefox/WebKit E2E gates.

Generate one alpha fixture per garment type with a fully clear rectangular interior and add a manual Studio check that records whether alpha-zero pixels reveal the underlying avatar, remain opaque, or behave differently. Roblox Studio/device calibration remains a separate manual release gate. No calibration evidence will be fabricated, and automated Pages deployment does not turn an unverified runtime assumption into a confirmed Roblox claim.

## Deferred

- freehand or brush erasing;
- non-rectangular shapes;
- garment-aware Tank Top or Shorts presets;
- feathered edges or partial mask strength;
- grouping or boolean mask operations;
- 3D geometry changes;
- direct Roblox upload or account integration.
