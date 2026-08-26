# Roblox Classic Clothing Designer Specification

## Summary

Build a small, mobile-first website that lets an 8–10-year-old create Roblox classic clothing without understanding Roblox texture atlases or professional design software.

The child-facing workflow is:

1. Pick T-shirt, Shirt, or Pants.
2. Add a picture, choose a color, or—when a parent has enabled it—generate a simple AI pattern.
3. Choose Sticker, Repeat, or Fill Clothing.
4. Drag, resize, rotate, crop, and adjust the result while seeing it on the 2D template.
5. Check it on one simple block-avatar preview and download a Roblox-ready PNG.

Projects can also be saved to and reopened from a local `.rbxcloth.zip` file. The site has no accounts, analytics, cloud project storage, Roblox login, or Roblox upload. All non-AI editing works locally and offline after the first successful load.

The [Roblox Classic Clothing Technical Preflight](./roblox-technical-preflight.md) remains normative for official output dimensions, atlas rectangles, transform semantics, and the R6 Studio calibration boundary. Atlas panels and UV details are implementation data; they are not exposed in the MVP interface.

## Lean MVP

### Garments and inputs

Support:

- Classic T-shirt: 512×512 PNG.
- Classic Shirt: 585×559 PNG using Roblox's official atlas.
- Classic Pants: 585×559 PNG using Roblox's official atlas.
- Imported PNG, JPEG, and WebP images.
- Existing Roblox texture maps.
- Solid colors.
- Optional Gemini-generated seamless patterns.

A 512×512 Roblox-map import opens as a T-shirt. A 585×559 import asks whether it is a Shirt or Pants because dimensions cannot distinguish them. Other images are added to the already selected garment.

Choosing another garment while a project is open always starts a new project behind the existing unsaved-work confirmation. It never converts or silently reinterprets the current Items.

### Child-facing editing model

Use friendly labels while retaining precise internal placement types:

| Child-facing label | Internal placement | Behavior |
| --- | --- | --- |
| Sticker | `decal` | Draw the image once and let the child position it. |
| Repeat | `pattern` | Repeat the image automatically across the garment. |
| Fill Clothing | `full-map` | Scale the image to fill the complete Roblox map. |

The editor supports at most eight layers. Call them “Items” in the interface. Each item supports:

- Rename, reorder, duplicate, show/hide, and delete.
- Move, uniform scale, rotate, and opacity.
- Crop and independent X/Y scale under a single “More” control.
- Repeat spacing/scale and phase through the same direct manipulation controls.
- Normal source-over compositing only.

Panel selection, face names, seams, UVs, per-panel transforms, and per-panel targeting are never shown. Pattern mapping across the official shirt/pants panels happens automatically inside the compositor.

Fifty in-memory undo/redo states are available. One drag, pinch, rotation, crop, or numeric edit creates one undo step rather than one step per pointer event.

### Responsive interface

- Mobile portrait and coarse-pointer tablets: one full-screen workspace with 2D and Preview tabs, a small bottom toolbar, and Items/More controls in sheets.
- Mobile landscape at 700 CSS pixels or wider: 2D and preview panes side by side.
- Desktop with a fine pointer and sufficient width: side-by-side panes with a persistent Items/controls rail.
- 2D gestures: one finger manipulates the selected item; two fingers pan/zoom the canvas.
- Preview gestures: one finger rotates the avatar; pinch zooms; Reset returns to the default view.
- Numeric controls remain available for precision and keyboard accessibility.

The primary toolbar is limited to Add, Move, Repeat, Color, Preview, and Export. A compact header provides Undo and Redo with disabled states when unavailable. Crop, independent scaling, opacity, item ordering, and project save/open live in secondary sheets rather than the main canvas.

### Preview

MVP provides one fixed, calibrated R6 block-avatar preview. It is a read-only preview of the 2D texture, not a 3D clothing editor.

The preview supports orbit, pinch zoom, and Reset only. It does not expose rig selection, camera presets, background customization, animation, avatar packages, mesh controls, cages, or geometry editing.

If WebGL is unavailable or loses context, show a simple unavailable message. The 2D editor, project save/open, and PNG export must continue to work.

### Optional AI patterns

AI generation is experimental and parent-configured. It is never required to use the editor.

- Hide Generate when no proxy URL is configured.
- Put Gemini key entry and Forget Key in a clearly labelled Parent Settings sheet.
- Keep a directly entered key in memory only until reload, tab close, or Forget Key.
- Once enabled, the child sees a prompt, a few example pattern ideas, Generate, and Cancel—no model or API controls.
- Generated images enter the editor as ordinary Repeat items and retain their prompt in the local project file.
- If the proxy, key, network, quota, or provider fails, only Generate is unavailable.

The browser calls the configured proxy with:

