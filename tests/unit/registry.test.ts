import { expect, test } from "vitest";
import { getTemplate, validateRegistry } from "../../src/domain/registry";
import { LIMITS } from "../../src/domain/types";
import type {
  Affine2D,
  AtlasRegistryEntry,
  ComponentId,
  Face,
  PanelEdge,
  PreviewFaceBinding,
  Rect,
  TShirtRegistryEntry,
} from "../../src/domain/types";

function getTShirt(): TShirtRegistryEntry {
  const entry = getTemplate("tshirt");
  if (entry.garment !== "tshirt") {
    throw new Error("expected tshirt entry");
  }
  return entry;
}

function getAtlas(garment: "shirt" | "pants"): AtlasRegistryEntry {
  const entry = getTemplate(garment);
  if (entry.garment === "tshirt") {
    throw new Error(`expected atlas entry for ${garment}`);
  }
  return entry;
}

interface ExpectedPanel {
  id: string;
  component: ComponentId;
  face: Face;
  atlasRect: Rect;
  garmentRect: Rect;
  atlasToGarment: Affine2D;
}

const EXPECTED_PANELS: readonly ExpectedPanel[] = [
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

const EXPECTED_SEAM_PAIRS: ReadonlyArray<readonly [string, PanelEdge, string, PanelEdge]> = [
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

const EXPECTED_EXTENTS: Readonly<Record<ComponentId, Rect>> = {
  torso: { x: 0, y: 0, width: 384, height: 256 },
  "right-limb": { x: 0, y: 0, width: 256, height: 256 },
  "left-limb": { x: 0, y: 0, width: 256, height: 256 },
};

const DOC_URL = "https://create.roblox.com/docs/avatar/classic-clothing";
const ASSET_URL =
  "https://prod.docsiteassets.roblox.com/assets/accessories/classic-clothing/Classic-Clothing-Templates.zip";

function applyAffine(m: Affine2D, x: number, y: number): [number, number] {
  return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
}

function invertAffine(m: Affine2D): Affine2D {
  const det = m.a * m.d - m.b * m.c;
  const a = m.d / det;
  const b = -m.b / det;
  const c = -m.c / det;
  const d = m.a / det;
  return { a, b, c, d, e: -(a * m.e + c * m.f), f: -(b * m.e + d * m.f) };
}

function expectedUv(
  rect: Rect,
  canvasWidth: number,
  canvasHeight: number,
): [[number, number], [number, number], [number, number], [number, number]] {
  return [
    [rect.x / canvasWidth, 1 - (rect.y + rect.height) / canvasHeight],
    [(rect.x + rect.width) / canvasWidth, 1 - (rect.y + rect.height) / canvasHeight],
    [(rect.x + rect.width) / canvasWidth, 1 - rect.y / canvasHeight],
    [rect.x / canvasWidth, 1 - rect.y / canvasHeight],
  ];
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

function unionRect(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

function bindingKey(binding: PreviewFaceBinding): string {
  const id = binding.projection === "wrapped-face" ? binding.panelId : binding.targetId;
  return `${binding.rig}|${binding.bodyPart}|${binding.projection}|${id}|${binding.face}`;
}

test("exact canvas dimensions per garment", () => {
  expect(getTShirt().width).toBe(512);
  expect(getTShirt().height).toBe(512);
  expect(getAtlas("shirt").width).toBe(585);
  expect(getAtlas("shirt").height).toBe(559);
  expect(getAtlas("pants").width).toBe(585);
  expect(getAtlas("pants").height).toBe(559);
});

test("tshirt target is torso-graphic over the full canvas", () => {
  expect(getTShirt().target).toEqual({
    id: "torso-graphic",
    rect: { x: 0, y: 0, width: 512, height: 512 },
  });
});

test.each(["shirt", "pants"] as const)("panel table transcription is exact for %s", (garment) => {
  const panels = getAtlas(garment).panels;
  expect(panels).toHaveLength(18);
  for (const expected of EXPECTED_PANELS) {
    const panel = panels.find((candidate) => candidate.id === expected.id);
    if (panel === undefined) {
      throw new Error(`${garment}: missing panel ${expected.id}`);
    }
    expect(
      {
        id: panel.id,
        component: panel.component,
        face: panel.face,
        atlasRect: panel.atlasRect,
        garmentRect: panel.garmentRect,
        atlasToGarment: panel.atlasToGarment,
      },
      `${garment}: panel ${expected.id} fields`,
    ).toEqual(expected);
  }
});

test.each(["shirt", "pants"] as const)(
  "%s atlas rects are in bounds, non-overlapping, and uniquely identified",
  (garment) => {
    const entry = getAtlas(garment);
    expect(entry.panels).toHaveLength(18);
    const ids = new Set(entry.panels.map((panel) => panel.id));
    expect(ids.size, `${garment}: unique panel ids`).toBe(18);
    for (const panel of entry.panels) {
      const rect = panel.atlasRect;
      expect(rect.width, `${garment}: ${panel.id} width`).toBeGreaterThan(0);
      expect(rect.height, `${garment}: ${panel.id} height`).toBeGreaterThan(0);
      expect(rect.x, `${garment}: ${panel.id} left edge`).toBeGreaterThanOrEqual(0);
      expect(rect.y, `${garment}: ${panel.id} top edge`).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width, `${garment}: ${panel.id} right edge`).toBeLessThanOrEqual(entry.width);
      expect(rect.y + rect.height, `${garment}: ${panel.id} bottom edge`).toBeLessThanOrEqual(entry.height);
    }
    const labeled = entry.panels.map((panel) => ({ id: panel.id, rect: panel.atlasRect }));
    for (const [i, a] of labeled.entries()) {
      for (const b of labeled.slice(i + 1)) {
        expect(
          rectsOverlap(a.rect, b.rect),
          `${garment}: atlas rects ${a.id} and ${b.id} overlap`,
        ).toBe(false);
      }
    }
  },
);

test.each(["shirt", "pants"] as const)(
  "%s garmentRects tile the expected component extents",
  (garment) => {
    const derived = new Map<ComponentId, Rect>();
    for (const panel of getAtlas(garment).panels) {
      const current = derived.get(panel.component);
      derived.set(panel.component, current === undefined ? panel.garmentRect : unionRect(current, panel.garmentRect));
    }
    expect(derived.get("torso")).toEqual(EXPECTED_EXTENTS.torso);
    expect(derived.get("right-limb")).toEqual(EXPECTED_EXTENTS["right-limb"]);
    expect(derived.get("left-limb")).toEqual(EXPECTED_EXTENTS["left-limb"]);
  },
);

test.each(["shirt", "pants"] as const)(
  "%s atlasToGarment is translation-only and maps atlas corners onto garment corners",
  (garment) => {
    for (const panel of getAtlas(garment).panels) {
      const linear = {
        a: panel.atlasToGarment.a,
        b: panel.atlasToGarment.b,
        c: panel.atlasToGarment.c,
        d: panel.atlasToGarment.d,
      };
      expect(linear, `${panel.id} linear part`).toEqual({ a: 1, b: 0, c: 0, d: 1 });
      const atlasRect = panel.atlasRect;
      const garmentRect = panel.garmentRect;
      const mapped = (
        [
          [atlasRect.x, atlasRect.y],
          [atlasRect.x + atlasRect.width, atlasRect.y],
          [atlasRect.x, atlasRect.y + atlasRect.height],
          [atlasRect.x + atlasRect.width, atlasRect.y + atlasRect.height],
        ] as const
      ).map(([x, y]) => applyAffine(panel.atlasToGarment, x, y));
      expect(mapped, `${panel.id} corner mapping`).toEqual([
        [garmentRect.x, garmentRect.y],
        [garmentRect.x + garmentRect.width, garmentRect.y],
        [garmentRect.x, garmentRect.y + garmentRect.height],
        [garmentRect.x + garmentRect.width, garmentRect.y + garmentRect.height],
      ]);
    }
  },
);

test.each(["shirt", "pants"] as const)(
  "%s garment-to-atlas inverse recovers original atlas points",
  (garment) => {
    for (const panel of getAtlas(garment).panels) {
      const inverse = invertAffine(panel.atlasToGarment);
      const atlasRect = panel.atlasRect;
      const garmentRect = panel.garmentRect;
      const recovered = (
        [
          [garmentRect.x, garmentRect.y],
          [garmentRect.x + garmentRect.width, garmentRect.y],
          [garmentRect.x, garmentRect.y + garmentRect.height],
          [garmentRect.x + garmentRect.width, garmentRect.y + garmentRect.height],
          [garmentRect.x + 7, garmentRect.y + 13],
        ] as const
      ).map(([x, y]) => applyAffine(inverse, x, y));
      expect(recovered, `${panel.id} inverse corner mapping`).toEqual([
        [atlasRect.x, atlasRect.y],
        [atlasRect.x + atlasRect.width, atlasRect.y],
        [atlasRect.x, atlasRect.y + atlasRect.height],
        [atlasRect.x + atlasRect.width, atlasRect.y + atlasRect.height],
        [atlasRect.x + 7, atlasRect.y + 13],
      ]);
    }
  },
);

test.each(["shirt", "pants"] as const)(
  "%s seams are 30 reciprocal records for the 15 continuous net edges",
  (garment) => {
    const entry = getAtlas(garment);
    const byId = new Map(entry.panels.map((panel) => [panel.id, panel] as const));
    const total = entry.panels.reduce((sum, panel) => sum + panel.seams.length, 0);
    expect(total, `${garment}: total seam records`).toBe(30);
    for (const [aId, aEdge, bId, bEdge] of EXPECTED_SEAM_PAIRS) {
      const a = byId.get(aId);
      const b = byId.get(bId);
      if (a === undefined || b === undefined) {
        throw new Error(`${garment}: unknown panel in seam pair ${aId}/${bId}`);
      }
      expect(
        a.seams.some(
          (seam) =>
            seam.edge === aEdge &&
            seam.panelId === bId &&
            seam.panelEdge === bEdge &&
            seam.reversed === true,
        ),
        `${garment}: ${aId}.${aEdge} <-> ${bId}.${bEdge} forward record`,
      ).toBe(true);
      expect(
        b.seams.some(
          (seam) =>
            seam.edge === bEdge &&
            seam.panelId === aId &&
            seam.panelEdge === aEdge &&
            seam.reversed === true,
        ),
        `${garment}: ${aId}.${aEdge} <-> ${bId}.${bEdge} reverse record`,
      ).toBe(true);
    }
    for (const panel of entry.panels) {
      for (const seam of panel.seams) {
        const partner = byId.get(seam.panelId);
        expect(partner, `${garment}: ${panel.id} seam partner ${seam.panelId} exists`).toBeDefined();
        if (partner === undefined) {
          continue;
        }
        expect(
          partner.seams.some(
            (other) =>
              other.edge === seam.panelEdge &&
              other.panelId === panel.id &&
              other.panelEdge === seam.edge &&
              other.reversed === seam.reversed,
          ),
          `${garment}: seam ${panel.id}.${seam.edge} has a reciprocal record on ${partner.id}`,
        ).toBe(true);
      }
    }
  },
);

test.each([
  ["shirt", "Right Arm", "Left Arm"],
  ["pants", "Right Leg", "Left Leg"],
] as const)("%s wraps 18 panels across torso and limbs", (garment, rightPart, leftPart) => {
  const entry = getAtlas(garment);
  const counts = new Map<string, number>();
  for (const binding of entry.previewBindings) {
    counts.set(binding.bodyPart, (counts.get(binding.bodyPart) ?? 0) + 1);
  }
  expect(entry.previewBindings).toHaveLength(18);
  expect(counts.get("Torso")).toBe(6);
  expect(counts.get(rightPart)).toBe(6);
  expect(counts.get(leftPart)).toBe(6);
  const front = entry.previewBindings.find(
    (binding) =>
      binding.projection === "wrapped-face" &&
      binding.panelId === "torso.front" &&
      binding.bodyPart === "Torso",
  );
  expect(front, `${garment}: Torso torso.front binding exists`).toBeDefined();
});

test.each(["shirt", "pants"] as const)(
  "%s wrapped bindings are R6, keyed uniquely, contained, face-matched, and uv-correct",
  (garment) => {
    const entry = getAtlas(garment);
    const byId = new Map(entry.panels.map((panel) => [panel.id, panel] as const));
    const keys = new Set<string>();
    for (const binding of entry.previewBindings) {
      if (binding.projection !== "wrapped-face") {
        throw new Error(`${garment}: expected wrapped-face binding, got ${binding.projection}`);
      }
      expect(binding.rig, `${garment}: ${binding.panelId} rig`).toBe("R6");
      keys.add(bindingKey(binding));
      const panel = byId.get(binding.panelId);
      expect(panel, `${garment}: binding references panel ${binding.panelId}`).toBeDefined();
      if (panel === undefined) {
        continue;
      }
      expect(binding.face, `${garment}: ${binding.bodyPart}/${binding.panelId} face`).toBe(panel.face);
      expect(binding.sourceRect, `${garment}: ${binding.bodyPart}/${binding.panelId} sourceRect`).toEqual(
        panel.atlasRect,
      );
      expect(binding.uv, `${garment}: ${binding.bodyPart}/${binding.panelId} uv`).toEqual(
        expectedUv(panel.atlasRect, entry.width, entry.height),
      );
    }
    expect(keys.size, `${garment}: binding keys unique`).toBe(entry.previewBindings.length);
  },
);

test("tshirt has a single front-graphic binding", () => {
  const entry = getTShirt();
  expect(entry.previewBindings).toHaveLength(1);
  const binding = entry.previewBindings[0];
  if (binding === undefined) {
    throw new Error("missing tshirt binding");
  }
  if (binding.projection !== "front-graphic") {
    throw new Error(`expected front-graphic binding, got ${binding.projection}`);
  }
  expect(binding.rig).toBe("R6");
  expect(binding.bodyPart).toBe("Torso");
  expect(binding.face).toBe("front");
  expect(binding.targetId).toBe("torso-graphic");
  expect(binding.sourceRect).toEqual({ x: 0, y: 0, width: 512, height: 512 });
  expect(binding.uv).toEqual([
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ]);
});

test("calibrationVersion is null and provenance digests are exact", () => {
  for (const type of ["tshirt", "shirt", "pants"] as const) {
    expect(getTemplate(type).calibrationVersion).toBeNull();
    expect(getTemplate(type).source.documentationUrl).toBe(DOC_URL);
    expect(getTemplate(type).source.retrievedOn).toBe("2026-08-25");
  }
  expect(getAtlas("shirt").source).toEqual({
    documentationUrl: DOC_URL,
    retrievedOn: "2026-08-25",
    asset: {
      url: ASSET_URL,
      zipSha256: "678ddad004667f74dce223c7d1259e9dd437153c763639d7e668f3b532487c5d",
      pngSha256: "c87e4dfbc6cbee15e7f7283a74983f3762b715b1b366c0514754316474697d8c",
    },
  });
  expect(getAtlas("pants").source).toEqual({
    documentationUrl: DOC_URL,
    retrievedOn: "2026-08-25",
    asset: {
      url: ASSET_URL,
      zipSha256: "678ddad004667f74dce223c7d1259e9dd437153c763639d7e668f3b532487c5d",
      pngSha256: "c57244d5bb9605f1e3b7de245c201666741b0fb147905703f3371c0aef17c73b",
    },
  });
  expect(getTShirt().source.asset).toBeUndefined();
});

test.each(["tshirt", "shirt", "pants"] as const)(
  "validateRegistry accepts the shipped %s entry",
  (type) => {
    const result = validateRegistry(getTemplate(type));
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  },
);

test("validateRegistry rejects corrupted atlas data", () => {
  const dimensionBad = structuredClone(getAtlas("shirt"));
  (dimensionBad as { width: number }).width = 584;
  expect(validateRegistry(dimensionBad).valid).toBe(false);

  const seamBad = structuredClone(getAtlas("shirt"));
  const up = seamBad.panels.find((panel) => panel.id === "torso.up");
  if (up === undefined) {
    throw new Error("torso.up panel missing");
  }
  up.seams.pop();
  expect(validateRegistry(seamBad).valid).toBe(false);

  const bindingBad = structuredClone(getAtlas("shirt"));
  const first = bindingBad.previewBindings[0];
  if (first === undefined) {
    throw new Error("bindings missing");
  }
  bindingBad.previewBindings.push(structuredClone(first));
  expect(validateRegistry(bindingBad).valid).toBe(false);

  const affineBad = structuredClone(getAtlas("shirt"));
  const front = affineBad.panels.find((panel) => panel.id === "torso.front");
  if (front === undefined) {
    throw new Error("torso.front panel missing");
  }
  front.atlasToGarment = { a: 1, b: 0, c: 0, d: 1, e: -167, f: -9 };
  expect(validateRegistry(affineBad).valid).toBe(false);

  const overlapBad = structuredClone(getAtlas("shirt"));
  const limbUp = overlapBad.panels.find((panel) => panel.id === "left-limb.up");
  if (limbUp === undefined) {
    throw new Error("left-limb.up panel missing");
  }
  limbUp.atlasRect = { x: 217, y: 289, width: 64, height: 64 };
  expect(validateRegistry(overlapBad).valid).toBe(false);
});

test("validateRegistry rejects corrupted tshirt data", () => {
  const targetBad = structuredClone(getTShirt());
  (targetBad.target as { rect: Rect }).rect = { x: 0, y: 0, width: 513, height: 512 };
  expect(validateRegistry(targetBad).valid).toBe(false);

  const bindingBad = structuredClone(getTShirt());
  const original = bindingBad.previewBindings[0];
  if (original === undefined) {
    throw new Error("missing tshirt binding");
  }
  bindingBad.previewBindings.push(structuredClone(original));
  expect(validateRegistry(bindingBad).valid).toBe(false);
});

test("registry entries and limits are deeply frozen", () => {
  const shirt = getAtlas("shirt");
  expect(Object.isFrozen(shirt)).toBe(true);
  expect(Object.isFrozen(shirt.panels)).toBe(true);
  const firstPanel = shirt.panels[0];
  if (firstPanel === undefined) {
    throw new Error("no panels");
  }
  expect(Object.isFrozen(firstPanel)).toBe(true);
  expect(Object.isFrozen(firstPanel.seams)).toBe(true);
  expect(Object.isFrozen(firstPanel.seams[0])).toBe(true);
  expect(Object.isFrozen(firstPanel.atlasRect)).toBe(true);
  expect(Object.isFrozen(firstPanel.atlasToGarment)).toBe(true);
  expect(Object.isFrozen(shirt.previewBindings)).toBe(true);
  expect(Object.isFrozen(shirt.previewBindings[0])).toBe(true);
  const tshirt = getTShirt();
  expect(Object.isFrozen(tshirt)).toBe(true);
  expect(Object.isFrozen(tshirt.target)).toBe(true);
  expect(Object.isFrozen(tshirt.previewBindings[0])).toBe(true);
  expect(Object.isFrozen(LIMITS)).toBe(true);
});

test("domain limits match the documented safety budgets", () => {
  expect(LIMITS).toEqual({
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
});
