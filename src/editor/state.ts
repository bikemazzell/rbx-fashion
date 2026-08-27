import { createProject } from "../domain/project";
import { LIMITS } from "../domain/types";
import type {
  GarmentType,
  Layer,
  PlacementMode,
  ProjectDocumentV1,
  Transform,
} from "../domain/types";
import { isCropValid } from "../compositor/math";

export type TransformPatch = Partial<
  Pick<Transform, "positionX" | "positionY" | "rotationDeg" | "scaleX" | "scaleY" | "crop">
>;

export type ItemSpec =
  | { kind: "solid"; color: string }
  | { kind: "raster"; assetId: string; placement: PlacementMode; transform: Transform };

export type GestureMutation =
  | { op: "patch-transform"; id: string; patch: TransformPatch }
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
}

export interface EditorSession {
  document: ProjectDocumentV1;
  undo: ProjectDocumentV1[];
  redo: ProjectDocumentV1[];
  pending: ProjectDocumentV1 | null;
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
      | "set-opacity"
      | "set-color";
  }
>;

interface MutationResult {
  document: ProjectDocumentV1;
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
    counters: { raster: 0, solid: 0 },
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

function isValidLayerShape(value: unknown): boolean {
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

export function isValidProjectDocument(value: unknown): boolean {
  if (!isRecord(value) || !isName(value.name)) {
    return false;
  }
  if (!Array.isArray(value.layers) || !Array.isArray(value.assets)) {
    return false;
  }
  const layerIds = new Set<string>();
  for (const layer of value.layers) {
    if (!isValidLayerShape(layer) || !isRecord(layer)) {
      return false;
    }
    const id = layer.id as string;
    if (layerIds.has(id)) {
      return false;
    }
    layerIds.add(id);
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

export function createSessionFromDocument(document: ProjectDocumentV1): EditorSession | null {
  if (!isValidProjectDocument(document)) {
    return null;
  }
  const counters: LayerCounters = { raster: 0, solid: 0 };
  for (const layer of document.layers) {
    if (layer.kind === "raster") {
      counters.raster += 1;
    } else {
      counters.solid += 1;
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
      const document = updateLayer(doc, action.id, (layer) => ({
        ...layer,
        transform: mergeTransform(layer.transform, action.patch),
      }));
      return document === null ? null : accepted(document, counters);
    }
    case "set-opacity": {
      if (!isOpacityValid(action.opacity)) {
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
  doc: ProjectDocumentV1,
  counters: LayerCounters,
  item: ItemSpec,
  idFactory: IdFactory,
): MutationResult | null {
  if (doc.layers.length >= LIMITS.MAX_LAYERS) {
    return null;
  }
  if (item.kind === "solid") {
    const next: LayerCounters = { ...counters, solid: counters.solid + 1 };
    const layer: Layer = {
      id: idFactory(),
      name: `Color ${next.solid}`,
      kind: "solid",
      color: item.color,
      visible: true,
      opacity: 1,
      placement: "pattern",
      transform: solidDefaultTransform(),
    };
    return accepted({ ...doc, layers: [...doc.layers, layer] }, next);
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
  return accepted({ ...doc, layers: [...doc.layers, layer] }, next);
}

function duplicateItem(
  doc: ProjectDocumentV1,
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
  const next: LayerCounters =
    source.kind === "solid"
      ? { ...counters, solid: counters.solid + 1 }
      : { ...counters, raster: counters.raster + 1 };
  const name = source.kind === "solid" ? `Color ${next.solid}` : `Picture ${next.raster}`;
  const copy: Layer = {
    ...source,
    id: idFactory(),
    name,
    transform: copyTransform(source.transform),
  };
  return accepted({ ...doc, layers: [...doc.layers, copy] }, next);
}

function reorderLayer(
  doc: ProjectDocumentV1,
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
  const layers = doc.layers.slice();
  const [moved] = layers.splice(from, 1);
  if (moved === undefined) {
    return null;
  }
  const clamped = Math.min(Math.max(Math.trunc(toIndex), 0), layers.length);
  layers.splice(clamped, 0, moved);
  return accepted({ ...doc, layers }, counters);
}

function accepted(document: ProjectDocumentV1, counters: LayerCounters): MutationResult {
  return { document, counters };
}

function pushHistory(
  stack: ProjectDocumentV1[],
  snapshot: ProjectDocumentV1,
): ProjectDocumentV1[] {
  const next = [...stack, snapshot];
  return next.length > LIMITS.MAX_HISTORY ? next.slice(next.length - LIMITS.MAX_HISTORY) : next;
}

function layerIndex(doc: ProjectDocumentV1, id: string): number {
  return doc.layers.findIndex((layer) => layer.id === id);
}

function replaceLayer(doc: ProjectDocumentV1, index: number, layer: Layer): ProjectDocumentV1 {
  const layers = doc.layers.slice();
  layers[index] = layer;
  return { ...doc, layers };
}

function updateLayer(
  doc: ProjectDocumentV1,
  id: string,
  update: (layer: Layer) => Layer,
): ProjectDocumentV1 | null {
  const index = layerIndex(doc, id);
  const layer = index < 0 ? undefined : doc.layers[index];
  if (layer === undefined) {
    return null;
  }
  return replaceLayer(doc, index, update(layer));
}

function solidDefaultTransform(): Transform {
  return {
    positionX: 0,
    positionY: 0,
    rotationDeg: 0,
    scaleX: 1,
    scaleY: 1,
    crop: { x: 0, y: 0, width: 1, height: 1 },
  };
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