```http
POST /api/patterns
Content-Type: application/json
X-Gemini-Api-Key: <session-only parent key>

{"prompt":"1-500 Unicode characters"}
```

Success returns one square `image/png`. The portable proxy uses native `fetch`, an exact origin allowlist, a 4 KiB body limit, a 60-second timeout, a 10 MiB response limit, PNG signature/IHDR validation, and normalized redacted errors. It never stores or logs prompts, images, or keys. Keep the upstream Gemini image model configurable and verify it immediately before deployment. A key must never be embedded in the site source or Pages artifact.

## Technical Design

### Stack and boundaries

Use npm, TypeScript, Vite, Preact, native Canvas 2D, Three.js, and `fflate`.

Do not add a router, state-management library, canvas framework, UI framework, Three.js wrapper, Workbox, server framework, schema-validation library, or Google SDK.

Subsystems:

- Document reducer: project state, item actions, dirty state, and undo/redo.
- Template registry: exact garment canvases, internal atlas panels, seams, and the single R6 preview binding.
- Asset service: bounded image import and normalization to PNG.
- Compositor: canonical-resolution output and automatic panel mapping.
- 2D editor: viewport rendering and pointer interaction.
- R6 preview: lazy-loaded read-only Three.js consumer of the compositor canvas.
- Project service: validated local ZIP save/open.
- Export service: Roblox PNG validation and download.
- Pattern client/proxy: optional parent-enabled Gemini generation.
- PWA shell: offline application assets without project persistence.

### Core types

```ts
type GarmentType = "tshirt" | "shirt" | "pants";
type PlacementMode = "decal" | "pattern" | "full-map";

interface Transform {
  positionX: number;
  positionY: number;
  rotationDeg: number;
  scaleX: number;
  scaleY: number;
  crop: { x: number; y: number; width: number; height: number };
}

interface Layer {
  id: string;
  name: string;
  kind: "solid" | "raster";
  assetId?: string;
  color?: string;
  visible: boolean;
  opacity: number;
  placement: PlacementMode;
  transform: Transform;
}

interface AssetManifestEntry {
  id: string;
  path: `assets/${string}.png`;
  originalName: string;
  sourceMimeType: "image/png" | "image/jpeg" | "image/webp";
  byteLength: number;
  width: number;
  height: number;
  sha256: string;
  source: "imported" | "generated";
  prompt?: string;
}

interface ProjectDocumentV1 {
  format: "rbx-fashion-project";
  schemaVersion: 1;
  name: string;
  garmentType: GarmentType;
  layers: Layer[];
  assets: AssetManifestEntry[];
}
```

Garment type is fixed for an open project. Changing garment creates a new project; existing layers are never silently reinterpreted.

### Image normalization

Import accepts PNG, JPEG, and WebP, but the editable project stores normalized PNG assets only:

1. Validate file size, magic bytes, MIME type, and decoded dimensions.
2. Decode with explicit `imageOrientation: "from-image"`; where `createImageBitmap` does not conform, use a tested `<img>` fallback that applies the encoded orientation exactly once.
3. Draw the oriented result once to an in-memory sRGB canvas.
4. Encode that canvas to PNG and use those normalized bytes for editing, hashing, and project save/open.

This intentionally does not preserve the exact original JPEG/WebP bytes. It avoids separate EXIF parsers and ensures a saved project reopens with the same orientation and dimensions. `originalName` and `sourceMimeType` are provenance labels only.

Limits:

- Maximum eight layers.
- Maximum 20 MiB and 4096×4096 per imported source image.
- Maximum 32 megapixels across decoded sources.
- Maximum 50 MiB compressed and 128 MiB expanded project ZIP.
- Maximum 32 ZIP entries.
- Relative normalized ZIP paths only.

Any failed image or project import leaves the current project unchanged.

### Compositing

The compositor renders to a hidden canonical canvas: 512×512 for T-shirts or 585×559 for shirts/pants. Checkerboards, guides, selections, and handles never enter the export canvas.

Use the exact crop and center-pivot Canvas transform semantics in the technical preflight. Positive rotation is clockwise; scale values are finite and greater than zero; reflection is not supported.

- Sticker draws once and clips automatically to the garment's named regions.
- Repeat enumerates source tiles in internal garment space and clips them across the official panels, preserving continuity across declared atlas seams.
- Fill Clothing maps the source over the complete canonical canvas. A canonical-size Roblox map defaults to scale 1; another source defaults to fit the canvas.
- A repeated solid color uses direct clipped fills rather than enumerating 1×1 tiles.

For raster patterns, allow at most 4,096 tile draws for one layer and 16,384 for one composition. If exceeded, show “Pattern is too small—make it larger” and block export until corrected.

### Project save/open and export

Project ZIP layout:

```text
project.json
assets/<asset-id>.png
```

