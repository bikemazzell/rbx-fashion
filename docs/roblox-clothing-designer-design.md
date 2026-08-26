# Roblox Classic Clothing Designer Specification

## Summary

Build a mobile-first, installable PWA for first-time Roblox creators. It edits classic 2D clothing and previews results on static 3D R6/R15 block avatars.

The official-asset measurements, exact atlas registry, transform semantics, and Roblox Studio calibration boundary are defined in [Roblox Classic Clothing Technical Preflight](./roblox-technical-preflight.md). That document is normative where this overview is less specific.

The MVP supports:

- Classic T-shirts: 512x512 PNG.
- Classic shirts and pants: 585x559 PNG using Roblox's official template layout.
- Imported PNG, JPEG, and WebP artwork.
- Solid colors and Gemini-generated seamless patterns.
- Editable local project ZIPs.
- Validated local PNG export.
- GitHub Pages deployment and offline use after the first successful load.

It excludes accounts, analytics, cloud project storage, Roblox authentication/upload, painting/text tools, animation, arbitrary avatar packages, and any 3D mesh, rig, cage, or geometry editing. Layered 3D clothing requires a fundamentally different mesh/armature/cage pipeline and remains post-MVP. See [Roblox classic clothing](https://create.roblox.com/docs/avatar/classic-clothing) and [layered-accessory requirements](https://create.roblox.com/docs/avatar/layered-accessories/specifications).

## Product and Interaction Design

### Project workflow

1. Start with New T-shirt, New Shirt, New Pants, Open Project ZIP, or Import Roblox PNG.
2. Add artwork through drag-and-drop, mobile file picker, solid color, or AI generation.
3. Choose imported artwork behavior:
   - Decal/snippet: single positioned image.
   - Pattern: repeated or mirror-repeated fill.
   - Full map: flattened image covering the canonical canvas.
4. Transform artwork with X/Y position, rotation, linked or independent X/Y scale, rectangular crop, opacity, and panel targeting.
5. Switch between the 2D editor and live 3D preview.
6. Download a Roblox-ready PNG and, separately, an editable `.rbxcloth.zip` project.

A 585x559 flattened import must ask whether it is a shirt or pants because dimensions cannot identify the garment type.

### Layer editor

Layers support:

- Raster image or solid color.
- Rename, reorder, duplicate, show/hide, and delete.
- Normal compositing only.
- Opacity.
- Off, Repeat, or Mirror Repeat tiling.
- Whole-garment targeting, selected named panels, and per-panel transform overrides.
- Fifty in-memory undo/redo states.

Template metadata supplies panel masks, orientation, garment-space coordinates, seam adjacency, and 3D UV mapping. Guides remain editor overlays and are never included in exported PNGs.

### Responsive interface

- Mobile portrait: full-screen 2D and 3D tabs, bottom toolbar, and layers/properties in accessible sheets.
- Mobile landscape: side-by-side 2D/3D panes at 700 CSS pixels or wider; otherwise retain tabs.
- Desktop: side-by-side canvases with a persistent layers/properties rail.
- 2D gestures: one-finger selected-layer manipulation; two-finger viewport pan/zoom.
- 3D gestures: one-finger orbit; pinch zoom.
- Numeric controls provide precise and keyboard-accessible alternatives.

The 3D preview provides R6/R15 switching, front/back/left/right presets, orbit, zoom, reset, and background color. It is static and targets standard block avatars only.

## Technical Design and Interfaces

### Stack and architecture

Use npm, TypeScript, Vite, Preact, native Canvas 2D, Three.js, and `fflate`. No state-management, canvas-editor, 3D framework, router, server framework, or Google SDK is required.

Subsystem boundaries:

- Document reducer: authoritative project state and undo/redo.
- Template registry: garment dimensions, masks, panels, seams, and UV definitions.
- Compositor: canonical-resolution Canvas output with stable document semantics.
- Interaction controller: pointer gestures and transforms.
- 3D preview: read-only consumer of the compositor canvas.
- Archive service: validated ZIP import/export.
- Export validator: Roblox PNG preflight.
- Pattern client: optional proxy communication.
- PWA shell: responsive UI, service worker, and update handling.

Three.js uses procedural R6/R15 geometry definitions. A neutral base mannequin and clothing surfaces use coincident geometry; the clothing material uses a fixed negative polygon offset to prevent z-fighting without changing avatar dimensions. The compositor canvas becomes an sRGB `CanvasTexture` with its Y-flip configured explicitly. Rendering is demand-driven, capped at device-pixel-ratio 2, and paused while hidden.

If WebGL initialization or context recovery fails, 3D preview shows a recoverable unavailable state; 2D editing and export remain functional.

### Template registry provenance and calibration

The template registry is an authored compatibility asset, not data inferred at runtime. Build it from Roblox's official `Classic-Clothing-Templates.zip` and classic-clothing documentation. Record the source URL, retrieval date, and SHA-256 digests of the source ZIP and template PNGs beside the registry. Panel masks use integer output-canvas coordinates transcribed from the official labeled templates; orientation, seam adjacency, garment-space transforms, and preview UV assignments are reviewed separately rather than generated from the registry's own fixtures.

Before release, generate shirt, pants, and T-shirt calibration PNGs in which every applicable face or corner has a unique color, short ID, orientation arrow, and numbered edge. Apply them in Roblox Studio to standard block R6 and R15 rigs. Capture front, back, left, right, top, and bottom views in Studio and in this editor. A reviewer must confirm that every face ID and arrow orientation matches and that each numbered seam connects to its declared partner. Store the calibration images, screenshots, completed checklist, Roblox template hashes, Studio measurements, and verification date together. This calibration gate must pass for both rigs before the 3D preview or panel-targeting workflow is described as accurate.

### Core types

```ts
type GarmentType = "tshirt" | "shirt" | "pants";
type RigType = "R6" | "R15";
type TileMode = "off" | "repeat" | "mirror";
type PlacementMode = "decal" | "pattern" | "full-map";

interface Transform {
  positionX: number;
  positionY: number;
  rotationDeg: number;
  scaleX: number;
  scaleY: number;
  // Normalized source-image edge coordinates. Valid when:
  // 0 <= x,y < 1; 0 < width <= 1-x; 0 < height <= 1-y.
  crop: { x: number; y: number; width: number; height: number };
}

type TransformOverride = Partial<Omit<Transform, "crop">> & {
  crop?: Partial<Transform["crop"]>;
};

interface LayerBase {
  id: string;
  name: string;
  kind: "solid" | "raster";
  assetId?: string;
  color?: string;
  visible: boolean;
  opacity: number;
  transform: Transform;
}

type Layer = LayerBase &
  (
    | {
        placement: "full-map";
        tileMode: "off";
        targetPanels: "all";
        panelOverrides?: never;
      }
    | {
        placement: "decal";
        tileMode: "off";
        targetPanels: "all" | string[];
        panelOverrides: Record<string, { transform?: TransformOverride }>;
      }
    | {
        placement: "pattern";
        tileMode: TileMode;
        targetPanels: "all" | string[];
        panelOverrides: Record<
          string,
          { transform?: TransformOverride; tileMode?: TileMode }
        >;
      }
  );

interface AssetManifestBase {
  id: string;
  path: `assets/${string}.${"png" | "jpg" | "webp"}`;
  originalName: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  byteLength: number;
  width: number;
  height: number;
  sha256: string;
}

type AssetManifestEntry = AssetManifestBase &
  (
    | { source: "imported" }
    | { source: "generated"; prompt: string }
  );

interface ProjectDocumentV1 {
  format: "rbx-fashion-project";
  schemaVersion: 1;
  name: string;
  garmentType: GarmentType;
  layers: Layer[];
  assets: AssetManifestEntry[];
  view: {
    rig: RigType;
    camera: {
      preset: "front" | "back" | "left" | "right" | "custom";
      azimuthDeg: number;
      elevationDeg: number;
      distance: number;
    };
    background: string;
  };
}
```

Project ZIP layout:

```text
project.json
assets/<asset-id>.<png|jpg|webp>
```

The archive preserves original source files, transforms, panel overrides, custom camera position, and generated-image prompt provenance. `originalName` is display-only; `path` must use the entry's ID and MIME-matching normalized extension. Width and height are the original decoded pixel dimensions, and `sha256` is lowercase hexadecimal over the exact stored asset bytes. On import, each asset's path, MIME type, byte length, decoded dimensions, and digest must match its manifest entry. It excludes API keys, undo history, caches, and rendered exports.

### Import and export limits

- PNG, JPEG, and WebP only.
- Maximum 20 MiB and 4096x4096 per image.
- Maximum 32 layers.
- Maximum 32 megapixels across decoded source images.
- Maximum ZIP size: 50 MiB compressed and 128 MiB expanded.
- Maximum 64 archive entries.
- Relative normalized archive paths only.
- Import is transactional: any error leaves the open project unchanged.

These are universal upper bounds, not desktop-only targets. Before release, exercise one 4096x4096/20 MiB image, the 32-megapixel decoded-source budget, and the maximum project ZIP on physical iOS Safari and Android Chrome devices with 4 GiB RAM. The tab must not reload, terminate, or lose the current document. If either platform fails, lower the single published limits for every platform; do not use user-agent-based memory tiers.

Exports are canonical-size sRGB PNGs:

- T-shirt: 512x512.
- Shirt/pants: 585x559.

Preflight verifies garment type, exact dimensions, successful decoding, nonempty output, and valid alpha values. Layer order, transforms, masks, and tiling are deterministic, but native Canvas resampling can produce small decoded-pixel differences between browser engines; byte-identical PNG output across browsers is not a requirement. It cannot guarantee moderation or rendering on unsupported avatar packages, so Roblox Studio testing remains a release/user instruction. See [Roblox testing guidance](https://create.roblox.com/docs/avatar/classic-clothing).

### AI pattern generation

The GitHub Pages build enables Generate only when a proxy URL is configured.

```http
POST /api/patterns
Content-Type: application/json
X-Gemini-Api-Key: <session-only user key>

{"prompt":"1-500 Unicode characters"}
```

Success returns one square `image/png` body. Errors return normalized JSON codes for invalid request/key, safety rejection, quota, timeout, upstream failure, or invalid image.

For an allowlisted `Origin`, `OPTIONS /api/patterns` returns `204` with that exact origin, `Vary: Origin`, allowed methods `POST, OPTIONS`, allowed headers `Content-Type, X-Gemini-Api-Key`, and a 600-second preflight cache. Production requests with a missing or disallowed origin return `403` without an `Access-Control-Allow-Origin` header. Local development origins must be added explicitly.

The platform-neutral proxy:

- Exports a Web `Request -> Response` handler.
- Uses native `fetch` without a server framework or Google SDK.
- Targets a deployment-configurable Gemini Flash Image model, initially `gemini-3.1-flash-image`, verified against Google's image-generation documentation on 2026-08-25. Verify the configured model again at deployment rather than assuming the identifier is permanent.
- Requests one square PNG and adds a seamless, edge-to-edge textile-pattern instruction.
- Enforces an exact origin allowlist, 60-second timeout, 4 KiB UTF-8 JSON-body limit, 1-500 Unicode-code-point prompt, PNG type, square dimensions, and 10 MiB response limit.
- Does not claim distributed abuse-rate enforcement. The user-provided Gemini key supplies the provider quota; deployments may add platform-specific rate limiting outside this portable handler.
- Never stores or logs prompts, images, or keys.
- Redacts upstream errors.
- Supplies a minimal Node 22 adapter for local/self-hosted deployment.

The Gemini key remains only in frontend memory until page unload or Forget key. The UI must disclose that the configured proxy transiently receives the key and Google processes the request. Google recommends a backend proxy for production client applications. See [Google Gemini key guidance](https://ai.google.dev/gemini-api/docs/api-key) and [Google image-generation models](https://ai.google.dev/gemini-api/docs/image-generation?hl=en).

If the proxy is absent or unreachable, only AI generation is unavailable.

## Delivery and Implementation Order

1. Encode and validate the pinned template registry, exact garment-space nets, calibration fixtures, and Studio rig measurements.
2. Establish the Vite/Preact/PWA shell and document reducer.
3. Implement transactional image import, layers, canonical compositor, transforms, panel targeting, tiling, and undo/redo.
4. Implement canonical PNG export and versioned ZIP save/open.
5. Add procedural R6/R15 preview geometry, texture synchronization, and the complete Studio calibration gate.
6. Complete portrait, landscape, desktop, accessibility, and unsaved-work behavior.
7. Add the optional Gemini pattern client and stateless proxy package.
8. Add GitHub Actions quality gates and GitHub Pages deployment.

GitHub Pages requirements:

- Build and deploy from the default branch through GitHub Actions.
- Respect repository subpath hosting in asset and service-worker URLs.
- Cache only versioned application, template, icon, and avatar assets.
- Never use localStorage, sessionStorage, or IndexedDB for project data.
- Prompt before activating an updated service worker when work is unsaved. If the user defers, keep the current worker for that session, never force activation while the document is dirty, and prompt again on the next load or as soon as the document becomes clean.
- Keep the proxy URL as non-secret deployment configuration.
- Include no Gemini key in source, Actions, or the Pages artifact.

## Test and Acceptance Plan

Automated tests must cover:

- Reducer history and dirty-state behavior.
- Source-pixel crop conversion, resolved-override validation, transform order, placement-mode invariants, panel targeting, repeat, and mirror-repeat calculations.
- T-shirt and atlas registry variants; exact dimensions, masks, affine transforms, continuous seam records, binding source bounds, and R6/R15 UV assignments.
- Registry provenance hashes and calibration artifacts stay synchronized with the registry version; automated structural tests supplement, but do not replace, the independent Roblox Studio calibration gate.
- Decoded-RGBA golden fixtures for rotation, scale, alpha, tiling, and panel clipping in the pinned CI Chromium version; exporting the same document twice in that engine must produce identical decoded pixels.
- ZIP round-trip fidelity, schema-version rejection, zip-slip protection, entry/size limits, and transactional failure.
- Exact output dimensions and document semantics in Chromium, Firefox, and WebKit; cross-engine tests assert dimensions, panel coverage, alpha bounds, and transform anchor placement without requiring byte-identical resampled pixels.
- WebGL face winding, explicit CanvasTexture Y-flip, polygon-offset stability, fallback, and context recovery.
- AI request/response validation, allowed and rejected CORS preflights, origin enforcement, payload limits, timeouts, error redaction, and proof that keys are never serialized or logged.
- Complete create/save/reopen/export journeys for all garment types.
- Portrait 390x844, landscape 844x390, and desktop 1440x900 layouts.
- Touch-equivalent and keyboard controls.
- Offline PWA reload with editing, ZIP I/O, and PNG export operational and Generate disabled.
- Service-worker update acceptance and deferral with clean and dirty documents; a deferred worker must not activate during a dirty session.
- Verification that project data never enters browser persistence.

Quality targets:

- Latest two major Chrome, Edge, Firefox, desktop Safari, and iOS/iPadOS Safari releases.
- WCAG 2.2 AA for standard controls, dialogs, sheets, focus, contrast, reduced motion, and 44x44 touch targets. Run axe-core in every automated viewport with no serious or critical violations; use Playwright bounding-box assertions for editor controls and keyboard focus-order tests; complete manual VoiceOver on iOS Safari and NVDA on desktop Firefox before release.
- Initial JavaScript under 150 KiB gzip.
- Lazy-loaded 3D chunk under 250 KiB gzip.
- Total offline precache under 2 MiB.
- Rendering coalesced during gestures; hidden canvases do no work.

GitHub Actions runs typecheck, lint, unit tests, browser tests, production build, bundle budgets, and PWA checks before Pages deployment.

Release requires the numbered-panel calibration gate on R6 and R15 plus a manual Roblox Studio/Creator Dashboard smoke test using one golden exported PNG for each of T-shirt, shirt, and pants. Record the official template source, hashes, screenshots, checklist, and verification date alongside the template registry.

## Explicitly Deferred

- AI generation of complete template-conforming shirt/pants maps from blank template references.
- Image-guided AI generation.
- Text, vector shapes, brushes, arbitrary masks, blend modes, and PSD/SVG workflows.
- Animated avatar previews.
- Marketplace avatar body packages.
- Roblox login, upload, publishing, moderation, or commerce.
- Layered-clothing mesh creation, fitting, rigging, skinning, cages, animation, or FBX/glTF export.
