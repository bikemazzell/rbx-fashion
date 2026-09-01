# Editor Navigation Simplification Design

## Goal

Give every editor action one clear home and remove the misleading bottom toolbar. A child should understand that project files live together, layers contain the artwork, Edit and Preview choose the view, and More changes the selected layer.

## Approved information architecture

The bottom Tools toolbar is removed completely. Its current Move, Repeat, Color, and Preview actions duplicate direct manipulation, the selected-picture placement control, the Color option under Add, and the portrait Edit/Preview tabs. Add and Export move to their semantic homes.

The editor header uses two compact rows at all supported sizes:

1. The project row contains the project name, Undo, Redo, and a **Layers** button when the persistent desktop rail is not shown.
2. The file row contains **New**, **Open**, **Save**, and **Export**, in that order. Save and Export are adjacent because both create files: Save downloads the editable project archive, while Export downloads the Roblox PNG.

Removing the bottom toolbar recovers more vertical space than the second header row consumes. Buttons retain at least 44 CSS pixels of touch height and visible text labels.

## Layers

All child-facing occurrences of **Items** become **Layers**, including the mobile button and sheet, desktop rail, empty states, accessible names, tests, and documentation. Internal component and state names may remain `ItemsPanel` where renaming them would add mechanical churn without changing behavior.

The Layers panel starts with a prominent **+ Add Layer** button. It opens the existing creation choices in a sheet titled **Add Layer**:

- Choose Picture
- Choose Color
- Cut Out
- Generate a Pattern, only when parent configuration enables it

The button is disabled at the existing eight-layer cap and exposes a truthful disabled state. Existing layer rows retain rename, visibility, Copy, ordering, selection, and Delete.

The empty Layers message becomes **No layers yet. Choose Add Layer to begin.** The empty workspace says **Open Layers to add a picture, color, or cutout.** A new project does not automatically open a sheet.

## Color creation and editing

Color creation and color editing become separate operations:

- **Layers → Add Layer → Choose Color** always creates a new centered color rectangle after a swatch is chosen, even if another color layer is selected.
- A selected solid layer's **More** sheet contains a large **Change Color** button with a current-color swatch. It opens the existing Colors sheet in edit mode.
- Choosing a swatch in edit mode changes only the captured selected solid layer and does not add a layer.
- Cancelling the Colors sheet makes no change and returns to the editor. It does not reopen More.
- Legacy full-clothing solid layers also receive Change Color, preserving their existing recolor-only compatibility.

The palette remains a separate sheet. It is not embedded inside More, avoiding nested scrolling and keeping large touch targets.

## Existing controls retained

- Portrait keeps the explicit **Edit** and **Preview** tabs.
- Landscape and desktop keep both panes visible and hide the redundant tab bar at 700 CSS pixels or wider.
- Pictures retain the selected-layer **Sticker / Repeat / Fill Clothing** placement control. Repeat is no longer exposed anywhere else.
- Direct dragging remains the only move interaction; there is no move mode.
- More retains transform, crop, opacity, and cutout controls appropriate to the selected layer.
- Layers remains available as a persistent desktop rail and a modal sheet on smaller/coarse-pointer layouts.

## State and component changes

No persisted project types or schemas change.

`EditorScreen` receives dedicated file, Layers, Add Layer, and Change Color callbacks instead of the generic bottom-toolbar dispatcher. `DesignerApp` tracks whether the Colors sheet is creating a new solid or editing a captured solid ID. If the captured layer no longer exists or is no longer solid, choosing a swatch safely makes no change rather than creating an unintended layer.

`MoreSheet` receives an optional Change Color callback and renders the action only for solid layers. `ItemsPanel` receives the Add Layer callback and cap state so the same panel works in the mobile sheet and desktop rail.

## Responsive behavior

At 390-by-844 portrait:

- both header rows fit without horizontal document overflow;
- the workspace, Edit/Preview tabs, and notices remain inside the viewport;
- there is no bottom toolbar;
- Layers opens a bounded sheet whose Add Layer button is immediately visible.

At 844-by-390 landscape:

- both editor panes remain visible and bounded;
- the two-row header plus recovered toolbar space does not create document scrolling;
- compact Color and Cut Out More sheets retain no nested scrolling;
- the Change Color action and Done button remain reachable without an internal scrollbar.

Desktop retains the same file rows and persistent Layers rail. The redundant Layers header button remains hidden when the rail is visible.

## Accessibility

- Navigation landmarks are **View**, **Project files**, and **Layers**; the removed **Tools** landmark no longer appears.
- Add Layer, Change Color, Save, and Export have visible text and matching accessible names.
- Disabled Add Layer uses both `disabled` and `aria-disabled`.
- The current color is not communicated by color alone: Change Color includes visible text, while the swatch is decorative.
- Existing focus handling, Escape/backdrop dismissal, and 44-pixel touch targets remain.

## Testing

RED-first browser tests cover:

- no Tools navigation or Move/Repeat/Color/Preview toolbar shortcuts;
- Save and Export adjacent inside Project files;
- Items is absent from child-facing UI and Layers is present;
- Layers contains Add Layer above the list and exposes the cap state;
- Add Layer → Choose Color creates a new layer even when a solid is selected;
- More → Change Color recolors only the selected solid without changing layer count;
- Color cancellation changes neither document nor history;
- placement Repeat remains reachable on selected raster layers;
- portrait Edit/Preview tabs remain reachable;
- empty-state language points to Layers;
- the 390-by-844 and 844-by-390 layouts have no document overflow;
- Color More, including Change Color, has no nested overflow at 844-by-390.

PWA and end-to-end journeys use the new Layers/Add Layer route for pictures, colors, and Cut Outs. Full verification remains typecheck, lint, unit, browser, build, bundle budgets, PWA, and Chromium/Firefox/WebKit E2E. Real-browser smoke testing covers portrait, landscape, the Layers sheet, adding and recoloring a color, Preview, Save, and Export placement.

## Out of scope

- Changes to project format, layer ordering, composition, export bytes, or 3D geometry
- New color picker types, custom hex entry, gradients, or eyedropper tools
- Automatically opening Layers on every new project
- A generic overflow menu or broader header redesign beyond the two approved rows
