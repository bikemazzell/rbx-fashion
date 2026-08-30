import { createProject } from "../domain/project";
import { LIMITS } from "../domain/types";
import type {
  AssetManifestEntry,
  CutoutRect,
  GarmentType,
  Layer,
  PaintLayer,
  PlacementMode,
  ProjectDocument,
  ProjectDocumentV1,
  Transform,
} from "../domain/types";
import { isCropValid } from "../compositor/math";

export type TransformPatch = Partial<
  Pick<Transform, "positionX" | "positionY" | "rotationDeg" | "scaleX" | "scaleY" | "crop">
>;

export type ItemSpec =
  | { kind: "solid"; color: string; transform: Transform }
  | { kind: "raster"; assetId: string; placement: PlacementMode; transform: Transform }
  | { kind: "cutout"; rect: CutoutRect };

export type CutoutRectPatch = Partial<CutoutRect>;

export type GestureMutation =
  | { op: "patch-transform"; id: string; patch: TransformPatch }
  | { op: "patch-cutout"; id: string; patch: CutoutRectPatch }
  | { op: "set-opacity"; id: string; opacity: number }
  | { op: "set-color"; id: string; color: string }
  | { op: "set-placement"; id: string; placement: PlacementMode };

export type EditorAction =
  | { type: "new-project"; garment: GarmentType; name?: string }
  | { type: "add-item"; item: ItemSpec }
  | { type: "duplicate-item"; id: string }
  | { type: "rename-item"; id: string; name: string }
  | { type: "reorder-item"; id: string; toIndex: number }
  | { type: "toggle-visibility"; id: string }
  | { type: "delete-item"; id: string }
  | { type: "set-placement"; id: string; placement: PlacementMode }
  | { type: "patch-transform"; id: string; patch: TransformPatch }
  | { type: "patch-cutout"; id: string; patch: CutoutRectPatch }
  | { type: "set-opacity"; id: string; opacity: number }
  | { type: "set-color"; id: string; color: string }
  | { type: "mark-saved" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "begin-gesture" }
  | { type: "update-gesture"; mutation: GestureMutation }
  | { type: "commit-gesture" }
  | { type: "cancel-gesture" };

export interface LayerCounters {
  raster: number;
  solid: number;
  cutout: number;
}

export interface EditorSession {
  document: ProjectDocument;
  undo: ProjectDocument[];
  redo: ProjectDocument[];
  pending: ProjectDocument | null;
  dirty: boolean;
  counters: LayerCounters;
}

type IdFactory = () => string;

type MutatingAction = Extract<
  EditorAction,
  {
    type:
      | "add-item"
      | "duplicate-item"
      | "rename-item"
      | "reorder-item"
      | "toggle-visibility"
      | "delete-item"
      | "set-placement"
      | "patch-transform"
      | "patch-cutout"
      | "set-opacity"
      | "set-color";
  }
>;

interface MutationResult {
  document: ProjectDocument;
  counters: LayerCounters;
}

const defaultIdFactory: IdFactory = () => crypto.randomUUID();

export function createSession(garment: GarmentType, name?: string): EditorSession {
  return {
    document: createProject(garment, name),
    undo: [],
    redo: [],
    pending: null,
    dirty: false,
    counters: { raster: 0, solid: 0, cutout: 0 },
  };
}

const PLACEMENT_MODES: ReadonlySet<string> = new Set(["decal", "pattern", "full-map"]);
const SOURCE_MIME_TYPES: ReadonlySet<string> = new Set(["image/png", "image/jpeg", "image/webp"]);
const ASSET_SOURCES: ReadonlySet<string> = new Set(["imported", "generated"]);
const SHA256_HEX = /^[0-9a-f]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isIntegerInRange(value: unknown, min: number, max: number): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function isName(value: unknown): boolean {
  return typeof value === "string" && value.trim().length >= 1 && value.trim().length <= 40;
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function isValidTransformShape(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.crop)) {
    return false;
  }
  return (
    isFiniteNumber(value.positionX) &&
    isFiniteNumber(value.positionY) &&
    isFiniteNumber(value.rotationDeg) &&
    isFiniteNumber(value.scaleX) &&
    isFiniteNumber(value.scaleY) &&
    value.scaleX > 0 &&
    value.scaleY > 0 &&
    isFiniteNumber(value.crop.x) &&
    isFiniteNumber(value.crop.y) &&
    isFiniteNumber(value.crop.width) &&
    isFiniteNumber(value.crop.height) &&
    isCropValid(value.crop as Transform["crop"])
  );
}

