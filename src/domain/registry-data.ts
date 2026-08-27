import type {
  AtlasRegistryEntry,
  ClothingBodyPart,
  ComponentId,
  Face,
  PanelDefinition,
  PanelEdge,
  PreviewFaceBinding,
  Rect,
  SeamLink,
  TShirtRegistryEntry,
  UVQuad,
} from "./types";

const ATLAS_WIDTH = 585;
const ATLAS_HEIGHT = 559;

interface PanelSpec {
  id: string;
  component: ComponentId;
  face: Face;
  atlasRect: Rect;
  garmentRect: Rect;
  atlasToGarment: { a: number; b: number; c: number; d: number; e: number; f: number };
}

const PANEL_SPECS: readonly PanelSpec[] = [
  {
    id: "torso.up",
    component: "torso",
    face: "up",
    atlasRect: { x: 231, y: 8, width: 128, height: 64 },
    garmentRect: { x: 64, y: 0, width: 128, height: 64 },
    atlasToGarment: { a: 1, b: 0, c: 0, d: 1, e: -167, f: -8 },
  },
  {
    id: "torso.right",
    component: "torso",
    face: "right",
    atlasRect: { x: 165, y: 74, width: 64, height: 128 },
    garmentRect: { x: 0, y: 64, width: 64, height: 128 },
    atlasToGarment: { a: 1, b: 0, c: 0, d: 1, e: -165, f: -10 },
  },
  {
    id: "torso.front",
    component: "torso",
    face: "front",
    atlasRect: { x: 231, y: 74, width: 128, height: 128 },
    garmentRect: { x: 64, y: 64, width: 128, height: 128 },
    atlasToGarment: { a: 1, b: 0, c: 0, d: 1, e: -167, f: -10 },
  },
  {
    id: "torso.left",
    component: "torso",
    face: "left",
    atlasRect: { x: 361, y: 74, width: 64, height: 128 },
    garmentRect: { x: 192, y: 64, width: 64, height: 128 },
    atlasToGarment: { a: 1, b: 0, c: 0, d: 1, e: -169, f: -10 },
  },
  {
    id: "torso.back",
    component: "torso",
    face: "back",
    atlasRect: { x: 427, y: 74, width: 128, height: 128 },
    garmentRect: { x: 256, y: 64, width: 128, height: 128 },
    atlasToGarment: { a: 1, b: 0, c: 0, d: 1, e: -171, f: -10 },
  },
  {
    id: "torso.down",
    component: "torso",
    face: "down",
    atlasRect: { x: 231, y: 204, width: 128, height: 64 },
    garmentRect: { x: 64, y: 192, width: 128, height: 64 },
    atlasToGarment: { a: 1, b: 0, c: 0, d: 1, e: -167, f: -12 },
  },
  {
    id: "right-limb.up",
    component: "right-limb",
    face: "up",
    atlasRect: { x: 217, y: 289, width: 64, height: 64 },
    garmentRect: { x: 192, y: 0, width: 64, height: 64 },
    atlasToGarment: { a: 1, b: 0, c: 0, d: 1, e: -25, f: -289 },
  },
  {
    id: "right-limb.left",
    component: "right-limb",
    face: "left",
    atlasRect: { x: 19, y: 355, width: 64, height: 128 },
    garmentRect: { x: 0, y: 64, width: 64, height: 128 },
    atlasToGarment: { a: 1, b: 0, c: 0, d: 1, e: -19, f: -291 },
  },
  {
    id: "right-limb.back",
    component: "right-limb",
    face: "back",
    atlasRect: { x: 85, y: 355, width: 64, height: 128 },
    garmentRect: { x: 64, y: 64, width: 64, height: 128 },
    atlasToGarment: { a: 1, b: 0, c: 0, d: 1, e: -21, f: -291 },
  },
  {
    id: "right-limb.right",
    component: "right-limb",
    face: "right",
    atlasRect: { x: 151, y: 355, width: 64, height: 128 },
    garmentRect: { x: 128, y: 64, width: 64, height: 128 },
    atlasToGarment: { a: 1, b: 0, c: 0, d: 1, e: -23, f: -291 },
  },
  {
    id: "right-limb.front",
    component: "right-limb",
    face: "front",
    atlasRect: { x: 217, y: 355, width: 64, height: 128 },
    garmentRect: { x: 192, y: 64, width: 64, height: 128 },
    atlasToGarment: { a: 1, b: 0, c: 0, d: 1, e: -25, f: -291 },
  },
  {
    id: "right-limb.down",
    component: "right-limb",
    face: "down",
    atlasRect: { x: 217, y: 485, width: 64, height: 64 },
    garmentRect: { x: 192, y: 192, width: 64, height: 64 },
    atlasToGarment: { a: 1, b: 0, c: 0, d: 1, e: -25, f: -293 },
  },
  {
    id: "left-limb.up",
    component: "left-limb",
    face: "up",
    atlasRect: { x: 308, y: 289, width: 64, height: 64 },
    garmentRect: { x: 0, y: 0, width: 64, height: 64 },
    atlasToGarment: { a: 1, b: 0, c: 0, d: 1, e: -308, f: -289 },
  },
  {
    id: "left-limb.front",
    component: "left-limb",
    face: "front",
    atlasRect: { x: 308, y: 355, width: 64, height: 128 },
    garmentRect: { x: 0, y: 64, width: 64, height: 128 },
    atlasToGarment: { a: 1, b: 0, c: 0, d: 1, e: -308, f: -291 },
  },
  {
    id: "left-limb.left",
    component: "left-limb",
    face: "left",
    atlasRect: { x: 374, y: 355, width: 64, height: 128 },
    garmentRect: { x: 64, y: 64, width: 64, height: 128 },
    atlasToGarment: { a: 1, b: 0, c: 0, d: 1, e: -310, f: -291 },
  },
  {
    id: "left-limb.back",
    component: "left-limb",
    face: "back",
    atlasRect: { x: 440, y: 355, width: 64, height: 128 },
    garmentRect: { x: 128, y: 64, width: 64, height: 128 },
    atlasToGarment: { a: 1, b: 0, c: 0, d: 1, e: -312, f: -291 },
  },
  {
    id: "left-limb.right",
    component: "left-limb",
    face: "right",
    atlasRect: { x: 506, y: 355, width: 64, height: 128 },
    garmentRect: { x: 192, y: 64, width: 64, height: 128 },
    atlasToGarment: { a: 1, b: 0, c: 0, d: 1, e: -314, f: -291 },
  },
  {
    id: "left-limb.down",
    component: "left-limb",
    face: "down",
    atlasRect: { x: 308, y: 485, width: 64, height: 64 },
    garmentRect: { x: 0, y: 192, width: 64, height: 64 },
    atlasToGarment: { a: 1, b: 0, c: 0, d: 1, e: -308, f: -293 },
  },
];

