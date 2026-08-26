import { expect, test } from "vitest";
import {
  countPatternTileDraws,
  cropToPixels,
  defaultTransform,
  garmentToAtlas,
  isCropValid,
  tileAABB,
  tileCenter,
  tilesIntersectingRect,
} from "../../src/compositor/math";
import { getTemplate } from "../../src/domain/registry";
import { LIMITS } from "../../src/domain/types";
import type { ComponentId, Rect } from "../../src/domain/types";

function shirtPanelRects(component: ComponentId): Rect[] {
  const template = getTemplate("shirt");
  if (template.garment === "tshirt") {
    throw new Error("expected shirt entry");
  }
  return template.panels
    .filter((panel) => panel.component === component)
    .map((panel) => panel.garmentRect);
}

function shirtPanels() {
  const template = getTemplate("shirt");
  if (template.garment === "tshirt") {
    throw new Error("expected shirt entry");
  }
  return template.panels;
}

const GRID_64 = { cw: 64, ch: 64, scaleX: 1, scaleY: 1, rotationDeg: 0, positionX: 32, positionY: 32 };
const GRID_64_SHIFTED = { cw: 64, ch: 64, scaleX: 1, scaleY: 1, rotationDeg: 0, positionX: 16, positionY: 32 };
const GRID_4 = { cw: 4, ch: 4, scaleX: 1, scaleY: 1, rotationDeg: 0, positionX: 2, positionY: 2 };

test("full crop and interior crops are valid", () => {
  expect(isCropValid({ x: 0, y: 0, width: 1, height: 1 })).toBe(true);
  expect(isCropValid({ x: 0, y: 0, width: 0.5, height: 1 })).toBe(true);
  expect(isCropValid({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 })).toBe(true);
  expect(isCropValid({ x: 0.1, y: 0.1, width: 0.9, height: 0.9 })).toBe(true);
});

test("crop width equal to 1 - x is valid and one epsilon more is invalid", () => {
  expect(isCropValid({ x: 0.25, y: 0, width: 0.75, height: 1 })).toBe(true);
  expect(isCropValid({ x: 0.25, y: 0, width: 0.75 + 1e-9, height: 1 })).toBe(false);
  expect(isCropValid({ x: 0, y: 0.25, width: 1, height: 0.75 })).toBe(true);
  expect(isCropValid({ x: 0, y: 0.25, width: 1, height: 0.75 + 1e-9 })).toBe(false);
});

test("crops at or beyond the source edges are invalid", () => {
  expect(isCropValid({ x: -0.001, y: 0, width: 0.5, height: 0.5 })).toBe(false);
  expect(isCropValid({ x: 0, y: -0.001, width: 0.5, height: 0.5 })).toBe(false);
  expect(isCropValid({ x: 1, y: 0, width: 0.001, height: 0.5 })).toBe(false);
  expect(isCropValid({ x: 0, y: 1, width: 0.5, height: 0.001 })).toBe(false);
});

test("zero, negative, and non-finite crop extents are invalid", () => {
  expect(isCropValid({ x: 0, y: 0, width: 0, height: 0.5 })).toBe(false);
  expect(isCropValid({ x: 0, y: 0, width: 0.5, height: 0 })).toBe(false);
  expect(isCropValid({ x: 0, y: 0, width: -0.5, height: 0.5 })).toBe(false);
  expect(isCropValid({ x: 0, y: 0, width: 0.5, height: -0.5 })).toBe(false);
  expect(isCropValid({ x: Number.NaN, y: 0, width: 0.5, height: 0.5 })).toBe(false);
  expect(isCropValid({ x: 0, y: Number.POSITIVE_INFINITY, width: 0.5, height: 0.5 })).toBe(false);
  expect(isCropValid({ x: 0, y: 0, width: Number.NaN, height: 0.5 })).toBe(false);
});

test("crop conversion scales normalized edges into source pixels", () => {
  expect(cropToPixels({ x: 0.1, y: 0.25, width: 0.5, height: 0.4 }, 100, 80)).toEqual({
    sourceX: 10,
    sourceY: 20,
    cw: 50,
    ch: 32,
  });
});

