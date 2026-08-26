import { pngAssetFromBytes } from "../assets/store";
import type { AssetStore } from "../assets/store";
import { sha256Hex } from "../assets/hash";
import { LIMITS } from "../domain/types";
import type { AssetManifestEntry, PlacementMode } from "../domain/types";

export const IMPORT_TOO_LARGE_MESSAGE = "That picture is too big—please choose a smaller one.";
export const IMPORT_UNSUPPORTED_MESSAGE = "That file type doesn't work—please pick a PNG, JPG, or WebP picture.";
export const IMPORT_TOO_MANY_PIXELS_MESSAGE = "There isn't enough space for that picture in this project.";
export const IMPORT_DECODE_FAILED_MESSAGE = "That picture couldn't be opened—please try a different one.";

export type ImportFailureKind = "too-large" | "unsupported" | "too-many-pixels" | "decode-failed";

export type ImportRoute = "new-project-tshirt" | "shirt-or-pants-question" | "add-item";

export type ImportOutcome =
  | {
      ok: true;
      asset: AssetManifestEntry;
      route: ImportRoute;
      placement: PlacementMode;
      megapixels: number;
    }
  | { ok: false; kind: ImportFailureKind; message: string };

export interface ImportContext {
  assets: AssetStore;
  importedMegapixels: number;
}

type SupportedMime = "image/png" | "image/jpeg" | "image/webp";

const PNG_SIGNATURE: readonly number[] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE: readonly number[] = [0xff, 0xd8, 0xff];
const RIFF_SIGNATURE: readonly number[] = [0x52, 0x49, 0x46, 0x46];
const WEBP_SIGNATURE: readonly number[] = [0x57, 0x45, 0x42, 0x50];

interface DecodedSource {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

function failure(kind: ImportFailureKind, message: string): ImportOutcome {
  return { ok: false, kind, message };
}

function isSupportedMime(mime: string): mime is SupportedMime {
  return mime === "image/png" || mime === "image/jpeg" || mime === "image/webp";
}

function matchesSignature(head: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((byte, index) => head[index] === byte);
}

function magicMatches(mime: SupportedMime, head: Uint8Array): boolean {
  if (mime === "image/png") {
    return matchesSignature(head, PNG_SIGNATURE);
  }
  if (mime === "image/jpeg") {
    return matchesSignature(head, JPEG_SIGNATURE);
  }
  return matchesSignature(head, RIFF_SIGNATURE) && matchesSignature(head.subarray(8, 12), WEBP_SIGNATURE);
}

async function decodeOriented(file: File): Promise<DecodedSource | null> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      release: () => bitmap.close(),
    };
  } catch {
    return decodeViaImg(file);
  }
}

async function decodeViaImg(file: File): Promise<DecodedSource | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}

function routeFor(width: number, height: number): { route: ImportRoute; placement: PlacementMode } {
  if (width === 512 && height === 512) {
    return { route: "new-project-tshirt", placement: "full-map" };
  }
  if (width === 585 && height === 559) {
    return { route: "shirt-or-pants-question", placement: "full-map" };
  }
  return { route: "add-item", placement: "decal" };
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}

export async function importImage(file: File, ctx: ImportContext): Promise<ImportOutcome> {
  if (file.size > LIMITS.IMPORT_MAX_BYTES) {
    return failure("too-large", IMPORT_TOO_LARGE_MESSAGE);
  }
  if (!isSupportedMime(file.type)) {
    return failure("unsupported", IMPORT_UNSUPPORTED_MESSAGE);
  }
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (!magicMatches(file.type, head)) {
    return failure("unsupported", IMPORT_UNSUPPORTED_MESSAGE);
  }
  const decoded = await decodeOriented(file);
  if (decoded === null) {
    return failure("decode-failed", IMPORT_DECODE_FAILED_MESSAGE);
  }
  try {
    if (decoded.width > LIMITS.IMPORT_MAX_DIM || decoded.height > LIMITS.IMPORT_MAX_DIM) {
      return failure("too-large", IMPORT_TOO_LARGE_MESSAGE);
    }
    const megapixels = (decoded.width * decoded.height) / 1_000_000;
    if (ctx.importedMegapixels + megapixels > LIMITS.IMPORT_MAX_MEGAPIXELS + 1e-6) {
      return failure("too-many-pixels", IMPORT_TOO_MANY_PIXELS_MESSAGE);
    }
    const canvas = document.createElement("canvas");
    canvas.width = decoded.width;
    canvas.height = decoded.height;
    const renderCtx = canvas.getContext("2d");
    if (renderCtx === null) {
      return failure("decode-failed", IMPORT_DECODE_FAILED_MESSAGE);
    }
    renderCtx.drawImage(decoded.source, 0, 0);
    const blob = await canvasToPngBlob(canvas);
    if (blob === null) {
      return failure("decode-failed", IMPORT_DECODE_FAILED_MESSAGE);
    }
    let bytes: Uint8Array<ArrayBuffer>;
    let id: string;
    let sha256: string;
    let asset: Awaited<ReturnType<typeof pngAssetFromBytes>>;
    try {
      bytes = new Uint8Array(await blob.arrayBuffer());
      id = crypto.randomUUID();
      sha256 = await sha256Hex(bytes);
      asset = await pngAssetFromBytes(bytes, id);
    } catch {
      return failure("decode-failed", IMPORT_DECODE_FAILED_MESSAGE);
    }
    ctx.assets.add(asset);
    const { route, placement } = routeFor(decoded.width, decoded.height);
    return {
      ok: true,
      asset: {
        id,
        path: `assets/${id}.png`,
        originalName: file.name,
        sourceMimeType: file.type,
        byteLength: bytes.length,
        width: decoded.width,
        height: decoded.height,
        sha256,
        source: "imported",
      },
      route,
      placement,
      megapixels,
    };
  } finally {
    decoded.release();
  }
}
