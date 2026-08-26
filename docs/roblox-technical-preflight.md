# Roblox Classic Clothing Technical Preflight

Status: ready for the lean MVP, with R6 Roblox Studio calibration retained as a release gate. R15 preview work is deferred.

Evidence checked: 2026-08-25

## Outcome

Roblox's current documentation and downloadable assets are sufficient to lock:

- The three MVP garment types and their output dimensions.
- The exact editable rectangles in the official 585x559 shirt and pants atlases.
- A deterministic coordinate and transform model for the 2D compositor.
- A reproducible Roblox Studio calibration procedure for one procedural R6 preview.

Roblox does not publish its complete classic `ShirtTemplate`/`PantsTemplate` projection as a machine-readable mapping. The implementation may proceed, but the MVP R6 preview bindings remain unverified compatibility data until the calibration gate in this document passes. The R15 reference research below is retained for a later preview milestone and is not an MVP implementation requirement.

This is a narrower issue than 3D geometry editing. The MVP uses one static R6 preview only; R15 preview, mesh, rig, cage, and geometry editing remain deferred.

## Authoritative sources and pinned assets

Use current Roblox Creator documentation as the authority. The old `Roblox/avatar` GitHub repository labels its legacy files as potentially unsupported and redirects users to current documentation, so those legacy files must not be the source of truth.

