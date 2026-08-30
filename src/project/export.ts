import type { AssetStore } from "../assets/store";
import { composeProject } from "../compositor/compose";
import { getTemplate } from "../domain/registry";
import type { ProjectDocument } from "../domain/types";

export const EXPORT_DISCLAIMER =
  "Roblox moderation and avatar compatibility aren't controlled by this app—test your image in Roblox Studio before uploading.";

export const TRANSPARENT_WARNING =
  "Your clothing is completely see-through. Add a picture or color before downloading.";

export type ExportResult = {
  blob: Blob;
  warning: null | "fully-transparent";
};

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob === null) {
        reject(new Error("PNG encoding failed"));
      } else {
        resolve(blob);
      }
    }, "image/png");
  });
}

function scanAlpha(bitmap: ImageBitmap): { nonempty: boolean; alphaInRange: boolean } {
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (ctx === null) {
    throw new Error("2d canvas context unavailable");
  }
  ctx.drawImage(bitmap, 0, 0);
  const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
  let nonempty = false;
  let alphaInRange = true;
  for (let index = 3; index < data.length; index += 4) {
    const alpha = data[index] ?? 0;
    if (alpha > 0) {
      nonempty = true;
    }
    if (alpha < 0 || alpha > 255) {
      alphaInRange = false;
    }
  }
  return { nonempty, alphaInRange };
}

export async function exportRobloxPng(
  document: ProjectDocument,
  assets: AssetStore,
): Promise<ExportResult> {
  const { canvas } = composeProject({ document, assets });
  const blob = await canvasToPngBlob(canvas);
  if (blob.type !== "image/png") {
    throw new Error("compositor produced a non-PNG blob");
  }
  const template = getTemplate(document.garmentType);
  const bitmap = await createImageBitmap(blob);
  try {
    if (bitmap.width !== template.width || bitmap.height !== template.height) {
      throw new Error("exported PNG dimensions do not match the canonical canvas");
    }
    const scan = scanAlpha(bitmap);
    if (!scan.alphaInRange) {
      throw new Error("exported PNG has an out-of-range alpha value");
    }
    return { blob, warning: scan.nonempty ? null : "fully-transparent" };
  } finally {
    bitmap.close();
  }
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