function isValidPaintLayerShape(value: unknown): value is PaintLayer {
  if (!isRecord(value)) {
    return false;
  }
  if (typeof value.id !== "string" || value.id.length === 0 || !isName(value.name)) {
    return false;
  }
  if (value.kind !== "solid" && value.kind !== "raster") {
    return false;
  }
  if (
    typeof value.visible !== "boolean" ||
    !isFiniteNumber(value.opacity) ||
    value.opacity < 0 ||
    value.opacity > 1 ||
    typeof value.placement !== "string" ||
    !PLACEMENT_MODES.has(value.placement) ||
    !isValidTransformShape(value.transform)
  ) {
    return false;
  }
  if (value.kind === "raster") {
    return typeof value.assetId === "string" && value.assetId.length > 0;
  }
  return typeof value.color === "string" && value.color.length > 0;
}

const CUTOUT_KEYS: ReadonlySet<string> = new Set(["id", "name", "kind", "visible", "rect"]);
const CUTOUT_RECT_KEYS: ReadonlySet<string> = new Set([
  "centerX",
  "centerY",
  "width",
  "height",
  "rotationDeg",
]);

function isValidCutoutLayerShape(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, CUTOUT_KEYS) ||
    !isRecord(value.rect) ||
    !hasOnlyKeys(value.rect, CUTOUT_RECT_KEYS)
  ) {
    return false;
  }
  return (
    typeof value.id === "string" &&
    value.id.length > 0 &&
    isName(value.name) &&
    value.kind === "cutout" &&
    typeof value.visible === "boolean" &&
    isFiniteNumber(value.rect.centerX) &&
    isFiniteNumber(value.rect.centerY) &&
    isFiniteNumber(value.rect.width) &&
    value.rect.width > 0 &&
    isFiniteNumber(value.rect.height) &&
    value.rect.height > 0 &&
    isFiniteNumber(value.rect.rotationDeg)
  );
}

function isValidManifestEntryShape(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  if (typeof value.id !== "string" || value.id.length === 0) {
    return false;
  }
  if (value.path !== `assets/${value.id}.png`) {
    return false;
  }
  if (
    typeof value.originalName !== "string" ||
    typeof value.sourceMimeType !== "string" ||
    !SOURCE_MIME_TYPES.has(value.sourceMimeType) ||
    typeof value.source !== "string" ||
    !ASSET_SOURCES.has(value.source)
  ) {
    return false;
  }
  if (
    !isIntegerInRange(value.byteLength, 1, Number.MAX_SAFE_INTEGER) ||
    !isIntegerInRange(value.width, 1, LIMITS.IMPORT_MAX_DIM) ||
    !isIntegerInRange(value.height, 1, LIMITS.IMPORT_MAX_DIM)
  ) {
    return false;
  }
  if (typeof value.sha256 !== "string" || !SHA256_HEX.test(value.sha256)) {
    return false;
  }
  return value.prompt === undefined || typeof value.prompt === "string";
}

function hasValidDocumentHeader(value: Record<string, unknown>, schemaVersion: 1 | 2): boolean {
  return (
    value.format === "rbx-fashion-project" &&
    value.schemaVersion === schemaVersion &&
    isName(value.name) &&
    (value.garmentType === "tshirt" || value.garmentType === "shirt" || value.garmentType === "pants")
  );
}

function hasValidAssets(value: Record<string, unknown>): boolean {
  if (!Array.isArray(value.assets)) {
    return false;
  }
  const assetIds = new Set<string>();
  for (const entry of value.assets) {
    if (!isValidManifestEntryShape(entry) || !isRecord(entry)) {
      return false;
    }
    const id = entry.id as string;
    if (assetIds.has(id)) {
      return false;
    }
    assetIds.add(id);
  }
  return true;
}

