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
