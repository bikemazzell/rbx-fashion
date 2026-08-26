import type {
  PanelDefinition,
  PlacementMode,
  Rect,
  TemplateRegistryEntry,
} from "../domain/types";

export interface Crop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function isCropValid(crop: Crop): boolean {
  return (
    Number.isFinite(crop.x) &&
    Number.isFinite(crop.y) &&
    Number.isFinite(crop.width) &&
    Number.isFinite(crop.height) &&
    crop.x >= 0 &&
    crop.x < 1 &&
    crop.y >= 0 &&
    crop.y < 1 &&
    crop.width > 0 &&
    crop.width <= 1 - crop.x &&
    crop.height > 0 &&
    crop.height <= 1 - crop.y
  );
}

export interface CroppedSourcePixels {
  sourceX: number;
  sourceY: number;
  cw: number;
  ch: number;
}

export function cropToPixels(crop: Crop, sourceWidth: number, sourceHeight: number): CroppedSourcePixels {
  return {
    sourceX: crop.x * sourceWidth,
    sourceY: crop.y * sourceHeight,
    cw: crop.width * sourceWidth,
    ch: crop.height * sourceHeight,
  };
}

export interface PlacementDefaults {
  positionX: number;
  positionY: number;
  rotationDeg: number;
  scaleX: number;
  scaleY: number;
}

function targetUnionRect(template: TemplateRegistryEntry): Rect {
  if (template.garment === "tshirt") {
    return template.target.rect;
  }
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const panel of template.panels) {
    const rect = panel.atlasRect;
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function defaultTransform(
  placement: PlacementMode,
  source: { width: number; height: number },
  template: TemplateRegistryEntry,
): PlacementDefaults {
  if (placement === "decal") {
    const rect = targetUnionRect(template);
    return {
      positionX: rect.x + rect.width / 2,
      positionY: rect.y + rect.height / 2,
      rotationDeg: 0,
      scaleX: 1,
      scaleY: 1,
    };
  }
  if (placement === "full-map") {
    const canonical = template.width === source.width && template.height === source.height;
    return {
      positionX: template.width / 2,
      positionY: template.height / 2,
      rotationDeg: 0,
      scaleX: canonical ? 1 : template.width / source.width,
      scaleY: canonical ? 1 : template.height / source.height,
    };
  }
  return {
    positionX: source.width / 2,
    positionY: source.height / 2,
    rotationDeg: 0,
    scaleX: 1,
    scaleY: 1,
  };
}

export interface TileGrid {
  cw: number;
  ch: number;
  scaleX: number;
  scaleY: number;
  rotationDeg: number;
  positionX: number;
  positionY: number;
}

export interface TileIndex {
  i: number;
  j: number;
}

function gridAxes(grid: TileGrid): {
  ux: number;
  uy: number;
  vx: number;
  vy: number;
  halfWidth: number;
  halfHeight: number;
} {
  const rad = (grid.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const tw = grid.cw * grid.scaleX;
  const th = grid.ch * grid.scaleY;
  return {
    ux: tw * cos,
    uy: tw * sin,
    vx: -th * sin,
    vy: th * cos,
    halfWidth: (Math.abs(tw * cos) + Math.abs(th * sin)) / 2,
    halfHeight: (Math.abs(tw * sin) + Math.abs(th * cos)) / 2,
  };
}

export function tileCenter(grid: TileGrid, i: number, j: number): { x: number; y: number } {
  const { ux, uy, vx, vy } = gridAxes(grid);
  return {
    x: grid.positionX + i * ux + j * vx,
    y: grid.positionY + i * uy + j * vy,
  };
}

export function tileAABB(grid: TileGrid, i: number, j: number): Rect {
  const { halfWidth, halfHeight } = gridAxes(grid);
  const center = tileCenter(grid, i, j);
  return {
    x: center.x - halfWidth,
    y: center.y - halfHeight,
    width: 2 * halfWidth,
    height: 2 * halfHeight,
  };
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

export function tilesIntersectingRect(grid: TileGrid, rect: Rect, cap?: number): TileIndex[] {
  const { ux, uy, vx, vy, halfWidth, halfHeight } = gridAxes(grid);
  const uSq = ux * ux + uy * uy;
  const vSq = vx * vx + vy * vy;
  const corners: ReadonlyArray<readonly [number, number]> = [
    [rect.x - halfWidth, rect.y - halfHeight],
    [rect.x + rect.width + halfWidth, rect.y - halfHeight],
    [rect.x - halfWidth, rect.y + rect.height + halfHeight],
    [rect.x + rect.width + halfWidth, rect.y + rect.height + halfHeight],
  ];
  let iMin = Number.POSITIVE_INFINITY;
  let iMax = Number.NEGATIVE_INFINITY;
  let jMin = Number.POSITIVE_INFINITY;
  let jMax = Number.NEGATIVE_INFINITY;
  for (const [cx, cy] of corners) {
    const dx = cx - grid.positionX;
    const dy = cy - grid.positionY;
    const i = (dx * ux + dy * uy) / uSq;
    const j = (dx * vx + dy * vy) / vSq;
    iMin = Math.min(iMin, i);
    iMax = Math.max(iMax, i);
    jMin = Math.min(jMin, j);
    jMax = Math.max(jMax, j);
  }
  const result: TileIndex[] = [];
  for (let i = Math.floor(iMin) - 1; i <= Math.ceil(iMax) + 1; i++) {
    for (let j = Math.floor(jMin) - 1; j <= Math.ceil(jMax) + 1; j++) {
      if (rectsOverlap(tileAABB(grid, i, j), rect)) {
        result.push({ i, j });
        if (cap !== undefined && result.length > cap) {
          return result;
        }
      }
    }
  }
  return result;
}

export function countPatternTileDraws(grid: TileGrid, rects: readonly Rect[], cap?: number): number {
  let total = 0;
  for (const rect of rects) {
    total += tilesIntersectingRect(grid, rect, cap !== undefined ? cap - total : undefined).length;
    if (cap !== undefined && total > cap) {
      return total;
    }
  }
  return total;
}

export function garmentToAtlas(panel: PanelDefinition, x: number, y: number): { x: number; y: number } {
  return { x: x - panel.atlasToGarment.e, y: y - panel.atlasToGarment.f };
}
