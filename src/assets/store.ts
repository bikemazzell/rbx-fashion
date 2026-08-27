export interface NormalizedPngAsset {
  id: string;
  bytes: Uint8Array<ArrayBuffer>;
  width: number;
  height: number;
  drawable: ImageBitmap | HTMLCanvasElement;
}

function releaseDrawable(asset: NormalizedPngAsset): void {
  if (typeof (asset.drawable as ImageBitmap).close === "function") {
    (asset.drawable as ImageBitmap).close();
  }
}

export class AssetStore {
  private readonly assets = new Map<string, NormalizedPngAsset>();

  constructor(assets: readonly NormalizedPngAsset[] = []) {
    for (const asset of assets) {
      this.add(asset);
    }
  }

  add(asset: NormalizedPngAsset): void {
    const existing = this.assets.get(asset.id);
    if (existing !== undefined && existing !== asset) {
      releaseDrawable(existing);
    }
    this.assets.set(asset.id, asset);
  }

  get(id: string): NormalizedPngAsset | undefined {
    return this.assets.get(id);
  }

  has(id: string): boolean {
    return this.assets.has(id);
  }

  remove(id: string): boolean {
    const asset = this.assets.get(id);
    if (asset === undefined) {
      return false;
    }
    this.assets.delete(id);
    releaseDrawable(asset);
    return true;
  }

  retainOnly(ids: Iterable<string>): void {
    const keep = new Set(ids);
    for (const [id, asset] of this.assets) {
      if (!keep.has(id)) {
        this.assets.delete(id);
        releaseDrawable(asset);
      }
    }
  }

  get size(): number {
    return this.assets.size;
  }
}

export async function pngAssetFromBytes(bytes: Uint8Array<ArrayBuffer>, id: string): Promise<NormalizedPngAsset> {
  const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
  return { id, bytes, width: bitmap.width, height: bitmap.height, drawable: bitmap };
}

export async function pngAssetFromCanvas(canvas: HTMLCanvasElement, id: string): Promise<NormalizedPngAsset> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result === null) {
        reject(new Error("PNG encoding failed"));
      } else {
        resolve(result);
      }
    }, "image/png");
  });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return pngAssetFromBytes(bytes, id);
}