export function isValidProjectDocumentV1(value: unknown): value is ProjectDocumentV1 {
  if (!isRecord(value) || !hasValidDocumentHeader(value, 1)) {
    return false;
  }
  if (!Array.isArray(value.layers) || value.layers.length > LIMITS.MAX_LAYERS || !hasValidAssets(value)) {
    return false;
  }
  const layerIds = new Set<string>();
  for (const layer of value.layers) {
    if (!isValidPaintLayerShape(layer) || !isRecord(layer)) {
      return false;
    }
    const id = layer.id as string;
    if (layerIds.has(id)) {
      return false;
    }
    layerIds.add(id);
  }
  const assetIds = new Set(
    (value.assets as unknown[]).map((entry) => (entry as AssetManifestEntry).id),
  );
  return value.layers.every(
    (layer) => !isRecord(layer) || layer.kind !== "raster" || assetIds.has(layer.assetId as string),
  );
}

export function migrateProjectDocumentV1(document: ProjectDocumentV1): ProjectDocument {
  return { ...document, schemaVersion: 2, layers: document.layers.slice(), assets: document.assets.slice() };
}

export function isValidProjectDocument(value: unknown): value is ProjectDocument {
  if (!isRecord(value) || !hasValidDocumentHeader(value, 2)) {
    return false;
  }
  if (!Array.isArray(value.layers) || value.layers.length > LIMITS.MAX_LAYERS || !hasValidAssets(value)) {
    return false;
  }
  const layerIds = new Set<string>();
  const assetIds = new Set(
    (value.assets as unknown[]).map((entry) => (entry as AssetManifestEntry).id),
  );
  let sawCutout = false;
  for (const layer of value.layers) {
    if (!isRecord(layer)) {
      return false;
    }
    const valid = layer.kind === "cutout" ? isValidCutoutLayerShape(layer) : isValidPaintLayerShape(layer);
    if (!valid) {
      return false;
    }
    if (layer.kind === "raster" && !assetIds.has(layer.assetId as string)) {
      return false;
    }
    if (layer.kind === "cutout") {
      sawCutout = true;
    } else if (sawCutout) {
      return false;
    }
    const id = layer.id as string;
    if (layerIds.has(id)) {
      return false;
    }
    layerIds.add(id);
  }
  return true;
}

export function createSessionFromDocument(document: ProjectDocument): EditorSession | null {
  if (!isValidProjectDocument(document)) {
    return null;
  }
  const counters: LayerCounters = { raster: 0, solid: 0, cutout: 0 };
  for (const layer of document.layers) {
    if (layer.kind === "raster") {
      counters.raster += 1;
    } else if (layer.kind === "solid") {
      counters.solid += 1;
    } else {
      counters.cutout += 1;
    }
  }
  return { document, undo: [], redo: [], pending: null, dirty: false, counters };
}

export function dispatch(
  session: EditorSession,
  action: EditorAction,
  idFactory: IdFactory = defaultIdFactory,
): EditorSession {
  switch (action.type) {
    case "new-project":
      return createSession(action.garment, action.name);
    case "mark-saved":
      if (session.pending !== null) {
        return session;
      }
      return { ...session, dirty: false };
    case "begin-gesture":
      if (session.pending !== null) {
        return session;
      }
      return { ...session, pending: session.document };
    case "update-gesture":
      if (session.pending === null) {
        return session;
      }
      return applyGestureMutation(session, action.mutation, idFactory);
    case "commit-gesture": {
      if (session.pending === null) {
        return session;
      }
      const pending = session.pending;
      if (deepEquals(session.document, pending)) {
        return { ...session, pending: null };
      }
      return {
        ...session,
        undo: pushHistory(session.undo, pending),
        redo: [],
        dirty: true,
        pending: null,
      };
    }
    case "cancel-gesture":
      if (session.pending === null) {
        return session;
      }
      return { ...session, document: session.pending, pending: null };
    case "undo": {
      if (session.pending !== null || session.undo.length === 0) {
        return session;
      }
      const previous = session.undo[session.undo.length - 1];
      if (previous === undefined) {
        return session;
      }
      return {
        ...session,
        document: previous,
        undo: session.undo.slice(0, -1),
        redo: [...session.redo, session.document],
      };
    }
    case "redo": {
      if (session.pending !== null || session.redo.length === 0) {
        return session;
      }
      const next = session.redo[session.redo.length - 1];
      if (next === undefined) {
        return session;
      }
      return {
        ...session,
        document: next,
        redo: session.redo.slice(0, -1),
        undo: pushHistory(session.undo, session.document),
      };
    }
    default:
      if (session.pending !== null) {
        return session;
      }
      return applyMutation(session, action, idFactory);
  }
}