const SEAM_PAIRS: ReadonlyArray<readonly [string, PanelEdge, string, PanelEdge]> = [
  ["torso.up", "bottom", "torso.front", "top"],
  ["torso.right", "right", "torso.front", "left"],
  ["torso.front", "right", "torso.left", "left"],
  ["torso.front", "bottom", "torso.down", "top"],
  ["torso.left", "right", "torso.back", "left"],
  ["right-limb.up", "bottom", "right-limb.front", "top"],
  ["right-limb.left", "right", "right-limb.back", "left"],
  ["right-limb.back", "right", "right-limb.right", "left"],
  ["right-limb.right", "right", "right-limb.front", "left"],
  ["right-limb.front", "bottom", "right-limb.down", "top"],
  ["left-limb.up", "bottom", "left-limb.front", "top"],
  ["left-limb.front", "right", "left-limb.left", "left"],
  ["left-limb.left", "right", "left-limb.back", "left"],
  ["left-limb.back", "right", "left-limb.right", "left"],
  ["left-limb.front", "bottom", "left-limb.down", "top"],
];

function buildPanels(): PanelDefinition[] {
  const seams = new Map<string, SeamLink[]>();
  const addSeam = (panelId: string, seam: SeamLink): void => {
    const existing = seams.get(panelId);
    if (existing === undefined) {
      seams.set(panelId, [seam]);
    } else {
      existing.push(seam);
    }
  };
  for (const [aId, aEdge, bId, bEdge] of SEAM_PAIRS) {
    addSeam(aId, { edge: aEdge, panelId: bId, panelEdge: bEdge, reversed: true });
    addSeam(bId, { edge: bEdge, panelId: aId, panelEdge: aEdge, reversed: true });
  }
  return PANEL_SPECS.map((spec) => ({ ...spec, seams: seams.get(spec.id) ?? [] }));
}