Project save calculates the expanded payload before compression and rejects anything over 128 MiB. It then rejects a compressed result over 50 MiB, so every successfully saved project is eligible to reopen under the same limits. Project import validates the schema version, eight-layer limit, normalized paths, entry and byte limits, PNG headers, dimensions, byte lengths, and SHA-256 hashes before replacing the current document.

Export produces an sRGB PNG at exactly 512×512 or 585×559. Preflight re-decodes the result and verifies its MIME type, dimensions, nonempty pixel data, and alpha range. A completely transparent result produces a child-readable warning before download. The application explains that Roblox moderation and unsupported avatar packages are outside its control and recommends testing the image in Roblox Studio.

### R6 preview and calibration

Use procedural R6 boxes from measurements captured from the current Roblox Studio Block Avatar R6. The compositor canvas becomes a clamp-to-edge sRGB `CanvasTexture` with Y-flip configured explicitly. The clothing surface uses a fixed negative polygon offset to avoid z-fighting without changing avatar dimensions.

Generate one shirt, one pants, and one T-shirt calibration fixture. Apply them to an R6 Block Avatar in Studio and compare front, back, left, right, top, and bottom views with the web preview. The R6 checklist must pass before the preview is described as accurate or the MVP is released.

R15 measurement, geometry, bindings, and calibration are post-MVP.

### Offline behavior

Cache only versioned application code, styles, icons, template data, and the lazy preview chunk. Never cache user images, project archives, generated patterns, prompts, or keys.

Do not force a waiting service worker to activate. A new version activates naturally after all tabs using the old version close; this avoids a special dirty-document update workflow. No project state is persisted by the service worker.

## Delivery Order

1. Application shell, exact template registry, and canonical PNG compositor/export.
2. Child-facing mobile editor, eight-item reducer, image import, and undo/redo.
3. Local project ZIP save/open.
4. Single R6 preview and Studio calibration.
5. Optional parent-configured AI generation, offline PWA, accessibility, and release checks.

Each stage must produce a usable vertical slice. AI and 3D preview failures never block 2D editing or valid PNG export.

## Test and Acceptance Plan

Automated tests cover:

- Garment dimensions, exact atlas registry values, crop math, transform order, layer order, Sticker/Repeat/Fill behavior, tiling limits, and automatic panel clipping.
- Dimension-based import routing for T-shirt, Shirt/Pants choice, and ordinary current-project images; choosing a new garment resets rather than reinterprets Items.
- Eight-layer limit, 50-step history, visible Undo/Redo states, one-step gestures, dirty state, and transactional failures.
- PNG/JPEG/WebP normalization, orientation fixtures, size/pixel limits, and normalized PNG round-trip.
- ZIP round-trip, symmetric save/open size limits, schema rejection, zip-slip protection, entry/byte limits, hashes, and unchanged current state after failure.
- Exact output dimensions and stable decoded pixels for repeat exports in pinned Chromium; Firefox and WebKit smoke-test dimensions, placement anchors, and alpha bounds.
- Full create/edit/save/reopen/export journeys for T-shirt, Shirt, and Pants.
- Mobile portrait, mobile landscape, coarse-pointer tablet portrait, and desktop layouts.
- Pointer transitions, keyboard controls, 44×44 touch targets, focus behavior, and no serious or critical axe violations.
- WebGL winding, texture orientation, polygon-offset stability, fallback, and context recovery without loss of 2D editing/export.
- AI validation, CORS, timeout, redaction, and proof that keys/prompts are not serialized or persisted.
- Offline reload with editing, project I/O, preview, and export available while Generate is unavailable.

Release gates:

- R6 Studio calibration passes.
- One exported PNG for each garment works in Roblox Studio/Creator Dashboard.
- Representative physical iOS Safari and Android Chrome devices edit and export without tab reload or state loss.
- Initial JavaScript remains under 150 KiB gzip, the lazy preview chunk under 250 KiB gzip, and the total offline cache under 2 MiB.

## Explicitly Deferred

- Named-panel selection, per-panel targeting, and per-panel transform overrides.
- Mirror repeat and other advanced pattern modes.
- More than eight layers, blend modes, masks, text, vector shapes, brushes, and PSD/SVG workflows.
- R6/R15 switching, R15 preview, multiple avatar packages, camera presets, background customization, and animation.
- Preservation of exact original JPEG/WebP files inside projects.
- Custom service-worker update prompts or in-session forced updates.
- AI generation of complete template-conforming maps and image-guided AI generation.
- An operator-managed persistent AI key or public multi-user AI service; MVP uses a parent-supplied session key.
- Roblox login, upload, publishing, moderation, commerce, accounts, analytics, or cloud project storage.
- Layered-clothing mesh creation, fitting, rigging, skinning, cages, animation, geometry editing, or FBX/glTF export.
