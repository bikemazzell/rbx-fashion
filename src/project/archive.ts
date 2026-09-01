import { Unzip, UnzipInflate, zipSync } from "fflate";
import type { ZipOptions } from "fflate";
import { pngAssetFromBytes } from "../assets/store";
import type { NormalizedPngAsset } from "../assets/store";
import { sha256Hex } from "../assets/hash";
import { LIMITS } from "../domain/types";
import type { ProjectDocument, ProjectDocumentV1, ProjectDocumentV2 } from "../domain/types";
import {
  isValidProjectDocument,
  isValidProjectDocumentV1,
  isValidProjectDocumentV2,
  migrateProjectDocumentV1,
  migrateProjectDocumentV2,
} from "../editor/state";
import {
  OPEN_INVALID_MESSAGE,
  OPEN_TOO_BIG_MESSAGE,
  SAVE_INVALID_MESSAGE,
  SAVE_TOO_BIG_MESSAGE,
} from "../editor/ui/text";

export interface ZipLimits {
  compressed: number;
  expanded: number;
  entries: number;
}

export const ZIP_LIMIT_DEFAULTS: Readonly<ZipLimits> = Object.freeze({
  compressed: LIMITS.ZIP_MAX_COMPRESSED,
  expanded: LIMITS.ZIP_MAX_EXPANDED,
  entries: LIMITS.ZIP_MAX_ENTRIES,
});

export type SaveResult =
  | { ok: true; blob: Blob }
  | { ok: false; kind: "too-large" | "invalid"; message: string };

export type OpenFailureKind = "too-large" | "invalid";

export type OpenResult =
  | { ok: true; document: ProjectDocument; assets: NormalizedPngAsset[] }
  | { ok: false; kind: OpenFailureKind; message: string };

const FIXED_MTIME = 315532800000;
const READ_CHUNK = 64 * 1024;
const PNG_SIGNATURE: readonly number[] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const GARMENT_TYPES: ReadonlySet<string> = new Set(["tshirt", "shirt", "pants"]);
const PROJECT_JSON = "project.json";
const ASSET_PREFIX = "assets/";
const ASSET_SUFFIX = ".png";

export function isAllowedEntryPath(name: string): boolean {
  if (
    name.length === 0 ||
    name.startsWith("/") ||
    name.includes("\\") ||
    /^[A-Za-z]:/.test(name)
  ) {
    return false;
  }
  const segments = name.split("/");
  if (segments.includes("..") || segments.includes("")) {
    return false;
  }
  if (name === PROJECT_JSON) {
    return true;
  }
  if (segments.length !== 2 || segments[0] !== "assets") {
    return false;
  }
  const stem = segments[1] ?? "";
  return stem.length > ASSET_SUFFIX.length && stem.endsWith(ASSET_SUFFIX);
}

function resolveLimits(overrides: Partial<ZipLimits> | undefined): ZipLimits {
  return { ...ZIP_LIMIT_DEFAULTS, ...overrides };
}

function invalidFailure(): OpenResult {
  return { ok: false, kind: "invalid", message: OPEN_INVALID_MESSAGE };
}

function concatChunks(chunks: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function hasPngSignature(bytes: Uint8Array): boolean {
  return bytes.length >= 8 && PNG_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

function ihdrDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(8, false) !== 13) {
    return null;
  }
  if (bytes[12] !== 0x49 || bytes[13] !== 0x48 || bytes[14] !== 0x44 || bytes[15] !== 0x52) {
    return null;
  }
  return { width: view.getUint32(16, false), height: view.getUint32(20, false) };
}

export async function saveProject(
  document: ProjectDocument,
  getAssetBytes: (id: string) => Uint8Array,
  overrides: Partial<ZipLimits> = {},
): Promise<SaveResult> {
  if (!isValidProjectDocument(document)) {
    return { ok: false, kind: "invalid", message: SAVE_INVALID_MESSAGE };
  }
  const limits = resolveLimits(overrides);
  const jsonBytes = new TextEncoder().encode(JSON.stringify(document));
  const entries: Record<string, [Uint8Array, ZipOptions]> = {
    [PROJECT_JSON]: [jsonBytes, { level: 6, mtime: FIXED_MTIME }],
  };
  let expanded = jsonBytes.length;
  for (const asset of document.assets) {
    const bytes = getAssetBytes(asset.id);
    expanded += bytes.length;
    entries[`${ASSET_PREFIX}${asset.id}${ASSET_SUFFIX}`] = [bytes, { level: 0, mtime: FIXED_MTIME }];
  }
  if (expanded > limits.expanded) {
    return { ok: false, kind: "too-large", message: SAVE_TOO_BIG_MESSAGE };
  }
  const zipped = zipSync(entries, { level: 6, mtime: FIXED_MTIME });
  if (zipped.byteLength > limits.compressed) {
    return { ok: false, kind: "too-large", message: SAVE_TOO_BIG_MESSAGE };
  }
  return { ok: true, blob: new Blob([zipped], { type: "application/zip" }) };
}

