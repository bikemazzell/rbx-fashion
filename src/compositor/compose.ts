import type { AssetStore, NormalizedPngAsset } from "../assets/store";
import { getTemplate } from "../domain/registry";
import { LIMITS } from "../domain/types";
import type { PaintLayer, ProjectDocument, RasterLayer, Rect, SolidLayer } from "../domain/types";
import {
  countPatternTileDraws,
  cropToPixels,
  isCropValid,
  tileCenter,
  tilesIntersectingRect,
  type TileGrid,
} from "./math";

export const PATTERN_TOO_SMALL_MESSAGE = "Pattern is too small—make it larger";

export interface ComposeInput {
  document: ProjectDocument;
  assets: AssetStore;
}

export type ComposeFailure =
  | { kind: "pattern-too-small"; message: typeof PATTERN_TOO_SMALL_MESSAGE }
  | { kind: "invalid-document"; message: string };

interface PanelTarget {
  atlasRect: Rect;
  garmentRect: Rect;
  garmentToAtlasX: number;
  garmentToAtlasY: number;
}

function panelTargets(template: ReturnType<typeof getTemplate>): PanelTarget[] {
  if (template.garment === "tshirt") {
    const rect = template.target.rect;
    return [{ atlasRect: rect, garmentRect: rect, garmentToAtlasX: 0, garmentToAtlasY: 0 }];
  }
  return template.panels.map((panel) => ({
    atlasRect: panel.atlasRect,
    garmentRect: panel.garmentRect,
    garmentToAtlasX: -panel.atlasToGarment.e,
    garmentToAtlasY: -panel.atlasToGarment.f,
  }));
}

function invalid(message: string): ComposeFailure {
  return { kind: "invalid-document", message };
}

function patternTooSmall(): ComposeFailure {
  return { kind: "pattern-too-small", message: PATTERN_TOO_SMALL_MESSAGE };
}

function validateDocument(doc: ProjectDocument, assets: AssetStore): void {
  if (doc.layers.length > LIMITS.MAX_LAYERS) {
    throw invalid(`too many layers: ${doc.layers.length} > ${LIMITS.MAX_LAYERS}`);
  }
  for (const [index, layer] of doc.layers.entries()) {
    if (layer.kind === "cutout") {
      const rect = layer.rect;
      if (
        !Number.isFinite(rect.centerX) ||
        !Number.isFinite(rect.centerY) ||
        !Number.isFinite(rect.rotationDeg) ||
        !Number.isFinite(rect.width) ||
        rect.width <= 0 ||
        !Number.isFinite(rect.height) ||
        rect.height <= 0
      ) {
        throw invalid(`layer ${index} (${layer.name}) has invalid cutout geometry`);
      }
      continue;
    }
    const transform = layer.transform;
    if (
      !Number.isFinite(transform.scaleX) ||
      !Number.isFinite(transform.scaleY) ||
      transform.scaleX <= 0 ||
      transform.scaleY <= 0
    ) {
      throw invalid(`layer ${index} (${layer.name}) has a non-finite or non-positive scale`);
    }
    if (!Number.isFinite(layer.opacity) || layer.opacity < 0 || layer.opacity > 1) {
      throw invalid(`layer ${index} (${layer.name}) has an opacity outside [0,1]`);
    }
    if (layer.kind === "raster") {
      if (layer.assetId === undefined || !assets.has(layer.assetId)) {
        throw invalid(`layer ${index} (${layer.name}) references a missing asset`);
      }
      if (!isCropValid(transform.crop)) {
        throw invalid(`layer ${index} (${layer.name}) has an invalid crop`);
      }
    } else if (layer.color === undefined) {
      throw invalid(`layer ${index} (${layer.name}) is missing a color`);
    }
  }
}

function rasterAsset(layer: RasterLayer, assets: AssetStore): NormalizedPngAsset {
  const asset = assets.get(layer.assetId);
  if (asset === undefined) {
    throw invalid(`layer (${layer.name}) references a missing asset`);
  }
  return asset;
}

