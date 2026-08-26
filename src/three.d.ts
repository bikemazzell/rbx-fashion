declare module "three" {
  export type ColorSpace = string;

  export const SRGBColorSpace: ColorSpace;
  export const ClampToEdgeWrapping: number;
  export const LinearFilter: number;

  export class Vector3 {
    x: number;
    y: number;
    z: number;
    constructor(x?: number, y?: number, z?: number);
    set(x: number, y: number, z: number): Vector3;
    clone(): Vector3;
    project(camera: PerspectiveCamera): Vector3;
  }

  export class Color {
    constructor(color?: number | string);
  }

  export class BufferAttribute {
    needsUpdate: boolean;
    getX(index: number): number;
    getY(index: number): number;
    getZ(index: number): number;
    setXY(index: number, x: number, y: number): void;
  }

  export class BufferGeometry {
    getAttribute(name: string): BufferAttribute;
    getIndex(): { getX(index: number): number; count: number } | null;
    translate(x: number, y: number, z: number): BufferGeometry;
    rotateY(angle: number): BufferGeometry;
    dispose(): void;
  }

  export class BoxGeometry extends BufferGeometry {
    constructor(
      width?: number,
      height?: number,
      depth?: number,
      widthSegments?: number,
      heightSegments?: number,
      depthSegments?: number,
    );
    parameters: {
      width: number;
      height: number;
      depth: number;
      widthSegments: number;
      heightSegments: number;
      depthSegments: number;
    };
  }

  export class PlaneGeometry extends BufferGeometry {
    constructor(width?: number, height?: number, widthSegments?: number, heightSegments?: number);
  }

  export class PerspectiveCamera {
    fov: number;
    aspect: number;
    near: number;
    far: number;
    position: Vector3;
    constructor(fov?: number, aspect?: number, near?: number, far?: number);
    lookAt(target: Vector3): void;
    updateProjectionMatrix(): void;
    updateMatrixWorld(force?: boolean): void;
  }

  export class Scene {
    background: Color | number | string | null;
    add(object: Mesh): void;
  }

  export class Texture {
    needsUpdate: boolean;
    dispose(): void;
  }

  export class CanvasTexture extends Texture {
    flipY: boolean;
    colorSpace: ColorSpace;
    wrapS: number;
    wrapT: number;
    minFilter: number;
    magFilter: number;
    generateMipmaps: boolean;
    constructor(canvas?: HTMLCanvasElement);
  }

  export class Material {
    needsUpdate: boolean;
    dispose(): void;
  }

  export interface MeshBasicMaterialParameters {
    color?: number | Color;
    map?: Texture | null;
    transparent?: boolean;
    polygonOffset?: boolean;
    polygonOffsetFactor?: number;
    polygonOffsetUnits?: number;
  }

  export class MeshBasicMaterial extends Material {
    color: Color;
    map: Texture | null;
    constructor(parameters?: MeshBasicMaterialParameters);
  }

  export class Mesh {
    geometry: BufferGeometry;
    material: Material | Material[];
    visible: boolean;
    constructor(geometry?: BufferGeometry, material?: Material | Material[]);
  }

  export interface WebGLRendererParameters {
    antialias?: boolean;
    preserveDrawingBuffer?: boolean;
    alpha?: boolean;
  }

  export class WebGLRenderer {
    domElement: HTMLCanvasElement;
    constructor(parameters?: WebGLRendererParameters);
    setPixelRatio(value: number): void;
    setSize(width: number, height: number, updateStyle?: boolean): void;
    render(scene: Scene, camera: PerspectiveCamera): void;
    forceContextLoss(): void;
    dispose(): void;
  }
}
