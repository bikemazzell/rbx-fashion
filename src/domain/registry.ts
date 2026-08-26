import type {
  AtlasRegistryEntry,
  ComponentId,
  GarmentType,
  PanelDefinition,
  PreviewFaceBinding,
  Rect,
  TemplateRegistryEntry,
  TShirtRegistryEntry,
} from "./types";
import { PANTS_ENTRY, SHIRT_ENTRY, TSHIRT_ENTRY } from "./registry-data";

const ENTRIES: Readonly<Record<GarmentType, TemplateRegistryEntry>> = Object.freeze({
  tshirt: TSHIRT_ENTRY,
  shirt: SHIRT_ENTRY,
  pants: PANTS_ENTRY,
});

const EXPECTED_EXTENTS: Readonly<Record<ComponentId, Rect>> = {
  torso: { x: 0, y: 0, width: 384, height: 256 },
  "right-limb": { x: 0, y: 0, width: 256, height: 256 },
  "left-limb": { x: 0, y: 0, width: 256, height: 256 },
};

export function getTemplate(type: GarmentType): TemplateRegistryEntry {
  return ENTRIES[type];
}

export interface RegistryValidation {
  valid: boolean;
  errors: string[];
}

function rectInside(inner: Rect, outer: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

function rectEquals(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
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

function validateSourceRect(
  rect: Rect,
  canvasWidth: number,
  canvasHeight: number,
  key: string,
  errors: string[],
): void {
  if (rect.width <= 0 || rect.height <= 0) {
    errors.push(`binding ${key} sourceRect must be positive-sized`);
  }
  if (!rectInside(rect, { x: 0, y: 0, width: canvasWidth, height: canvasHeight })) {
    errors.push(`binding ${key} sourceRect escapes the canvas`);
  }
}

function bindingKey(binding: PreviewFaceBinding): string {
  const id = binding.projection === "wrapped-face" ? binding.panelId : binding.targetId;
  return `${binding.rig}|${binding.bodyPart}|${binding.projection}|${id}|${binding.face}`;
}

function validateBindingKeys(bindings: readonly PreviewFaceBinding[], errors: string[]): void {
  const seen = new Set<string>();
  for (const binding of bindings) {
    const key = bindingKey(binding);
    if (seen.has(key)) {
      errors.push(`duplicate binding key ${key}`);
    }
    seen.add(key);
  }
}

function validateTShirt(entry: TShirtRegistryEntry, errors: string[]): void {
  if (entry.width !== 512 || entry.height !== 512) {
    errors.push(`tshirt canvas must be 512x512, got ${entry.width}x${entry.height}`);
  }
  const target = entry.target.rect;
  if (target.width <= 0 || target.height <= 0) {
    errors.push("tshirt target rect must be positive-sized");
  }
  if (!rectInside(target, { x: 0, y: 0, width: entry.width, height: entry.height })) {
    errors.push("tshirt target rect escapes the canvas");
  }
  if (entry.previewBindings.length !== 1) {
    errors.push(`tshirt must have exactly one preview binding, got ${entry.previewBindings.length}`);
  }
  const binding = entry.previewBindings[0];
  if (binding !== undefined) {
    if (binding.projection !== "front-graphic") {
      errors.push(`tshirt binding must be front-graphic, got ${binding.projection}`);
    }
    validateSourceRect(binding.sourceRect, entry.width, entry.height, bindingKey(binding), errors);
  }
  validateBindingKeys(entry.previewBindings, errors);
}

function validateAffine(panel: PanelDefinition, errors: string[]): void {
  const { a, b, c, d, e, f } = panel.atlasToGarment;
  if (a !== 1 || b !== 0 || c !== 0 || d !== 1) {
    errors.push(`panel ${panel.id} atlasToGarment must be translation-only`);
    return;
  }
  const atlasRect = panel.atlasRect;
  const garmentRect = panel.garmentRect;
  const atlasCorners: ReadonlyArray<readonly [number, number]> = [
    [atlasRect.x, atlasRect.y],
    [atlasRect.x + atlasRect.width, atlasRect.y],
    [atlasRect.x, atlasRect.y + atlasRect.height],
    [atlasRect.x + atlasRect.width, atlasRect.y + atlasRect.height],
  ];
  const garmentCorners: ReadonlyArray<readonly [number, number]> = [
    [garmentRect.x, garmentRect.y],
    [garmentRect.x + garmentRect.width, garmentRect.y],
    [garmentRect.x, garmentRect.y + garmentRect.height],
    [garmentRect.x + garmentRect.width, garmentRect.y + garmentRect.height],
  ];
  const mapped = atlasCorners.map(([x, y]) => [x + e, y + f] as [number, number]);
  const cornersMatch = mapped.every((point, index) => {
    const expected = garmentCorners[index];
    return expected !== undefined && point[0] === expected[0] && point[1] === expected[1];
  });
  if (!cornersMatch) {
    errors.push(`panel ${panel.id} atlasToGarment does not map atlasRect onto garmentRect`);
  }
}

function validateExtents(entry: AtlasRegistryEntry, errors: string[]): void {
  const derived = new Map<ComponentId, Rect>();
  for (const panel of entry.panels) {
    const current = derived.get(panel.component);
    derived.set(panel.component, current === undefined ? panel.garmentRect : unionRect(current, panel.garmentRect));
  }
  for (const component of Object.keys(EXPECTED_EXTENTS) as ComponentId[]) {
    const expected = EXPECTED_EXTENTS[component];
    const extent = derived.get(component);
    if (extent === undefined) {
      errors.push(`component ${component} has no panels`);
    } else if (!rectEquals(extent, expected)) {
      errors.push(
        `component ${component} derived extent ${JSON.stringify(extent)} does not match ${JSON.stringify(expected)}`,
      );
    }
  }
}

function validateAtlas(entry: AtlasRegistryEntry, errors: string[]): void {
  if (entry.width !== 585 || entry.height !== 559) {
    errors.push(`${entry.garment} canvas must be 585x559, got ${entry.width}x${entry.height}`);
  }
  const ids = new Set<string>();
  for (const panel of entry.panels) {
    if (ids.has(panel.id)) {
      errors.push(`duplicate panel id ${panel.id}`);
    }
    ids.add(panel.id);
    if (panel.atlasRect.width <= 0 || panel.atlasRect.height <= 0) {
      errors.push(`panel ${panel.id} atlasRect must be positive-sized`);
    }
    if (!rectInside(panel.atlasRect, { x: 0, y: 0, width: entry.width, height: entry.height })) {
      errors.push(`panel ${panel.id} atlasRect escapes the canvas`);
    }
    validateAffine(panel, errors);
  }
  validateExtents(entry, errors);
  const labeled = entry.panels.map((panel) => ({ id: panel.id, rect: panel.atlasRect }));
  for (const [i, a] of labeled.entries()) {
    for (const b of labeled.slice(i + 1)) {
      if (rectsOverlap(a.rect, b.rect)) {
        errors.push(`atlas rects overlap: ${a.id} and ${b.id}`);
      }
    }
  }
  const seamTotal = entry.panels.reduce((sum, panel) => sum + panel.seams.length, 0);
  if (seamTotal !== 30) {
    errors.push(`${entry.garment} must carry 30 reciprocal seam records, got ${seamTotal}`);
  }
  const byId = new Map(entry.panels.map((panel) => [panel.id, panel] as const));
  for (const panel of entry.panels) {
    for (const seam of panel.seams) {
      const partner = byId.get(seam.panelId);
      if (partner === undefined) {
        errors.push(`seam ${panel.id}.${seam.edge} references unknown partner ${seam.panelId}`);
        continue;
      }
      const reciprocal = partner.seams.some(
        (other) =>
          other.edge === seam.panelEdge &&
          other.panelId === panel.id &&
          other.panelEdge === seam.edge &&
          other.reversed === seam.reversed,
      );
      if (!reciprocal) {
        errors.push(`seam ${panel.id}.${seam.edge} lacks a reciprocal record on ${partner.id}`);
      }
    }
  }
  validateBindingKeys(entry.previewBindings, errors);
  for (const binding of entry.previewBindings) {
    validateSourceRect(binding.sourceRect, entry.width, entry.height, bindingKey(binding), errors);
    if (binding.projection !== "wrapped-face") {
      errors.push(`${entry.garment} binding must be wrapped-face, got ${binding.projection}`);
      continue;
    }
    const panel = byId.get(binding.panelId);
    if (panel === undefined) {
      errors.push(`binding ${bindingKey(binding)} references unknown panel ${binding.panelId}`);
      continue;
    }
    if (binding.face !== panel.face) {
      errors.push(`binding ${bindingKey(binding)} face does not match panel ${panel.id}`);
    }
    if (!rectInside(binding.sourceRect, panel.atlasRect)) {
      errors.push(`binding ${bindingKey(binding)} sourceRect escapes panel ${panel.id} atlasRect`);
    }
  }
}

export function validateRegistry(entry: TemplateRegistryEntry): RegistryValidation {
  const errors: string[] = [];
  if (entry.garment === "tshirt") {
    validateTShirt(entry, errors);
  } else {
    validateAtlas(entry, errors);
  }
  return { valid: errors.length === 0, errors };
}
