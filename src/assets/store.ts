export interface NormalizedPngAsset {
  id: string;
  bytes: Uint8Array<ArrayBuffer>;
  width: number;
  height: number;
  drawable: ImageBitmap | HTMLCanvasElement;
}

export class AssetStore {
  private readonly assets = new Map<string, NormalizedPngAsset>();

  constructor(assets: readonly NormalizedPngAsset[] = []) {
    for (const asset of assets) {
      this.add(asset);
    }
  }

  add(asset: NormalizedPngAsset): void {
    this.assets.set(asset.id, asset);
  }

  get(id: string): NormalizedPngAsset | undefined {
    return this.assets.get(id);
  }

  has(id: string): boolean {
    return this.assets.has(id);
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