function applyMutation(
  session: EditorSession,
  action: MutatingAction,
  idFactory: IdFactory,
): EditorSession {
  const result = mutate(session, action, idFactory);
  if (result === null || deepEquals(result.document, session.document)) {
    return session;
  }
  return {
    ...session,
    document: result.document,
    counters: result.counters,
    undo: pushHistory(session.undo, session.document),
    redo: [],
    dirty: true,
  };
}

function applyGestureMutation(
  session: EditorSession,
  mutation: GestureMutation,
  idFactory: IdFactory,
): EditorSession {
  const result = mutate(session, toMutatingAction(mutation), idFactory);
  if (result === null) {
    return session;
  }
  return { ...session, document: result.document, counters: result.counters };
}

function toMutatingAction(mutation: GestureMutation): MutatingAction {
  switch (mutation.op) {
    case "patch-transform":
      return { type: "patch-transform", id: mutation.id, patch: mutation.patch };
    case "patch-cutout":
      return { type: "patch-cutout", id: mutation.id, patch: mutation.patch };
    case "set-opacity":
      return { type: "set-opacity", id: mutation.id, opacity: mutation.opacity };
    case "set-color":
      return { type: "set-color", id: mutation.id, color: mutation.color };
    case "set-placement":
      return { type: "set-placement", id: mutation.id, placement: mutation.placement };
  }
}

function mutate(
  session: EditorSession,
  action: MutatingAction,
  idFactory: IdFactory,
): MutationResult | null {
  const doc = session.document;
  const counters = session.counters;
  switch (action.type) {
    case "add-item":
      return addItem(doc, counters, action.item, idFactory);
    case "duplicate-item":
      return duplicateItem(doc, counters, action.id, idFactory);
    case "rename-item": {
      const name = trimmedName(action.name);
      if (name === null) {
        return null;
      }
      const document = updateLayer(doc, action.id, (layer) => ({ ...layer, name }));
      return document === null ? null : accepted(document, counters);
    }
    case "reorder-item":
      return reorderLayer(doc, counters, action.id, action.toIndex);
    case "toggle-visibility": {
      const document = updateLayer(doc, action.id, (layer) => ({
        ...layer,
        visible: !layer.visible,
      }));
      return document === null ? null : accepted(document, counters);
    }
    case "delete-item": {
      if (layerIndex(doc, action.id) < 0) {
        return null;
      }
      return accepted(
        { ...doc, layers: doc.layers.filter((layer) => layer.id !== action.id) },
        counters,
      );
    }
    case "set-placement": {
      const current = doc.layers.find((layer) => layer.id === action.id);
      if (current === undefined || current.kind !== "raster") {
        return null;
      }
      const document = updateLayer(doc, action.id, (layer) => ({
        ...layer,
        placement: action.placement,
      }));
      return document === null ? null : accepted(document, counters);
    }
    case "patch-transform": {
      if (!isTransformPatchValid(action.patch)) {
        return null;
      }
      const current = doc.layers.find((layer) => layer.id === action.id);
      if (
        current === undefined ||
        current.kind === "cutout" ||
        (current.kind === "solid" && current.placement !== "decal")
      ) {
        return null;
      }
      const index = layerIndex(doc, action.id);
      return accepted(
        replaceLayer(doc, index, {
          ...current,
          transform: mergeTransform(current.transform, action.patch),
        }),
        counters,
      );
    }
    case "patch-cutout": {
      if (!isCutoutRectPatchValid(action.patch)) {
        return null;
      }
      const index = layerIndex(doc, action.id);
      const layer = index < 0 ? undefined : doc.layers[index];
      if (layer === undefined || layer.kind !== "cutout") {
        return null;
      }
      const rect = { ...layer.rect, ...action.patch };
      if (!isCutoutRectValid(rect)) {
        return null;
      }
      return accepted(replaceLayer(doc, index, { ...layer, rect }), counters);
    }
    case "set-opacity": {
      if (!isOpacityValid(action.opacity)) {
        return null;
      }
      const current = doc.layers.find((layer) => layer.id === action.id);
      if (current === undefined || current.kind === "cutout") {
        return null;
      }
      const document = updateLayer(doc, action.id, (layer) => ({
        ...layer,
        opacity: action.opacity,
      }));
      return document === null ? null : accepted(document, counters);
    }
    case "set-color": {
      const index = layerIndex(doc, action.id);
      const layer = index < 0 ? undefined : doc.layers[index];
      if (layer === undefined || layer.kind !== "solid") {
        return null;
      }
      return accepted(replaceLayer(doc, index, { ...layer, color: action.color }), counters);
    }
  }
}