function solidColor(layer: SolidLayer): string {
  return layer.color;
}

function buildGrid(layer: RasterLayer, asset: NormalizedPngAsset): TileGrid {
  const source = cropToPixels(layer.transform.crop, asset.width, asset.height);
  return {
    cw: source.cw,
    ch: source.ch,
    scaleX: layer.transform.scaleX,
    scaleY: layer.transform.scaleY,
    rotationDeg: layer.transform.rotationDeg,
    positionX: layer.transform.positionX,
    positionY: layer.transform.positionY,
  };
}

function checkTileBudget(doc: ProjectDocument, assets: AssetStore, targets: readonly PanelTarget[]): void {
  const garmentRects = targets.map((target) => target.garmentRect);
  let total = 0;
  for (const layer of doc.layers) {
    if (layer.kind !== "raster" || !layer.visible || layer.placement !== "pattern") {
      continue;
    }
    const grid = buildGrid(layer, rasterAsset(layer, assets));
    const perLayer = countPatternTileDraws(grid, garmentRects, LIMITS.PATTERN_TILE_DRAWS_PER_LAYER);
    if (perLayer > LIMITS.PATTERN_TILE_DRAWS_PER_LAYER) {
      throw patternTooSmall();
    }
    total += perLayer;
    if (total > LIMITS.PATTERN_TILE_DRAWS_TOTAL) {
      throw patternTooSmall();
    }
  }
}

function ctx2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    throw new Error("2d canvas context unavailable");
  }
  return ctx;
}

function clipToTargets(ctx: CanvasRenderingContext2D, targets: readonly PanelTarget[]): void {
  ctx.beginPath();
  for (const target of targets) {
    ctx.rect(target.atlasRect.x, target.atlasRect.y, target.atlasRect.width, target.atlasRect.height);
  }
  ctx.clip();
}

function drawCroppedCentered(
  ctx: CanvasRenderingContext2D,
  asset: NormalizedPngAsset,
  source: ReturnType<typeof cropToPixels>,
  translateX: number,
  translateY: number,
  rotationDeg: number,
  scaleX: number,
  scaleY: number,
): void {
  ctx.save();
  ctx.translate(translateX, translateY);
  ctx.rotate((rotationDeg * Math.PI) / 180);
  ctx.scale(scaleX, scaleY);
  ctx.drawImage(
    asset.drawable,
    source.sourceX,
    source.sourceY,
    source.cw,
    source.ch,
    -source.cw / 2,
    -source.ch / 2,
    source.cw,
    source.ch,
  );
  ctx.restore();
}

function fillSolidCentered(ctx: CanvasRenderingContext2D, layer: SolidLayer): void {
  ctx.save();
  ctx.fillStyle = solidColor(layer);
  ctx.translate(layer.transform.positionX, layer.transform.positionY);
  ctx.rotate((layer.transform.rotationDeg * Math.PI) / 180);
  ctx.scale(layer.transform.scaleX, layer.transform.scaleY);
  ctx.fillRect(-0.5, -0.5, 1, 1);
  ctx.restore();
}

function drawDecal(
  ctx: CanvasRenderingContext2D,
  layer: PaintLayer,
  targets: readonly PanelTarget[],
  assets: AssetStore,
): void {
  ctx.save();
  clipToTargets(ctx, targets);
  if (layer.kind === "raster") {
    const asset = rasterAsset(layer, assets);
    const source = cropToPixels(layer.transform.crop, asset.width, asset.height);
    drawCroppedCentered(
      ctx,
      asset,
      source,
      layer.transform.positionX,
      layer.transform.positionY,
      layer.transform.rotationDeg,
      layer.transform.scaleX,
      layer.transform.scaleY,
    );
  } else {
    fillSolidCentered(ctx, layer);
  }
  ctx.restore();
}