| Evidence | Official source | Local verification |
| --- | --- | --- |
| Classic clothing types, sizes, template download, and Studio test procedure | [Classic clothing](https://create.roblox.com/docs/avatar/classic-clothing) | Documentation source inspected on 2026-08-25 |
| Official shirt/pants templates | [Classic-Clothing-Templates.zip](https://prod.docsiteassets.roblox.com/assets/accessories/classic-clothing/Classic-Clothing-Templates.zip) | ZIP SHA-256 `678ddad004667f74dce223c7d1259e9dd437153c763639d7e668f3b532487c5d` |
| Current avatar reference downloads | [Avatar resources source](https://github.com/Roblox/creator-docs/blob/main/content/en-us/avatar/resources.md) | Download links and descriptions inspected on 2026-08-25 |
| Blocky R15 character reference | [BlockyCharacter.fbx](https://prod.docsiteassets.roblox.com/assets/avatar/dynamic-heads/reference-files/BlockyCharacter.fbx) | SHA-256 `3bce4f161bc9b3825d4580e756c0a2da3b737cfbff1c2d41f47405aabe32803a` |
| Classic-proportion mannequin | [ClassicMannequin.fbx](https://prod.docsiteassets.roblox.com/assets/art/reference-files/ClassicMannequin.fbx) | SHA-256 `970edb3a94e2863655044bef3391557eb2971dc24f74aea3f35d877879154b08` |
| Standard R15 rig/attachments project | [Rig_and_Attachments_Templates.zip](https://prod.docsiteassets.roblox.com/assets/modeling/meshes/reference-files/Rig_and_Attachments_Templates.zip) | ZIP SHA-256 `e96e8483143716b49369e8692f2c2c2c7ae0d3a3d936b58cf3b5dae73148ff7b`; contained FBX SHA-256 `854efcfcff72cdfa260eccc464882d69dfa4bfbdc6a927d7a0c0ae9b472bb853` |
| R6/R15 rig meanings and Studio insertion | [Rig Generator](https://create.roblox.com/docs/studio/rig-builder) | Roblox documents 6-part R6 and 15-part R15 rigs |

The official template ZIP contains:

| File | Dimensions | SHA-256 |
| --- | ---: | --- |
| `Template-Shirts-R15.png` | 585x559 | `c87e4dfbc6cbee15e7f7283a74983f3762b715b1b366c0514754316474697d8c` |
| `Template-Pants-R15.png` | 585x559 | `c57244d5bb9605f1e3b7de245c201666741b0fb147905703f3371c0aef17c73b` |

The rectangle measurements below were produced from the downloaded, hashed PNGs by scanning the exact-color panel interiors for their integer row and column runs. Both templates produced the same bounds. The face names and left/right limb order were then checked visually against the labels in each official PNG. This measurement method establishes atlas rectangles only; it does not establish Roblox's unpublished 3D projection.

The product repository should store this provenance next to the authored registry. Do not silently regenerate or replace registry values when Roblox changes an upstream file. A digest change requires a deliberate registry review and a new calibration record.

## Locked output formats

| Garment | Output | Editable surface |
| --- | --- | --- |
| Classic T-shirt | 512x512 PNG | Front-torso graphic; no shirt/pants atlas panels |
| Classic shirt | 585x559 PNG | Torso and both arms |
| Classic pants | 585x559 PNG | Torso and both legs |

Roblox describes 512x512 as an example square T-shirt size rather than an exclusive format statement. This editor deliberately standardizes T-shirt projects and exports at 512x512 for one simple, testable MVP format.

The T-shirt canvas uses the same top-left, Y-down pixel-edge convention as the larger atlas. It has one logical target, `torso-graphic`, covering `0,0,512,512`. In 3D it is a front-torso graphic rather than six-face wrapping clothing, and its exact R6 placement is part of MVP Studio calibration. R15 placement is deferred.

## Canonical atlas coordinates

All registry rectangles use output-pixel edge coordinates:

- Origin is the top-left of the 585x559 image.
- Positive X points right and positive Y points down.
- Rectangles are half-open: `[x, x + width) x [y, y + height)`.
- Width and height count destination pixels; there is no inclusive right or bottom coordinate.
- The 2-pixel gray gaps in the labeled source template are not editable panels.
- Guides and source-template labels are editor overlays only and never enter an export.

The two official PNGs use the same rectangle layout. Shirt and pants registries differ only in whether the two limb components represent arms or legs.

### Exact panel registry

`garmentRect` removes the source image's 2-pixel gutters and provides a continuous unfolded coordinate system within each component. It is used for seamless pattern evaluation. It does not change export coordinates.

All `atlasToGarment` transforms are translation-only and use Canvas affine order `[a,b,c,d,e,f]`, where `gx = a*ax + c*ay + e` and `gy = b*ax + d*ay + f`.

| Panel ID | Face | Atlas rect `x,y,w,h` | Component | Garment rect `x,y,w,h` | `atlasToGarment` |
| --- | --- | --- | --- | --- | --- |
| `torso.up` | up | `231,8,128,64` | `torso` | `64,0,128,64` | `[1,0,0,1,-167,-8]` |
| `torso.right` | right | `165,74,64,128` | `torso` | `0,64,64,128` | `[1,0,0,1,-165,-10]` |
| `torso.front` | front | `231,74,128,128` | `torso` | `64,64,128,128` | `[1,0,0,1,-167,-10]` |
| `torso.left` | left | `361,74,64,128` | `torso` | `192,64,64,128` | `[1,0,0,1,-169,-10]` |
| `torso.back` | back | `427,74,128,128` | `torso` | `256,64,128,128` | `[1,0,0,1,-171,-10]` |
| `torso.down` | down | `231,204,128,64` | `torso` | `64,192,128,64` | `[1,0,0,1,-167,-12]` |
| `right-limb.up` | up | `217,289,64,64` | `right-limb` | `192,0,64,64` | `[1,0,0,1,-25,-289]` |
| `right-limb.left` | left | `19,355,64,128` | `right-limb` | `0,64,64,128` | `[1,0,0,1,-19,-291]` |
| `right-limb.back` | back | `85,355,64,128` | `right-limb` | `64,64,64,128` | `[1,0,0,1,-21,-291]` |
| `right-limb.right` | right | `151,355,64,128` | `right-limb` | `128,64,64,128` | `[1,0,0,1,-23,-291]` |
| `right-limb.front` | front | `217,355,64,128` | `right-limb` | `192,64,64,128` | `[1,0,0,1,-25,-291]` |
| `right-limb.down` | down | `217,485,64,64` | `right-limb` | `192,192,64,64` | `[1,0,0,1,-25,-293]` |
| `left-limb.up` | up | `308,289,64,64` | `left-limb` | `0,0,64,64` | `[1,0,0,1,-308,-289]` |
| `left-limb.front` | front | `308,355,64,128` | `left-limb` | `0,64,64,128` | `[1,0,0,1,-308,-291]` |
| `left-limb.left` | left | `374,355,64,128` | `left-limb` | `64,64,64,128` | `[1,0,0,1,-310,-291]` |
| `left-limb.back` | back | `440,355,64,128` | `left-limb` | `128,64,64,128` | `[1,0,0,1,-312,-291]` |
| `left-limb.right` | right | `506,355,64,128` | `left-limb` | `192,64,64,128` | `[1,0,0,1,-314,-291]` |
| `left-limb.down` | down | `308,485,64,64` | `left-limb` | `0,192,64,64` | `[1,0,0,1,-308,-293]` |

Component extents are 384x256 garment pixels for the torso and 256x256 for each limb. The official face labels define the face names and unfolded orientation. The values above are registry data; runtime code must not infer them from panel positions.

### Continuous net edges

An edge's forward direction follows clockwise traversal in the Y-down garment plane: top left-to-right, right top-to-bottom, bottom right-to-left, and left bottom-to-top. `reversed: true` means the partner edge's forward parameter runs in the opposite direction. The registry expands each pair below into reciprocal `seams` records.

| Component | First edge | Partner edge | `reversed` |
| --- | --- | --- | --- |
| Torso | `torso.up.bottom` | `torso.front.top` | `true` |
| Torso | `torso.right.right` | `torso.front.left` | `true` |
| Torso | `torso.front.right` | `torso.left.left` | `true` |
| Torso | `torso.front.bottom` | `torso.down.top` | `true` |
| Torso | `torso.left.right` | `torso.back.left` | `true` |
| Right limb | `right-limb.up.bottom` | `right-limb.front.top` | `true` |
| Right limb | `right-limb.left.right` | `right-limb.back.left` | `true` |
| Right limb | `right-limb.back.right` | `right-limb.right.left` | `true` |
| Right limb | `right-limb.right.right` | `right-limb.front.left` | `true` |
| Right limb | `right-limb.front.bottom` | `right-limb.down.top` | `true` |
| Left limb | `left-limb.up.bottom` | `left-limb.front.top` | `true` |
| Left limb | `left-limb.front.right` | `left-limb.left.left` | `true` |
| Left limb | `left-limb.left.right` | `left-limb.back.left` | `true` |
| Left limb | `left-limb.back.right` | `left-limb.right.left` | `true` |
| Left limb | `left-limb.front.bottom` | `left-limb.down.top` | `true` |

These are the 15 edges that are contiguous in the official unfolded nets. Other physical cube edges are cut seams and carry no continuity promise.

## Transform and compositing contract

### Source crop

- Crop values are normalized source-image edge coordinates in `[0, 1]`.
- The default crop is `{x: 0, y: 0, width: 1, height: 1}`.
- A resolved crop is valid exactly when `0 <= x < 1`, `0 <= y < 1`, `0 < width <= 1 - x`, and `0 < height <= 1 - y`. The right and bottom pixel-edge boundaries may therefore equal 1.
- Crop is applied before scale, rotation, placement, tiling, and clipping.
- A solid-color layer behaves as a 1x1 source without a user-editable crop.

Normalized crop values preserve the selection when a project is reopened and do not depend on decoder-reported pixel density metadata.

For a decoded source of `sourceWidth` by `sourceHeight` pixels, convert the normalized crop to source-pixel edge coordinates before any transform:

```text
sourceX = crop.x * sourceWidth
sourceY = crop.y * sourceHeight
cw = crop.width * sourceWidth
ch = crop.height * sourceHeight
```

`cw` and `ch` may be fractional. They are the cropped source width and height used by every formula below.

### Destination transform

Use a center pivot. In Canvas's Y-down coordinate system, positive rotation is clockwise.

For a cropped source of width `cw` and height `ch`, the source-to-destination matrix is:

```text
T(positionX, positionY)
  * R(clockwise rotationDeg)
  * S(scaleX, scaleY)
  * T(-cw / 2, -ch / 2)
```

For Canvas 2D this means `translate(positionX, positionY)`, `rotate(rotationRad)`, `scale(scaleX, scaleY)`, then call the nine-argument `drawImage()` with source rectangle `(sourceX, sourceY, cw, ch)` and destination rectangle `(-cw/2, -ch/2, cw, ch)`. Save and restore the context around every layer/panel draw.

Rules:

- `positionX` and `positionY` are canonical destination pixels.
- `scaleX` and `scaleY` are dimensionless ratios of destination pixels per cropped source pixel and may be linked or independent. Scale 1 preserves source-pixel size.
- Both scales must be finite and greater than zero in MVP; reflection through negative scale is not supported.
- Rotation is stored as any finite degree value and normalized to `[0, 360)` only for display.
- Transform calculations use double-precision JavaScript numbers. Rasterization occurs at canonical output resolution.
- Gesture deltas are converted from viewport CSS pixels through the inverse view matrix before changing document values. Viewport zoom never changes document transforms.

### Placement modes

The transform fields have these mode-specific anchors:

- `decal`: `positionX/Y` is the crop center in output-canvas/atlas coordinates. Default scale is 1 and default position is the bounding-box center of every logical target's `atlasRect` union. The transformed image is drawn once and automatically clipped to the garment.
- `full-map`: same output-canvas coordinate semantics as decal, with default position at canvas center. A full-crop canonical-size source defaults to scale 1; any other source defaults to `scaleX = canvasWidth / cw` and `scaleY = canvasHeight / ch`, using the cropped source-pixel dimensions defined above. It always renders to the complete canonical canvas, so importing and re-exporting a flattened Roblox map preserves artwork outside named rectangles. Changing its transform is allowed.
- `pattern`: `positionX/Y` is the repeating tile's center/phase in component garment coordinates. Defaults are `cw / 2` and `ch / 2`, which align the first tile's top-left with each component origin at scale 1. The same base transform is evaluated separately for torso, right limb, and left limb, so the pattern remains continuous across adjacent faces inside each unfolded component. Separate components intentionally share transform values but not a continuous physical seam. For each panel, render source tiles into garment space, compose with the inverse of that panel's `atlasToGarment` matrix to return to atlas space, and clip to `atlasRect`.

Defaults are written into the document when a layer or placement mode is created. They are never recomputed because selection or target bounds later change.

For MVP pattern layers, `repeat` repeats the transformed tile on both local axes. Decal and full-map layers do not repeat. Implement repetition with explicitly enumerated transformed draws at canonical resolution; do not depend on browser-specific `CanvasPattern.setTransform()` behavior for document semantics. Mirror repeat is deferred.

MVP always targets every logical garment panel and has no targeting or override fields in its project schema. Final compositing order is: validate source and crop; evaluate placement/repetition; clip automatically to the garment; apply layer opacity; composite in layer order with source-over blending. Hidden layers are skipped.

### DEFERRED: targeting and overrides — MVP DOES NOT IMPLEMENT

The following rules are retained for a possible advanced editor and are not MVP implementation requirements:

- `targetPanels: "all"` means the union of named panels for decal and pattern layers. T-shirts have the single logical `torso-graphic` target.
- A panel list on a decal or pattern layer clips drawing to the union of its target rectangles: `atlasRect` for shirt/pants panels and the full target rectangle for T-shirts.
- A full-map layer must have `targetPanels: "all"` and no `panelOverrides`; document actions and project imports reject any other combination.
- A panel override never adds an untargeted panel.
- Resolve an override property-by-property over the layer's base transform and tile mode. Missing fields inherit; a Reset action deletes that panel's override. The implementation type must allow a nested partial crop rather than using `Partial<Transform>` alone.
- Crop remains source-relative. If overridden, its normalized values replace the corresponding base crop fields. Validate the complete resolved crop using the four inequalities above; UI manipulation clamps to them, reducer actions reject invalid values, and ZIP import fails transactionally if any resolved base or override crop is invalid.
- For pattern layers, the base transform is evaluated in component garment coordinates. A panel override is then evaluated for that panel only and may intentionally break continuity at its seams.
- Final compositing order is: validate source and crop; resolve base plus panel override; evaluate placement/tiling; clip to target; apply layer opacity; composite in layer order with source-over blending.
- Hidden layers are skipped. Fully transparent pixels are valid; a project-level export check separately warns if the complete result is empty.

These definitions should replace ambiguous `x`/`y` comments in implementation types with the field names `positionX` and `positionY`.

## Registry interface reference

The registry should be explicit data, validated on startup and in tests. The interface below is a compatibility superset retained for later R15 work. MVP implements only the R6 body parts and R6 preview bindings; the R15 body-part variants and bindings must not expand the first-release scope.

```ts
type RigType = "R6" | "R15";
type Face = "front" | "back" | "left" | "right" | "up" | "down";

type ClothingBodyPart =
  | "Torso"
  | "Left Arm"
  | "Right Arm"
  | "Left Leg"
  | "Right Leg"
  | "UpperTorso"
  | "LowerTorso"
  | "LeftUpperArm"
  | "LeftLowerArm"
  | "LeftHand"
  | "RightUpperArm"
  | "RightLowerArm"
  | "RightHand"
  | "LeftUpperLeg"
  | "LeftLowerLeg"
  | "LeftFoot"
  | "RightUpperLeg"
  | "RightLowerLeg"
  | "RightFoot";

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Affine2D {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

interface PanelDefinition {
  id: string;
  component: "torso" | "right-limb" | "left-limb";
  face: Face;
  atlasRect: Rect;
  garmentRect: Rect;
  atlasToGarment: Affine2D;
  seams: Array<{
    edge: "top" | "right" | "bottom" | "left";
    panelId: string;
    panelEdge: "top" | "right" | "bottom" | "left";
    reversed: boolean;
  }>;
}

interface PreviewBindingBase {
  rig: RigType;
  bodyPart: ClothingBodyPart;
  sourceRect: Rect;
  // Assigned to local face vertices: bottom-left, bottom-right,
  // top-right, top-left, all as seen from outside the avatar.
  uv: [[number, number], [number, number], [number, number], [number, number]];
}

type PreviewFaceBinding = PreviewBindingBase &
  (
    | {
        projection: "wrapped-face";
        panelId: string;
        face: Face;
      }
    | {
        projection: "front-graphic";
        targetId: "torso-graphic";
        face: "front";
      }
  );

interface RegistrySource {
  documentationUrl: string;
  retrievedOn: string;
  asset?: {
    url: string;
    zipSha256: string;
    pngSha256: string;
  };
}

interface RegistryEntryBase {
  source: RegistrySource;
  previewBindings: PreviewFaceBinding[];
  calibrationVersion: string | null;
}

interface TShirtRegistryEntry extends RegistryEntryBase {
  garment: "tshirt";
  width: 512;
  height: 512;
  target: {
    id: "torso-graphic";
    rect: { x: 0; y: 0; width: 512; height: 512 };
  };
}

interface AtlasRegistryEntry extends RegistryEntryBase {
  garment: "shirt" | "pants";
  width: 585;
  height: 559;
  panels: PanelDefinition[];
}

type TemplateRegistryEntry = TShirtRegistryEntry | AtlasRegistryEntry;
```

Deferred R15 bindings may use the same source panel multiple times because R15 subdivides a classic torso or limb surface across upper/lower parts and hands or feet. MVP R6 wrapped bindings identify one panel and calibrated R6 body part. A front-graphic binding identifies `torso-graphic`; MVP calibration determines its R6 surface bounds.

Every `sourceRect` is half-open, positive-sized, and contained by its registry entry's canvas. A `wrapped-face` rectangle must also be contained by its `panelId` panel's `atlasRect`, and its `face` must equal that panel's face. Binding keys `(rig, bodyPart, projection, panelId-or-targetId, face)` are unique, while multiple body parts may deliberately consume different sub-rectangles of the same classic panel. A registry with `calibrationVersion: null` is valid for 2D editing but must not enable an “accurate preview” claim.

For an entry of `width` by `height`, a source pixel edge `(x, y)` converts to normalized UV `(x / width, 1 - y / height)`. The preview explicitly configures `CanvasTexture.flipY = true` and `CanvasTexture.colorSpace = THREE.SRGBColorSpace`; it does not rely on defaults. Pattern repetition is already baked into the compositor canvas, so the preview texture uses clamp-to-edge wrapping.

Each procedural face defines local vertices in bottom-left, bottom-right, top-right, top-left order as seen from outside the avatar, with triangles `[0,1,2]` and `[0,2,3]`. This is counter-clockwise outward winding and uses `THREE.FrontSide`. The `uv` tuple is assigned to those four vertices in the same order. Geometry owns winding; bindings own UV assignment. No renderer code may guess either from a face name.

The `seams` array records edges that are directly continuous in the official unfolded net. Physical cube edges cut apart in the atlas are not falsely labeled continuous; calibration fixtures mark them as cut seams. This contract promises continuity across declared net edges, not across every physical cube edge.

## Deferred R15 evidence and MVP R6 scope

Inspection of Roblox's current FBX downloads establishes:

- `BlockyCharacter.fbx` is a 15-part blocky R15 character and supplies usable reference bounds for a lean procedural preview.
- `ClassicMannequin.fbx` is also a 15-part classic-proportion mannequin, not an R6 six-part model.
- `Rig_and_Attachments_Template.fbx` supplies the standard R15 armature/attachments but no render body geometry suitable for this preview.
- The render meshes expose a single ordinary UV attribute. Those ranges are arranged for each body's own texture assets and are not coordinates in the 585x559 classic clothing atlas.

The R15 FBX findings are retained only to support a later R15 preview. MVP does not load, parse, ship, or derive runtime geometry from these files.

The MVP R6 base and clothing surfaces use coincident procedural geometry; the clothing material uses `polygonOffset: true`, `polygonOffsetFactor: -1`, and `polygonOffsetUnits: -1` to avoid z-fighting without inventing expanded body dimensions. Browser tests must confirm that this remains stable on the supported WebGL implementations.

R6 preview geometry uses procedural boxes. The template face proportions suggest a 64-pixel-per-stud relationship for a conventional block rig, but this is an implementation inference, not a published Roblox requirement. None of the pinned FBX files is an R6 render rig. Exact MVP part sizes come only from the Studio-generated Block Avatar R6 measurement. R15 face subdivisions require a separate future calibration rather than convention.

## Required MVP R6 Roblox Studio calibration

Calibration is compatibility testing, not a runtime dependency. It must be completed before the preview is called accurate and before release. It requires a reviewer with the current Roblox Studio, a Roblox account, and permission to upload private test images; none of those capabilities is part of the product itself.

### Inputs

Generate two transparent 585x559 PNG fixtures, one shirt and one pants, plus one 512x512 T-shirt fixture. Every named shirt/pants panel must contain:

- A unique high-contrast color.
- Its short panel ID.
- A large arrow pointing toward the panel's top edge.
- Distinct numbers on the top, right, bottom, and left edges.
- A one-pixel checker/grid so stretching and one-pixel offsets are visible.

The T-shirt fixture contains a border, center cross, labeled corners, orientation arrow, and graduated grid so its exact front-torso placement and clipping are visible.

The fixture generator must read the registry but the expected checklist must be independently authored from the official templates. This prevents a bad registry from validating itself.

### Procedure

1. In the current production Roblox Studio, use Avatar > Character to insert one Block Avatar R6 rig.
2. Rename it `CalibrationR6`; do not substitute a marketplace avatar package.
3. Record the Studio version and the rig's `Humanoid.RigType`.
4. Run the read-only Command Bar script below to capture every `BasePart` size and transform relative to `HumanoidRootPart`.
5. Upload the calibration PNGs privately for testing, add the matching `ShirtGraphic`, `Shirt`, or `Pants` object to the rig, and assign its image property as Roblox documents.
6. Capture front, back, left, right, top, and bottom views for all three garments on the R6 rig.
7. Capture the same views in the web preview.
8. For every visible face, verify panel ID, arrow direction, four edge numbers, segment boundary, and seam partner. Record pass/fail; screenshots alone are not the checklist.
9. Correct the authored `PreviewFaceBinding` records and repeat until every check passes.
10. Commit the fixture PNGs, Studio/web screenshots, JSON measurements, checklist, Studio version, date, and resulting `calibrationVersion` beside the registry.

Read-only Studio Command Bar measurement script:

```lua
local HttpService = game:GetService("HttpService")

local output = {}
for _, rigName in ipairs({ "CalibrationR6" }) do
    local rig = workspace:FindFirstChild(rigName)
    assert(rig and rig:IsA("Model"), "Missing " .. rigName)
    local root = rig:FindFirstChild("HumanoidRootPart")
    local humanoid = rig:FindFirstChildOfClass("Humanoid")
    assert(root and root:IsA("BasePart") and humanoid, "Invalid " .. rigName)

    local parts = {}
    for _, child in ipairs(rig:GetDescendants()) do
        if child:IsA("BasePart") then
            local relative = root.CFrame:ToObjectSpace(child.CFrame)
            table.insert(parts, {
                name = child.Name,
                size = { child.Size.X, child.Size.Y, child.Size.Z },
                relativeCFrame = { relative:GetComponents() },
            })
        end
    end
    table.sort(parts, function(a, b) return a.name < b.name end)
    table.insert(output, {
        name = rigName,
        rigType = humanoid.RigType.Name,
        parts = parts,
    })
end

print(HttpService:JSONEncode(output))
```

If Roblox Studio changes the generated R6 rig, the official template hashes change, or a supported browser changes the rendered face result, invalidate the calibration and repeat it. R15 must use a separate future calibration record.

## Implementation-plan consequences

A proper implementation plan can now be written without inventing product behavior. It must begin with a compatibility-assets task that:

1. Encodes and tests the exact atlas rectangles, affine transforms, continuous seams, and registry variants above.
2. Generates the independent calibration fixtures and checklist.
3. Authors procedural R6 geometry from the Studio measurements.
4. Completes the R6 Studio calibration before treating preview UV tests as golden.

Work on the document reducer, image normalization, ZIP format, and 2D compositor can proceed in parallel with that manual compatibility gate. Automatic panel-aware pattern output can use the locked atlas and garment-space data immediately. The final R6 UV bindings and any acceptance claim of preview accuracy cannot.

The product introduces no Roblox login, upload, marketplace publishing, or 3D geometry modification. The separate manual release-calibration procedure does require private test-image uploads by an authorized reviewer.