export async function openProject(
  file: File,
  overrides: Partial<ZipLimits> = {},
): Promise<OpenResult> {
  const limits = resolveLimits(overrides);
  if (file.size > limits.compressed) {
    return { ok: false, kind: "too-large", message: OPEN_TOO_BIG_MESSAGE };
  }
  const collected = new Map<string, Uint8Array[]>();
  const seen = new Set<string>();
  let totalDecoded = 0;
  let entryCount = 0;
  let oversized = false;
  let structural = false;

  const unzip = new Unzip();
  unzip.onfile = (entry) => {
    entryCount += 1;
    if (entryCount > limits.entries) {
      structural = true;
      return;
    }
    const name = entry.name;
    if (!isAllowedEntryPath(name) || seen.has(name)) {
      structural = true;
      return;
    }
    seen.add(name);
    collected.set(name, []);
    if (entry.originalSize !== undefined && totalDecoded + entry.originalSize > limits.expanded) {
      oversized = true;
      return;
    }
    entry.ondata = (err, chunk) => {
      if (err !== null) {
        structural = true;
        return;
      }
      if (oversized || structural) {
        return;
      }
      totalDecoded += chunk.length;
      if (totalDecoded > limits.expanded) {
        oversized = true;
        return;
      }
      collected.get(name)?.push(chunk);
    };
    entry.start();
  };
  unzip.register(UnzipInflate);

  try {
    for (let offset = 0; offset < file.size; offset += READ_CHUNK) {
      if (structural || oversized) {
        break;
      }
      const end = Math.min(offset + READ_CHUNK, file.size);
      const buffer = await file.slice(offset, end).arrayBuffer();
      unzip.push(new Uint8Array(buffer), end === file.size);
    }
  } catch {
    return invalidFailure();
  }
  if (oversized) {
    return { ok: false, kind: "too-large", message: OPEN_TOO_BIG_MESSAGE };
  }
  if (structural) {
    return invalidFailure();
  }

  const jsonChunks = collected.get(PROJECT_JSON);
  if (jsonChunks === undefined) {
    return invalidFailure();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(concatChunks(jsonChunks)));
  } catch {
    return invalidFailure();
  }
  if (typeof parsed !== "object" || parsed === null) {
    return invalidFailure();
  }
  const record = parsed as Record<string, unknown>;
  if (
    record.format !== "rbx-fashion-project" ||
    typeof record.garmentType !== "string" ||
    !GARMENT_TYPES.has(record.garmentType) ||
    !Array.isArray(record.layers) ||
    record.layers.length > LIMITS.MAX_LAYERS
  ) {
    return invalidFailure();
  }
  let document: ProjectDocument;
  if (record.schemaVersion === 1 && isValidProjectDocumentV1(parsed)) {
    document = migrateProjectDocumentV1(parsed as ProjectDocumentV1);
  } else if (record.schemaVersion === 2 && isValidProjectDocumentV2(parsed)) {
    document = migrateProjectDocumentV2(parsed as ProjectDocumentV2);
  } else if (record.schemaVersion === 3 && isValidProjectDocument(parsed)) {
    document = parsed as ProjectDocument;
  } else {
    return invalidFailure();
  }

  const manifestIds = new Set<string>();
  for (const asset of document.assets) {
    if (!collected.has(`${ASSET_PREFIX}${asset.id}${ASSET_SUFFIX}`)) {
      return invalidFailure();
    }
    manifestIds.add(asset.id);
  }
  for (const name of collected.keys()) {
    if (name === PROJECT_JSON) {
      continue;
    }
    const id = name.slice(ASSET_PREFIX.length, name.length - ASSET_SUFFIX.length);
    if (!manifestIds.has(id)) {
      return invalidFailure();
    }
  }
  for (const layer of document.layers) {
    if (layer.kind === "raster" && (layer.assetId === undefined || !manifestIds.has(layer.assetId))) {
      return invalidFailure();
    }
  }

  const bytesById = new Map<string, Uint8Array<ArrayBuffer>>();
  let megapixels = 0;
  for (const asset of document.assets) {
    const bytes = concatChunks(collected.get(`${ASSET_PREFIX}${asset.id}${ASSET_SUFFIX}`) ?? []);
    bytesById.set(asset.id, bytes);
    if (!hasPngSignature(bytes)) {
      return invalidFailure();
    }
    const dims = ihdrDimensions(bytes);
    if (dims === null || dims.width !== asset.width || dims.height !== asset.height) {
      return invalidFailure();
    }
    if (asset.byteLength !== bytes.length) {
      return invalidFailure();
    }
    const sha256 = await sha256Hex(bytes);
    if (sha256 !== asset.sha256) {
      return invalidFailure();
    }
    megapixels += (asset.width * asset.height) / 1_000_000;
  }
  if (megapixels > LIMITS.IMPORT_MAX_MEGAPIXELS + 1e-6) {
    return invalidFailure();
  }

  const assets: NormalizedPngAsset[] = [];
  for (const asset of document.assets) {
    try {
      assets.push(await pngAssetFromBytes(bytesById.get(asset.id) ?? new Uint8Array(0), asset.id));
    } catch {
      return invalidFailure();
    }
  }
  return { ok: true, document, assets };
}
