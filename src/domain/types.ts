export type GarmentType = "tshirt" | "shirt" | "pants";

export type PlacementMode = "decal" | "pattern" | "full-map";

export interface Transform {
  positionX: number;
  positionY: number;
  rotationDeg: number;
  scaleX: number;
  scaleY: number;
  crop: { x: number; y: number; width: number; height: number };
}

interface LayerBase {
  id: string;
  name: string;
  visible: boolean;
}

interface PaintLayerBase extends LayerBase {
  assetId?: string;
  color?: string;
  opacity: number;
  placement: PlacementMode;
  transform: Transform;
}

export interface RasterLayer extends PaintLayerBase {
  kind: "raster";
  assetId: string;
}

export interface SolidLayer extends PaintLayerBase {
  kind: "solid";
  color: string;
}

export type PaintLayer = RasterLayer | SolidLayer;

export interface CutoutRect {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  rotationDeg: number;
}

export type CutoutShape = "rectangle" | "ellipse";

export interface CutoutLayerV2 extends LayerBase {
  kind: "cutout";
  rect: CutoutRect;
}

export interface CutoutLayer extends CutoutLayerV2 {
  shape: CutoutShape;
}

export type Layer = PaintLayer | CutoutLayer;

export interface AssetManifestEntry {
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

export interface ProjectDocumentV1 {
  format: "rbx-fashion-project";
  schemaVersion: 1;
  name: string;
  garmentType: GarmentType;
  layers: PaintLayer[];
  assets: AssetManifestEntry[];
}

export interface ProjectDocumentV2 {
  format: "rbx-fashion-project";
  schemaVersion: 2;
  name: string;
  garmentType: GarmentType;
  layers: Array<PaintLayer | CutoutLayerV2>;
  assets: AssetManifestEntry[];
}

export interface ProjectDocument {
  format: "rbx-fashion-project";
  schemaVersion: 3;
  name: string;
  garmentType: GarmentType;
  layers: Layer[];
  assets: AssetManifestEntry[];
}

export const LIMITS = Object.freeze({
  MAX_LAYERS: 8,
  MAX_HISTORY: 50,
  IMPORT_MAX_BYTES: 20 * 1024 * 1024,
  IMPORT_MAX_DIM: 4096,
  IMPORT_MAX_MEGAPIXELS: 32,
  ZIP_MAX_COMPRESSED: 50 * 1024 * 1024,
  ZIP_MAX_EXPANDED: 128 * 1024 * 1024,
  ZIP_MAX_ENTRIES: 32,
  PATTERN_TILE_DRAWS_PER_LAYER: 4096,
  PATTERN_TILE_DRAWS_TOTAL: 16384,
});

export type RigType = "R6" | "R15";

export type Face = "front" | "back" | "left" | "right" | "up" | "down";

export type ClothingBodyPart =
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

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Affine2D {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export type PanelEdge = "top" | "right" | "bottom" | "left";

export interface SeamLink {
  edge: PanelEdge;
  panelId: string;
  panelEdge: PanelEdge;
  reversed: boolean;
}

export type ComponentId = "torso" | "right-limb" | "left-limb";

export interface PanelDefinition {
  id: string;
  component: ComponentId;
  face: Face;
  atlasRect: Rect;
  garmentRect: Rect;
  atlasToGarment: Affine2D;
  seams: SeamLink[];
}

export type UVQuad = [
  [number, number],
  [number, number],
  [number, number],
  [number, number],
];

export interface PreviewBindingBase {
  rig: RigType;
  bodyPart: ClothingBodyPart;
  sourceRect: Rect;
  uv: UVQuad;
}

export type PreviewFaceBinding = PreviewBindingBase &
  (
    | { projection: "wrapped-face"; panelId: string; face: Face }
    | { projection: "front-graphic"; targetId: "torso-graphic"; face: "front" }
  );

export interface RegistrySource {
  documentationUrl: string;
  retrievedOn: string;
  asset?: {
    url: string;
    zipSha256: string;
    pngSha256: string;
  };
}

export interface RegistryEntryBase {
  source: RegistrySource;
  previewBindings: PreviewFaceBinding[];
  calibrationVersion: string | null;
}

export interface TShirtRegistryEntry extends RegistryEntryBase {
  garment: "tshirt";
  width: 512;
  height: 512;
  target: {
    id: "torso-graphic";
    rect: { x: 0; y: 0; width: 512; height: 512 };
  };
}

export interface AtlasRegistryEntry extends RegistryEntryBase {
  garment: "shirt" | "pants";
  width: 585;
  height: 559;
  panels: PanelDefinition[];
}

export type TemplateRegistryEntry = TShirtRegistryEntry | AtlasRegistryEntry;
