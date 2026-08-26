import {
  CanvasTexture,
  ClampToEdgeWrapping,
  Color,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import type { GarmentType } from "../domain/types";
import { buildPreviewRig } from "./rig";

export interface PreviewOptions {
  garment: GarmentType;
  onContextLost?: () => void;
}

export interface PreviewHandle {
  updateCanvas(canvas: HTMLCanvasElement): void;
  resetView(): void;
  dispose(): void;
}

const DEGREES_TO_RADIANS = Math.PI / 180;
const DEFAULT_AZIMUTH = 30;
const DEFAULT_ELEVATION = 12;
const DEFAULT_DISTANCE = 8;
const MIN_ELEVATION = -85;
const MAX_ELEVATION = 85;
const MIN_DISTANCE = 4;
const MAX_DISTANCE = 16;
const DEGREES_PER_PIXEL = 0.5;
const TARGET = new Vector3(0, -0.5, 0);
const BASE_COLOR = 0xd9d9d9;
const BACKGROUND_COLOR = 0xe6e9ef;

interface PointerPoint {
  x: number;
  y: number;
}

export function createPreview(container: HTMLElement, options: PreviewOptions): PreviewHandle | null {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false });
  } catch {
    return null;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const domElement = renderer.domElement;
  domElement.style.touchAction = "none";
  container.appendChild(domElement);

  const scene = new Scene();
  scene.background = new Color(BACKGROUND_COLOR);
  const camera = new PerspectiveCamera(40, 1, 0.1, 100);
  const rig = buildPreviewRig(options.garment);

  const baseMaterial = new MeshBasicMaterial({ color: BASE_COLOR });
  const clothingMaterial = new MeshBasicMaterial({
    transparent: true,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });

  const clothingMeshes: Mesh[] = [];
  for (const part of rig.baseParts) {
    scene.add(new Mesh(part.geometry, baseMaterial));
  }
  for (const part of rig.clothingParts) {
    const mesh = new Mesh(part.geometry, clothingMaterial);
    mesh.visible = false;
    clothingMeshes.push(mesh);
    scene.add(mesh);
  }
  if (rig.decal !== undefined) {
    const mesh = new Mesh(rig.decal.geometry, clothingMaterial);
    mesh.visible = false;
    clothingMeshes.push(mesh);
    scene.add(mesh);
  }

  let texture: CanvasTexture | null = null;
  let azimuth = DEFAULT_AZIMUTH;
  let elevation = DEFAULT_ELEVATION;
  let distance = DEFAULT_DISTANCE;
  let dirty = false;
  let pendingFrame = 0;
  let disposed = false;
  let contextLost = false;

  const onFrame = (): void => {
    pendingFrame = 0;
    if (disposed || contextLost || !dirty) {
      return;
    }
    dirty = false;
    renderer.render(scene, camera);
  };

  const cancelFrame = (): void => {
    if (pendingFrame !== 0) {
      cancelAnimationFrame(pendingFrame);
      pendingFrame = 0;
    }
  };

  const scheduleRender = (): void => {
    dirty = true;
    if (pendingFrame === 0 && !disposed && !contextLost) {
      pendingFrame = requestAnimationFrame(onFrame);
    }
  };

  const applyOrbit = (): void => {
    const azimuthRadians = azimuth * DEGREES_TO_RADIANS;
    const elevationRadians = elevation * DEGREES_TO_RADIANS;
    const cosElevation = Math.cos(elevationRadians);
    camera.position.set(
      TARGET.x + distance * Math.sin(azimuthRadians) * cosElevation,
      TARGET.y + distance * Math.sin(elevationRadians),
      TARGET.z - distance * Math.cos(azimuthRadians) * cosElevation,
    );
    camera.lookAt(TARGET);
    scheduleRender();
  };

  const resize = (): void => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width === 0 || height === 0) {
      return;
    }
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    scheduleRender();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  const pointers = new Map<number, PointerPoint>();
  let pinchStartDistance = 0;
  let pinchStartCameraDistance = DEFAULT_DISTANCE;

  const twoPointerDistance = (): number => {
    const active = Array.from(pointers.values());
    const first = active[0];
    const second = active[1];
    if (first === undefined || second === undefined) {
      return 0;
    }
    return Math.hypot(first.x - second.x, first.y - second.y);
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (pointers.size >= 2) {
      return;
    }
    try {
      domElement.setPointerCapture(event.pointerId);
    } catch {
    }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      pinchStartDistance = twoPointerDistance();
      pinchStartCameraDistance = distance;
    }
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!pointers.has(event.pointerId)) {
      return;
    }
    if (pointers.size === 2) {
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const current = twoPointerDistance();
      if (pinchStartDistance > 0 && current > 0) {
        distance = Math.min(
          MAX_DISTANCE,
          Math.max(MIN_DISTANCE, pinchStartCameraDistance * (pinchStartDistance / current)),
        );
        applyOrbit();
      }
      return;
    }
    const previous = pointers.get(event.pointerId);
    if (previous === undefined) {
      return;
    }
    azimuth += (event.clientX - previous.x) * DEGREES_PER_PIXEL;
    elevation += (event.clientY - previous.y) * DEGREES_PER_PIXEL;
    elevation = Math.min(MAX_ELEVATION, Math.max(MIN_ELEVATION, elevation));
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    applyOrbit();
  };

  const onPointerEnd = (event: PointerEvent): void => {
    pointers.delete(event.pointerId);
  };

  const onContextLost = (event: Event): void => {
    event.preventDefault();
    contextLost = true;
    cancelFrame();
    if (options.onContextLost !== undefined) {
      options.onContextLost();
    }
  };

  const onVisibilityChange = (): void => {
    if (document.hidden) {
      cancelFrame();
    } else {
      scheduleRender();
    }
  };

  domElement.addEventListener("pointerdown", onPointerDown);
  domElement.addEventListener("pointermove", onPointerMove);
  domElement.addEventListener("pointerup", onPointerEnd);
  domElement.addEventListener("pointercancel", onPointerEnd);
  domElement.addEventListener("webglcontextlost", onContextLost);
  document.addEventListener("visibilitychange", onVisibilityChange);

  applyOrbit();

  return {
    updateCanvas(source: HTMLCanvasElement): void {
      if (disposed || contextLost) {
        return;
      }
      const next = new CanvasTexture(source);
      next.flipY = true;
      next.colorSpace = SRGBColorSpace;
      next.wrapS = ClampToEdgeWrapping;
      next.wrapT = ClampToEdgeWrapping;
      next.minFilter = LinearFilter;
      next.magFilter = LinearFilter;
      next.generateMipmaps = false;
      if (texture !== null) {
        texture.dispose();
      }
      texture = next;
      clothingMaterial.map = next;
      clothingMaterial.needsUpdate = true;
      for (const mesh of clothingMeshes) {
        mesh.visible = true;
      }
      scheduleRender();
    },
    resetView(): void {
      if (disposed) {
        return;
      }
      azimuth = DEFAULT_AZIMUTH;
      elevation = DEFAULT_ELEVATION;
      distance = DEFAULT_DISTANCE;
      applyOrbit();
    },
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      cancelFrame();
      observer.disconnect();
      domElement.removeEventListener("pointerdown", onPointerDown);
      domElement.removeEventListener("pointermove", onPointerMove);
      domElement.removeEventListener("pointerup", onPointerEnd);
      domElement.removeEventListener("pointercancel", onPointerEnd);
      domElement.removeEventListener("webglcontextlost", onContextLost);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      pointers.clear();
      if (texture !== null) {
        texture.dispose();
        texture = null;
      }
      clothingMaterial.dispose();
      baseMaterial.dispose();
      for (const part of rig.baseParts) {
        part.geometry.dispose();
      }
      for (const part of rig.clothingParts) {
        part.geometry.dispose();
      }
      if (rig.decal !== undefined) {
        rig.decal.geometry.dispose();
      }
      renderer.forceContextLoss();
      renderer.dispose();
      domElement.remove();
    },
  };
}