test("crop conversion keeps fractional pixel edges", () => {
  expect(cropToPixels({ x: 0.5, y: 0, width: 0.5, height: 1 }, 3, 3)).toEqual({
    sourceX: 1.5,
    sourceY: 0,
    cw: 1.5,
    ch: 3,
  });
  expect(cropToPixels({ x: 1 / 3, y: 1 / 6, width: 1 / 6, height: 1 / 3 }, 300, 600)).toEqual({
    sourceX: 100,
    sourceY: 100,
    cw: 50,
    ch: 200,
  });
});

test("decal default is the atlas-union bounding-box center at scale 1", () => {
  expect(defaultTransform("decal", { width: 128, height: 128 }, getTemplate("tshirt"))).toEqual({
    positionX: 256,
    positionY: 256,
    rotationDeg: 0,
    scaleX: 1,
    scaleY: 1,
  });
  expect(defaultTransform("decal", { width: 64, height: 32 }, getTemplate("shirt"))).toEqual({
    positionX: 294.5,
    positionY: 278.5,
    rotationDeg: 0,
    scaleX: 1,
    scaleY: 1,
  });
  expect(defaultTransform("decal", { width: 64, height: 32 }, getTemplate("pants"))).toMatchObject({
    positionX: 294.5,
    positionY: 278.5,
  });
});

test("full-map default is canvas center with scale 1 for canonical-size sources", () => {
  expect(defaultTransform("full-map", { width: 585, height: 559 }, getTemplate("shirt"))).toEqual({
    positionX: 292.5,
    positionY: 279.5,
    rotationDeg: 0,
    scaleX: 1,
    scaleY: 1,
  });
  expect(defaultTransform("full-map", { width: 512, height: 512 }, getTemplate("tshirt"))).toEqual({
    positionX: 256,
    positionY: 256,
    rotationDeg: 0,
    scaleX: 1,
    scaleY: 1,
  });
});

test("full-map default fits non-canonical sources to the canvas", () => {
  const defaults = defaultTransform("full-map", { width: 1024, height: 512 }, getTemplate("shirt"));
  expect(defaults.positionX).toBe(292.5);
  expect(defaults.positionY).toBe(279.5);
  expect(defaults.scaleX).toBeCloseTo(585 / 1024, 12);
  expect(defaults.scaleY).toBeCloseTo(559 / 512, 12);
  const tshirt = defaultTransform("full-map", { width: 256, height: 1024 }, getTemplate("tshirt"));
  expect(tshirt.scaleX).toBeCloseTo(2, 12);
  expect(tshirt.scaleY).toBeCloseTo(0.5, 12);
});

test("pattern default centers the first tile at each component origin at scale 1", () => {
  expect(defaultTransform("pattern", { width: 64, height: 64 }, getTemplate("shirt"))).toEqual({
    positionX: 32,
    positionY: 32,
    rotationDeg: 0,
    scaleX: 1,
    scaleY: 1,
  });
  expect(defaultTransform("pattern", { width: 100, height: 40 }, getTemplate("pants"))).toEqual({
    positionX: 50,
    positionY: 20,
    rotationDeg: 0,
    scaleX: 1,
    scaleY: 1,
  });
});

test("tile center steps along the rotated tile axes", () => {
  const grid = { cw: 30, ch: 40, scaleX: 1, scaleY: 1, rotationDeg: 90, positionX: 10, positionY: 20 };
  const center = tileCenter(grid, 1, 2);
  expect(center.x).toBeCloseTo(-70, 9);
  expect(center.y).toBeCloseTo(50, 9);
});

test("tile AABB half extents cover the rotated footprint", () => {
  const grid = { cw: 100, ch: 20, scaleX: 1, scaleY: 1, rotationDeg: 45, positionX: 0, positionY: 0 };
  const aabb = tileAABB(grid, 0, 0);
  expect(aabb.x).toBeCloseTo(-42.426406871192856, 9);
  expect(aabb.y).toBeCloseTo(-42.426406871192856, 9);
  expect(aabb.width).toBeCloseTo(84.852813742385712, 9);
  expect(aabb.height).toBeCloseTo(84.852813742385712, 9);
});

