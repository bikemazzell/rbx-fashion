# Editor Interaction Polish

## Goal

Make imported artwork easy to move, resize, and rotate, and make the More sheet easy to dismiss without adding permanent controls or dependencies.

## Imported artwork

- Dragging selected artwork moves it, as it does now.
- Scrolling up over selected artwork makes the artwork larger; scrolling down makes it smaller.
- Wheel scaling is uniform, keeps the artwork's center fixed, and respects the existing minimum scale.
- A short burst of wheel events creates one undo step rather than filling history with one entry per event.
- The cyan corner handle continues to resize uniformly.
- The white top handle continues to rotate, but transform handles must remain visible and reachable within the editable canvas even when artwork fills or extends beyond the canvas.
- Wheel input outside the selected artwork does not change it or block normal page behavior.
- Touch behavior remains unchanged: one finger manipulates artwork and two fingers control the 2D viewport.

These transforms update the canonical project layer, so the 2D canvas, 3D preview, saved project, and exported Roblox texture all show the same result.

## More sheet

- Clicking or tapping the dark backdrop closes only the More sheet.
- Pressing `Escape` closes the More sheet on keyboard devices.
- Clicking, tapping, dragging, or editing inside the sheet never dismisses it.
- Done remains visible in a sticky footer while the settings form scrolls.
- Closing the sheet keeps field changes already committed through the existing undoable editor actions.
- Other dialogs and sheets retain their current dismissal rules.

## Pants preview decision

Classic Roblox pants intentionally use the torso and both legs. Keep the current torso mapping; removing it would make the preview and export disagree with the official classic-pants template. Exact R6 appearance remains subject to the existing Roblox Studio calibration gate.

## Implementation boundaries

Extend the existing gesture controller and selection overlay rather than adding a new transform system. Extend the shared sheet backdrop with an explicit optional dismissal callback, enabled only by More. Do not add a UI library, Three.js controls, permanent transform buttons, or new project fields.

## Verification

- Browser tests cover wheel scaling direction, center preservation, minimum scale, one-step undo, and no action outside selected artwork.
- Browser tests verify that resize and rotate handles remain reachable for full-map and oversized artwork.
- UI tests cover backdrop dismissal, inside-click retention, Escape dismissal, and sticky Done behavior.
- Existing compositor/export tests confirm that layer transforms continue to reach the 2D and 3D outputs.
- Existing pants registry and preview-binding tests remain unchanged and green.