function addItem(
  doc: ProjectDocument,
  counters: LayerCounters,
  item: ItemSpec,
  idFactory: IdFactory,
): MutationResult | null {
  if (doc.layers.length >= LIMITS.MAX_LAYERS) {
    return null;
  }
  if (item.kind === "cutout") {
    if (!isCutoutRectValid(item.rect)) {
      return null;
    }
    const next: LayerCounters = { ...counters, cutout: counters.cutout + 1 };
    const layer: Layer = {
      id: idFactory(),
      name: `Cut Out ${next.cutout}`,
      kind: "cutout",
      visible: true,
      rect: { ...item.rect },
    };
    return accepted({ ...doc, layers: [...doc.layers, layer] }, next);
  }
  const firstCutout = doc.layers.findIndex((layer) => layer.kind === "cutout");
  const paintInsertIndex = firstCutout < 0 ? doc.layers.length : firstCutout;
  if (item.kind === "solid") {
    if (!isTransformValid(item.transform)) {
      return null;
    }
    const next: LayerCounters = { ...counters, solid: counters.solid + 1 };
    const layer: Layer = {
      id: idFactory(),
      name: `Color ${next.solid}`,
      kind: "solid",
      color: item.color,
      visible: true,
      opacity: 1,
      placement: "decal",
      transform: copyTransform(item.transform),
    };
    const layers = doc.layers.slice();
    layers.splice(paintInsertIndex, 0, layer);
    return accepted({ ...doc, layers }, next);
  }
  if (!isTransformValid(item.transform)) {
    return null;
  }
  const next: LayerCounters = { ...counters, raster: counters.raster + 1 };
  const layer: Layer = {
    id: idFactory(),
    name: `Picture ${next.raster}`,
    kind: "raster",
    assetId: item.assetId,
    visible: true,
    opacity: 1,
    placement: item.placement,
    transform: copyTransform(item.transform),
  };
  const layers = doc.layers.slice();
  layers.splice(paintInsertIndex, 0, layer);
  return accepted({ ...doc, layers }, next);
}

function duplicateItem(
  doc: ProjectDocument,
  counters: LayerCounters,
  id: string,
  idFactory: IdFactory,
): MutationResult | null {
  if (doc.layers.length >= LIMITS.MAX_LAYERS) {
    return null;
  }
  const index = layerIndex(doc, id);
  const source = index < 0 ? undefined : doc.layers[index];
  if (source === undefined) {
    return null;
  }
  if (source.kind === "cutout") {
    const next: LayerCounters = { ...counters, cutout: counters.cutout + 1 };
    const copy: Layer = {
      ...source,
      id: idFactory(),
      name: `Cut Out ${next.cutout}`,
      rect: { ...source.rect },
    };
    return accepted({ ...doc, layers: [...doc.layers, copy] }, next);
  }
  const next: LayerCounters =
    source.kind === "solid"
      ? { ...counters, solid: counters.solid + 1 }
      : { ...counters, raster: counters.raster + 1 };
  const name = source.kind === "solid" ? `Color ${next.solid}` : `Picture ${next.raster}`;
  const copy: PaintLayer = {
    ...source,
    id: idFactory(),
    name,
    transform: copyTransform(source.transform),
  };
  const firstCutout = doc.layers.findIndex((layer) => layer.kind === "cutout");
  const insertIndex = firstCutout < 0 ? doc.layers.length : firstCutout;
  const layers = doc.layers.slice();
  layers.splice(insertIndex, 0, copy);
  return accepted({ ...doc, layers }, next);
}

function reorderLayer(
  doc: ProjectDocument,
  counters: LayerCounters,
  id: string,
  toIndex: number,
): MutationResult | null {
  if (!Number.isFinite(toIndex)) {
    return null;
  }
  const from = layerIndex(doc, id);
  if (from < 0) {
    return null;
  }
  const source = doc.layers[from];
  if (source === undefined || source.kind === "cutout") {
    return null;
  }
  const firstCutout = doc.layers.findIndex((layer) => layer.kind === "cutout");
  const paintCount = firstCutout < 0 ? doc.layers.length : firstCutout;
  const layers = doc.layers.slice();
  const [moved] = layers.splice(from, 1);
  if (moved === undefined) {
    return null;
  }
  const clamped = Math.min(Math.max(Math.trunc(toIndex), 0), paintCount - 1);
  layers.splice(clamped, 0, moved);
  return accepted({ ...doc, layers }, counters);
}