function drawFullMap(ctx: CanvasRenderingContext2D, layer: PaintLayer, assets: AssetStore): void {
  if (layer.kind === "raster") {
    const asset = rasterAsset(layer, assets);
    const source = cropToPixels(layer.transform.crop, asset.width, asset.height);
    drawCroppedCentered(
      ctx,
      asset,
      source,
      layer.transform.positionX,
      layer.transform.positionY,
      layer.transform.rotationDeg,
      layer.transform.scaleX,
      layer.transform.scaleY,
    );
    return;
  }
  fillSolidCentered(ctx, layer);
}

function drawRasterPattern(
  ctx: CanvasRenderingContext2D,
  layer: RasterLayer,
  asset: NormalizedPngAsset,
  targets: readonly PanelTarget[],
): number {
  const grid = buildGrid(layer, asset);
  const source = cropToPixels(layer.transform.crop, asset.width, asset.height);
  let draws = 0;
  for (const target of targets) {
    const tiles = tilesIntersectingRect(grid, target.garmentRect);
    if (tiles.length === 0) {
      continue;
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(target.atlasRect.x, target.atlasRect.y, target.atlasRect.width, target.atlasRect.height);
    ctx.clip();
    for (const { i, j } of tiles) {
      const center = tileCenter(grid, i, j);
      drawCroppedCentered(
        ctx,
        asset,
        source,
        target.garmentToAtlasX + center.x,
        target.garmentToAtlasY + center.y,
        grid.rotationDeg,
        grid.scaleX,
        grid.scaleY,
      );
      draws++;
    }
    ctx.restore();
  }
  return draws;
}

function drawSolidPattern(ctx: CanvasRenderingContext2D, layer: SolidLayer, targets: readonly PanelTarget[]): void {
  ctx.fillStyle = solidColor(layer);
  for (const target of targets) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(target.atlasRect.x, target.atlasRect.y, target.atlasRect.width, target.atlasRect.height);
    ctx.clip();
    ctx.fillRect(target.atlasRect.x, target.atlasRect.y, target.atlasRect.width, target.atlasRect.height);
    ctx.restore();
  }
}

function eraseCutout(
  ctx: CanvasRenderingContext2D,
  layer: Extract<ProjectDocument["layers"][number], { kind: "cutout" }>,
): void {
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.globalAlpha = 1;
  ctx.translate(layer.rect.centerX, layer.rect.centerY);
  ctx.rotate((layer.rect.rotationDeg * Math.PI) / 180);
  ctx.fillStyle = "#000000";
  ctx.fillRect(-layer.rect.width / 2, -layer.rect.height / 2, layer.rect.width, layer.rect.height);
  ctx.restore();
}

export function composeProject(input: ComposeInput): { canvas: HTMLCanvasElement; tileDraws: number } {
  const doc = input.document;
  const template = getTemplate(doc.garmentType);
  validateDocument(doc, input.assets);
  const targets = panelTargets(template);
  checkTileBudget(doc, input.assets, targets);

  const canvas = document.createElement("canvas");
  canvas.width = template.width;
  canvas.height = template.height;
  const ctx = ctx2d(canvas);

  let tileDraws = 0;
  for (const layer of doc.layers) {
    if (!layer.visible || layer.kind === "cutout") {
      continue;
    }
    ctx.save();
    ctx.globalAlpha = layer.opacity;
    if (layer.placement === "decal") {
      drawDecal(ctx, layer, targets, input.assets);
    } else if (layer.placement === "full-map") {
      drawFullMap(ctx, layer, input.assets);
    } else if (layer.kind === "raster") {
      tileDraws += drawRasterPattern(ctx, layer, rasterAsset(layer, input.assets), targets);
    } else {
      drawSolidPattern(ctx, layer, targets);
    }
    ctx.restore();
  }
  for (const layer of doc.layers) {
    if (layer.kind === "cutout" && layer.visible) {
      eraseCutout(ctx, layer);
    }
  }
  return { canvas, tileDraws };
}