test("axis-aligned 64px tile counts over the torso component extent", () => {
  expect(tilesIntersectingRect(GRID_64, { x: 0, y: 0, width: 384, height: 256 })).toHaveLength(24);
  expect(tilesIntersectingRect(GRID_64_SHIFTED, { x: 0, y: 0, width: 384, height: 256 })).toHaveLength(28);
});

test("rotated square tile enumeration matches the unrotated footprint", () => {
  const grid = { cw: 64, ch: 64, scaleX: 1, scaleY: 1, rotationDeg: 90, positionX: 32, positionY: 32 };
  expect(tilesIntersectingRect(grid, { x: 64, y: 64, width: 128, height: 128 })).toHaveLength(4);
});

test("per-panel tile draw counts partition the component extents", () => {
  expect(countPatternTileDraws(GRID_64, shirtPanelRects("torso"))).toBe(16);
  expect(countPatternTileDraws(GRID_64_SHIFTED, shirtPanelRects("torso"))).toBe(26);
  expect(countPatternTileDraws(GRID_64_SHIFTED, shirtPanelRects("right-limb"))).toBe(20);
  const allRects = shirtPanels().map((panel) => panel.garmentRect);
  expect(countPatternTileDraws(GRID_64, allRects)).toBe(36);
  expect(countPatternTileDraws(GRID_64_SHIFTED, allRects)).toBe(66);
});

test("a 4px tile reaches but does not exceed the per-layer budget on the torso alone", () => {
  expect(countPatternTileDraws(GRID_4, shirtPanelRects("torso"))).toBe(4096);
  expect(countPatternTileDraws(GRID_4, shirtPanelRects("torso")) > LIMITS.PATTERN_TILE_DRAWS_PER_LAYER).toBe(false);
});

test("a 4px tile across every panel exceeds the per-layer budget", () => {
  const allRects = shirtPanels().map((panel) => panel.garmentRect);
  const count = countPatternTileDraws(GRID_4, allRects);
  expect(count).toBe(9216);
  expect(count > LIMITS.PATTERN_TILE_DRAWS_PER_LAYER).toBe(true);
  expect(count > LIMITS.PATTERN_TILE_DRAWS_TOTAL).toBe(false);
});

test("garmentToAtlas maps garment coordinates through the panel translation", () => {
  const template = getTemplate("shirt");
  if (template.garment === "tshirt") {
    throw new Error("expected shirt entry");
  }
  const front = template.panels.find((panel) => panel.id === "torso.front");
  if (front === undefined) {
    throw new Error("torso.front missing");
  }
  expect(garmentToAtlas(front, 64, 64)).toEqual({ x: 231, y: 74 });
  expect(garmentToAtlas(front, 192, 192)).toEqual({ x: 359, y: 202 });
  expect(garmentToAtlas(front, 191.5, 201.5)).toEqual({ x: 358.5, y: 211.5 });
});

test("garmentToAtlas inverts atlasToGarment for every panel", () => {
  for (const panel of shirtPanels()) {
    const corners: ReadonlyArray<readonly [number, number]> = [
      [panel.garmentRect.x, panel.garmentRect.y],
      [panel.garmentRect.x + panel.garmentRect.width, panel.garmentRect.y],
      [panel.garmentRect.x, panel.garmentRect.y + panel.garmentRect.height],
      [panel.garmentRect.x + panel.garmentRect.width, panel.garmentRect.y + panel.garmentRect.height],
      [panel.garmentRect.x + 7, panel.garmentRect.y + 13],
    ];
    for (const [gx, gy] of corners) {
      const atlas = garmentToAtlas(panel, gx, gy);
      expect(atlas.x + panel.atlasToGarment.e).toBeCloseTo(gx, 12);
      expect(atlas.y + panel.atlasToGarment.f).toBeCloseTo(gy, 12);
    }
  }
});