function accepted(document: ProjectDocument, counters: LayerCounters): MutationResult {
  return { document, counters };
}

function pushHistory(
  stack: ProjectDocument[],
  snapshot: ProjectDocument,
): ProjectDocument[] {
  const next = [...stack, snapshot];
  return next.length > LIMITS.MAX_HISTORY ? next.slice(next.length - LIMITS.MAX_HISTORY) : next;
}

function layerIndex(doc: ProjectDocument, id: string): number {
  return doc.layers.findIndex((layer) => layer.id === id);
}

function replaceLayer(doc: ProjectDocument, index: number, layer: Layer): ProjectDocument {
  const layers = doc.layers.slice();
  layers[index] = layer;
  return { ...doc, layers };
}

function updateLayer(
  doc: ProjectDocument,
  id: string,
  update: (layer: Layer) => Layer,
): ProjectDocument | null {
  const index = layerIndex(doc, id);
  const layer = index < 0 ? undefined : doc.layers[index];
  if (layer === undefined) {
    return null;
  }
  return replaceLayer(doc, index, update(layer));
}

function copyTransform(transform: Transform): Transform {
  return { ...transform, crop: { ...transform.crop } };
}

function mergeTransform(base: Transform, patch: TransformPatch): Transform {
  return {
    ...base,
    ...patch,
    crop: patch.crop === undefined ? base.crop : { ...patch.crop },
  };
}

function trimmedName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > 40) {
    return null;
  }
  return trimmed;
}

function isOpacityValid(opacity: number): boolean {
  return Number.isFinite(opacity) && opacity >= 0 && opacity <= 1;
}

function isTransformValid(transform: Transform): boolean {
  return (
    Number.isFinite(transform.positionX) &&
    Number.isFinite(transform.positionY) &&
    Number.isFinite(transform.rotationDeg) &&
    Number.isFinite(transform.scaleX) &&
    transform.scaleX > 0 &&
    Number.isFinite(transform.scaleY) &&
    transform.scaleY > 0 &&
    isCropValid(transform.crop)
  );
}

function isTransformPatchValid(patch: TransformPatch): boolean {
  return (
    (patch.positionX === undefined || Number.isFinite(patch.positionX)) &&
    (patch.positionY === undefined || Number.isFinite(patch.positionY)) &&
    (patch.rotationDeg === undefined || Number.isFinite(patch.rotationDeg)) &&
    (patch.scaleX === undefined || (Number.isFinite(patch.scaleX) && patch.scaleX > 0)) &&
    (patch.scaleY === undefined || (Number.isFinite(patch.scaleY) && patch.scaleY > 0)) &&
    (patch.crop === undefined || isCropValid(patch.crop))
  );
}

function isCutoutRectValid(rect: CutoutRect): boolean {
  return (
    Number.isFinite(rect.centerX) &&
    Number.isFinite(rect.centerY) &&
    Number.isFinite(rect.rotationDeg) &&
    Number.isFinite(rect.width) &&
    rect.width > 0 &&
    Number.isFinite(rect.height) &&
    rect.height > 0
  );
}

function isCutoutRectPatchValid(patch: CutoutRectPatch): boolean {
  return (
    (patch.centerX === undefined || Number.isFinite(patch.centerX)) &&
    (patch.centerY === undefined || Number.isFinite(patch.centerY)) &&
    (patch.rotationDeg === undefined || Number.isFinite(patch.rotationDeg)) &&
    (patch.width === undefined || (Number.isFinite(patch.width) && patch.width > 0)) &&
    (patch.height === undefined || (Number.isFinite(patch.height) && patch.height > 0))
  );
}

function deepEquals(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    return false;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false;
    }
    return a.every((value, index) => deepEquals(value, b[index]));
  }
  const recordA = a as Record<string, unknown>;
  const recordB = b as Record<string, unknown>;
  const keysA = Object.keys(recordA);
  const keysB = Object.keys(recordB);
  if (keysA.length !== keysB.length) {
    return false;
  }
  return keysA.every((key) => Object.hasOwn(recordB, key) && deepEquals(recordA[key], recordB[key]));
}