function rectUv(rect: Rect): UVQuad {
  const left = rect.x / ATLAS_WIDTH;
  const right = (rect.x + rect.width) / ATLAS_WIDTH;
  const top = 1 - rect.y / ATLAS_HEIGHT;
  const bottom = 1 - (rect.y + rect.height) / ATLAS_HEIGHT;
  return [
    [left, bottom],
    [right, bottom],
    [right, top],
    [left, top],
  ];
}

function wrappedBindings(
  bodyPart: ClothingBodyPart,
  component: ComponentId,
  panels: readonly PanelDefinition[],
): PreviewFaceBinding[] {
  return panels
    .filter((panel) => panel.component === component)
    .map((panel) => ({
      rig: "R6" as const,
      bodyPart,
      sourceRect: { ...panel.atlasRect },
      uv: rectUv(panel.atlasRect),
      projection: "wrapped-face" as const,
      panelId: panel.id,
      face: panel.face,
    }));
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    Object.freeze(value);
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

const PANELS = buildPanels();

export const TSHIRT_ENTRY: TShirtRegistryEntry = deepFreeze({
  garment: "tshirt",
  width: 512,
  height: 512,
  target: {
    id: "torso-graphic",
    rect: { x: 0, y: 0, width: 512, height: 512 },
  },
  previewBindings: [
    {
      rig: "R6",
      bodyPart: "Torso",
      sourceRect: { x: 0, y: 0, width: 512, height: 512 },
      uv: [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ],
      projection: "front-graphic",
      targetId: "torso-graphic",
      face: "front",
    },
  ],
  source: {
    documentationUrl: "https://create.roblox.com/docs/avatar/classic-clothing",
    retrievedOn: "2026-08-25",
  },
  calibrationVersion: null,
});

export const SHIRT_ENTRY: AtlasRegistryEntry = deepFreeze({
  garment: "shirt",
  width: ATLAS_WIDTH,
  height: ATLAS_HEIGHT,
  panels: PANELS,
  previewBindings: [
    ...wrappedBindings("Torso", "torso", PANELS),
    ...wrappedBindings("Right Arm", "right-limb", PANELS),
    ...wrappedBindings("Left Arm", "left-limb", PANELS),
  ],
  source: {
    documentationUrl: "https://create.roblox.com/docs/avatar/classic-clothing",
    retrievedOn: "2026-08-25",
    asset: {
      url: "https://prod.docsiteassets.roblox.com/assets/accessories/classic-clothing/Classic-Clothing-Templates.zip",
      zipSha256: "678ddad004667f74dce223c7d1259e9dd437153c763639d7e668f3b532487c5d",
      pngSha256: "c87e4dfbc6cbee15e7f7283a74983f3762b715b1b366c0514754316474697d8c",
    },
  },
  calibrationVersion: null,
});

export const PANTS_ENTRY: AtlasRegistryEntry = deepFreeze({
  garment: "pants",
  width: ATLAS_WIDTH,
  height: ATLAS_HEIGHT,
  panels: PANELS,
  previewBindings: [
    ...wrappedBindings("Torso", "torso", PANELS),
    ...wrappedBindings("Right Leg", "right-limb", PANELS),
    ...wrappedBindings("Left Leg", "left-limb", PANELS),
  ],
  source: {
    documentationUrl: "https://create.roblox.com/docs/avatar/classic-clothing",
    retrievedOn: "2026-08-25",
    asset: {
      url: "https://prod.docsiteassets.roblox.com/assets/accessories/classic-clothing/Classic-Clothing-Templates.zip",
      zipSha256: "678ddad004667f74dce223c7d1259e9dd437153c763639d7e668f3b532487c5d",
      pngSha256: "c57244d5bb9605f1e3b7de245c201666741b0fb147905703f3371c0aef17c73b",
    },
  },
  calibrationVersion: null,
});
