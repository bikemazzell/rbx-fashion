import { expect, test } from "vitest";
import * as THREE from "three";
import { getTemplate } from "../../../src/domain/registry";
import type { GarmentType } from "../../../src/domain/types";
import { createPreview, type PreviewHandle } from "../../../src/preview/preview";

const CONTAINER_WIDTH = 640;
const CONTAINER_HEIGHT = 480;
const DEFAULT_AZIMUTH = 30;
const DEFAULT_ELEVATION = 12;
const DEFAULT_DISTANCE = 8;
const DEGREES_PER_PIXEL = 0.5;
const COLOR_TOLERANCE = 24;

const RED: readonly [number, number, number] = [255, 0, 0];
const YELLOW: readonly [number, number, number] = [255, 255, 0];
const BLUE: readonly [number, number, number] = [0, 0, 255];
const GREEN: readonly [number, number, number] = [0, 255, 0];
const BACKGROUND: readonly [number, number, number] = [230, 233, 239];

interface QuadrantColors {
  TL: readonly [number, number, number];
  TR: readonly [number, number, number];
  BL: readonly [number, number, number];
  BR: readonly [number, number, number];
}

const STANDARD_QUADRANTS: QuadrantColors = { TL: RED, TR: YELLOW, BL: BLUE, BR: GREEN };
const SWAPPED_QUADRANTS: QuadrantColors = { TL: GREEN, TR: BLUE, BL: YELLOW, BR: RED };

function engineName(): string {
  const userAgent = navigator.userAgent;
  if (userAgent.includes("Firefox")) {
    return "firefox";
  }
  if (userAgent.includes("Chrome")) {
    return "chromium";
  }
  return "webkit";
}

function requireWebGL(): void {
  const probe = document.createElement("canvas");
  const context =
    probe.getContext("webgl2") ?? probe.getContext("webgl") ?? probe.getContext("experimental-webgl");
  if (context === null) {
    throw new Error(
      `${engineName()} cannot create a WebGL context; the R6 preview smoke tests require WebGL`,
    );
  }
}

interface Readback {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

interface Harness {
  container: HTMLDivElement;
  handle: PreviewHandle;
  canvas: HTMLCanvasElement;
  dispose(): void;
}

async function settle(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

function setup(garment: GarmentType): Harness {
  requireWebGL();
  const container = document.createElement("div");
  container.style.cssText = `position:fixed;top:0;left:0;width:${CONTAINER_WIDTH}px;height:${CONTAINER_HEIGHT}px;background:#ffffff;z-index:-1;`;
  document.body.appendChild(container);
  const handle = createPreview(container, { garment });
  if (handle === null) {
    container.remove();
    throw new Error(`${engineName()}: createPreview returned null despite WebGL being available`);
  }
  const canvas = container.querySelector("canvas");
  if (canvas === null) {
    handle.dispose();
    container.remove();
    throw new Error("preview created no canvas");
  }
  return {
    container,
    handle,
    canvas,
    dispose: () => {
      handle.dispose();
      container.remove();
    },
  };
}

function readPixels(canvas: HTMLCanvasElement): Readback {
  const readCanvas = document.createElement("canvas");
  readCanvas.width = canvas.width;
  readCanvas.height = canvas.height;
  const context = readCanvas.getContext("2d", { willReadFrequently: true });
  if (context === null) {
    throw new Error("2d readback context unavailable");
  }
  context.drawImage(canvas, 0, 0);
  const image = context.getImageData(0, 0, readCanvas.width, readCanvas.height);
  return { data: image.data, width: readCanvas.width, height: readCanvas.height };
}

function sampleAt(read: Readback, x: number, y: number): readonly [number, number, number] {
  const px = Math.min(read.width - 1, Math.max(0, Math.round(x)));
  const py = Math.min(read.height - 1, Math.max(0, Math.round(y)));
  const base = (py * read.width + px) * 4;
  return [read.data[base] ?? 0, read.data[base + 1] ?? 0, read.data[base + 2] ?? 0];
}

function redPanelWidth(canvas: HTMLCanvasElement): number {
  const read = readPixels(canvas);
  let minX = read.width;
  let maxX = 0;
  for (let y = 0; y < read.height; y += 2) {
    for (let x = 0; x < read.width; x += 2) {
      const color = sampleAt(read, x, y);
      if (
        Math.abs((color[0] ?? 0) - 255) <= COLOR_TOLERANCE &&
        (color[1] ?? 0) <= COLOR_TOLERANCE &&
        (color[2] ?? 0) <= COLOR_TOLERANCE
      ) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
      }
    }
  }
  if (minX > maxX) {
    throw new Error("no red pixels found");
  }
  return maxX - minX;
}

function expectColorNear(
  actual: readonly [number, number, number],
  expected: readonly [number, number, number],
  label: string,
): void {
  for (const channel of [0, 1, 2]) {
    const delta = Math.abs((actual[channel] ?? 0) - (expected[channel] ?? 0));
    expect(delta, `${label} channel ${channel}: got ${actual.join(",")} expected ${expected.join(",")}`).toBeLessThanOrEqual(
      COLOR_TOLERANCE,
    );
  }
}

function makeCamera(azimuthDeg: number, elevationDeg: number, distance: number): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(40, CONTAINER_WIDTH / CONTAINER_HEIGHT, 0.1, 100);
  const target = new THREE.Vector3(0, -0.5, 0);
  const azimuth = (azimuthDeg * Math.PI) / 180;
  const elevation = (elevationDeg * Math.PI) / 180;
  const cosElevation = Math.cos(elevation);
  camera.position.set(
    target.x + distance * Math.sin(azimuth) * cosElevation,
    target.y + distance * Math.sin(elevation),
    target.z - distance * Math.cos(azimuth) * cosElevation,
  );
  camera.lookAt(target);
  camera.updateMatrixWorld();
  return camera;
}

function projectPoint(camera: THREE.PerspectiveCamera, read: Readback, world: THREE.Vector3): { x: number; y: number } {
  const projected = world.clone().project(camera);
  return { x: ((projected.x + 1) / 2) * read.width, y: ((1 - projected.y) / 2) * read.height };
}

function paintQuadrants(
  context: CanvasRenderingContext2D,
  rect: { x: number; y: number; width: number; height: number },
  colors: QuadrantColors,
  border: number,
): void {
  context.fillStyle = "#000000";
  context.fillRect(rect.x, rect.y, rect.width, rect.height);
  const x = rect.x + border;
  const y = rect.y + border;
  const width = rect.width - border * 2;
  const height = rect.height - border * 2;
  const fill = (color: readonly [number, number, number], fx: number, fy: number, fw: number, fh: number) => {
    context.fillStyle = `rgb(${color[0]},${color[1]},${color[2]})`;
    context.fillRect(fx, fy, fw, fh);
  };
  fill(colors.TL, x, y, width / 2, height / 2);
  fill(colors.TR, x + width / 2, y, width / 2, height / 2);
  fill(colors.BL, x, y + height / 2, width / 2, height / 2);
  fill(colors.BR, x + width / 2, y + height / 2, width / 2, height / 2);
}

function atlasFixture(colors: QuadrantColors): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 585;
  canvas.height = 559;
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("2d context unavailable");
  }
  context.fillStyle = "#000000";
  context.fillRect(0, 0, 585, 559);
  const shirt = getTemplate("shirt");
  if (shirt.garment === "tshirt") {
    throw new Error("expected shirt atlas entry");
  }
  for (const panel of shirt.panels) {
    paintQuadrants(context, panel.atlasRect, colors, 2);
  }
  return canvas;
}

function tshirtFixture(colors: QuadrantColors): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("2d context unavailable");
  }
  paintQuadrants(context, { x: 0, y: 0, width: 512, height: 512 }, colors, 0);
  return canvas;
}

function dispatchPointer(canvas: HTMLCanvasElement, type: string, pointerId: number, x: number, y: number): void {
  canvas.dispatchEvent(
    new PointerEvent(type, { pointerId, clientX: x, clientY: y, bubbles: true, cancelable: true }),
  );
}

function dragBy(canvas: HTMLCanvasElement, dx: number, dy: number): void {
  const startX = CONTAINER_WIDTH / 2;
  const startY = CONTAINER_HEIGHT / 2;
  dispatchPointer(canvas, "pointerdown", 1, startX, startY);
  const steps = 10;
  for (let step = 1; step <= steps; step += 1) {
    dispatchPointer(
      canvas,
      "pointermove",
      1,
      startX + (dx * step) / steps,
      startY + (dy * step) / steps,
    );
  }
  dispatchPointer(canvas, "pointerup", 1, startX + dx, startY + dy);
}

function dragToView(canvas: HTMLCanvasElement, azimuth: number, elevation: number): void {
  dragBy(canvas, (azimuth - DEFAULT_AZIMUTH) / DEGREES_PER_PIXEL, (elevation - DEFAULT_ELEVATION) / DEGREES_PER_PIXEL);
}

test("default 3/4 view shows the torso front panel upright and unmirrored", async () => {
  const harness = setup("shirt");
  try {
    harness.handle.updateCanvas(atlasFixture(STANDARD_QUADRANTS));
    await settle();
    const read = readPixels(harness.canvas);
    expectColorNear(sampleAt(read, 2, 2), BACKGROUND, "scene background corner");
    const camera = makeCamera(DEFAULT_AZIMUTH, DEFAULT_ELEVATION, DEFAULT_DISTANCE);
    const samples: readonly [string, THREE.Vector3, readonly [number, number, number]][] = [
      ["front TL", new THREE.Vector3(0.5, 0.5, -0.5), RED],
      ["front TR", new THREE.Vector3(-0.5, 0.5, -0.5), YELLOW],
      ["front BL", new THREE.Vector3(0.5, -0.5, -0.5), BLUE],
      ["front BR", new THREE.Vector3(-0.5, -0.5, -0.5), GREEN],
    ];
    for (const [label, world, expected] of samples) {
      const point = projectPoint(camera, read, world);
      expectColorNear(sampleAt(read, point.x, point.y), expected, label);
    }
    const topLeft = projectPoint(camera, read, new THREE.Vector3(0.5, 0.5, -0.5));
    expect(topLeft.x).toBeLessThan(read.width / 2);
    expect(topLeft.y).toBeLessThan(read.height / 2);
  } finally {
    harness.dispose();
  }
});

test("straight-on views show each bound face panel with outward winding", async () => {
  const harness = setup("shirt");
  try {
    harness.handle.updateCanvas(atlasFixture(STANDARD_QUADRANTS));
    await settle();
    const views: readonly { label: string; azimuth: number; elevation: number; sample: THREE.Vector3 }[] = [
      { label: "front", azimuth: 0, elevation: 0, sample: new THREE.Vector3(0.5, 0.5, -0.5) },
      { label: "back", azimuth: 180, elevation: 0, sample: new THREE.Vector3(-0.5, 0.5, 0.5) },
      { label: "right", azimuth: 90, elevation: 0, sample: new THREE.Vector3(2, 0.5, 0.25) },
      { label: "left", azimuth: -90, elevation: 0, sample: new THREE.Vector3(-2, 0.5, -0.25) },
      { label: "up", azimuth: 0, elevation: 85, sample: new THREE.Vector3(1.75, 1, 0.25) },
      { label: "down", azimuth: 0, elevation: -85, sample: new THREE.Vector3(1.75, -1, -0.25) },
    ];
    for (const view of views) {
      harness.handle.resetView();
      await settle();
      dragToView(harness.canvas, view.azimuth, view.elevation);
      await settle();
      const read = readPixels(harness.canvas);
      const camera = makeCamera(view.azimuth, view.elevation, DEFAULT_DISTANCE);
      const point = projectPoint(camera, read, view.sample);
      expectColorNear(sampleAt(read, point.x, point.y), RED, `${view.label} view panel top-left quadrant`);
    }
  } finally {
    harness.dispose();
  }
});

test("polygon offset keeps the clothing stable and winning over the base gray", async () => {
  const harness = setup("shirt");
  try {
    const fixture = atlasFixture(STANDARD_QUADRANTS);
    harness.handle.updateCanvas(fixture);
    await settle();
    const firstFrame = harness.canvas.toDataURL("image/png");
    harness.handle.updateCanvas(atlasFixture(STANDARD_QUADRANTS));
    await settle();
    expect(harness.canvas.toDataURL("image/png")).toBe(firstFrame);
    const read = readPixels(harness.canvas);
    const camera = makeCamera(DEFAULT_AZIMUTH, DEFAULT_ELEVATION, DEFAULT_DISTANCE);
    for (const [label, world] of [
      ["front center", new THREE.Vector3(0.5, 0.5, -0.5)],
      ["back center", new THREE.Vector3(-0.5, 0.5, 0.5)],
    ] as const) {
      const point = projectPoint(camera, read, world);
      const color = sampleAt(read, point.x, point.y);
      const grayDrift = Math.max(
        Math.abs((color[0] ?? 0) - 217),
        Math.abs((color[1] ?? 0) - 217),
        Math.abs((color[2] ?? 0) - 217),
      );
      expect(grayDrift, `${label} must not show the base gray`).toBeGreaterThan(60);
    }
  } finally {
    harness.dispose();
  }
});

test("orbit drag replaces the front panel with the neighboring panel and Reset restores the frame", async () => {
  const harness = setup("shirt");
  try {
    harness.handle.updateCanvas(atlasFixture(STANDARD_QUADRANTS));
    await settle();
    const beforeFrame = harness.canvas.toDataURL("image/png");
    let read = readPixels(harness.canvas);
    const centerX = read.width / 2;
    const centerY = read.height / 2;
    expectColorNear(sampleAt(read, centerX, centerY), BLUE, "front view center starts on the front panel");
    dragBy(harness.canvas, 90 / DEGREES_PER_PIXEL, 0);
    await settle();
    read = readPixels(harness.canvas);
    expectColorNear(sampleAt(read, centerX, centerY), GREEN, "after a 90 degree drag the back panel holds the center");
    harness.handle.resetView();
    await settle();
    expect(harness.canvas.toDataURL("image/png")).toBe(beforeFrame);
    read = readPixels(harness.canvas);
    expectColorNear(sampleAt(read, centerX, centerY), BLUE, "reset restores the front panel at the center");
  } finally {
    harness.dispose();
  }
});

test("pinch zoom grows the on-screen panel size", async () => {
  const harness = setup("shirt");
  try {
    harness.handle.updateCanvas(atlasFixture(STANDARD_QUADRANTS));
    await settle();
    const before = redPanelWidth(harness.canvas);
    const startX1 = CONTAINER_WIDTH / 2 - 100;
    const startX2 = CONTAINER_WIDTH / 2 + 100;
    const centerY = CONTAINER_HEIGHT / 2;
    dispatchPointer(harness.canvas, "pointerdown", 1, startX1, centerY);
    dispatchPointer(harness.canvas, "pointerdown", 2, startX2, centerY);
    for (let step = 1; step <= 5; step += 1) {
      dispatchPointer(harness.canvas, "pointermove", 1, startX1 - (step * 100) / 5, centerY);
      dispatchPointer(harness.canvas, "pointermove", 2, startX2 + (step * 100) / 5, centerY);
    }
    dispatchPointer(harness.canvas, "pointerup", 1, startX1 - 100, centerY);
    dispatchPointer(harness.canvas, "pointerup", 2, startX2 + 100, centerY);
    await settle();
    const after = redPanelWidth(harness.canvas);
    expect(after, `pinch must zoom in (before ${before}, after ${after})`).toBeGreaterThan(before * 1.5);
  } finally {
    harness.dispose();
  }
});

test("wheel zoom changes avatar size, prevents canvas scroll, clamps, and Reset restores it", async () => {
  const harness = setup("shirt");
  try {
    harness.handle.updateCanvas(atlasFixture(STANDARD_QUADRANTS));
    await settle();
    const before = redPanelWidth(harness.canvas);

    const zoomIn = new WheelEvent("wheel", { deltaY: -240, cancelable: true, bubbles: true });
    harness.canvas.dispatchEvent(zoomIn);
    await settle();
    const afterIn = redPanelWidth(harness.canvas);
    expect(zoomIn.defaultPrevented).toBe(true);
    expect(afterIn).toBeGreaterThan(before);

    for (let index = 0; index < 100; index += 1) {
      harness.canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: -1000, cancelable: true }));
    }
    await settle();
    const clampedIn = redPanelWidth(harness.canvas);
    expect(clampedIn).toBeGreaterThanOrEqual(afterIn);

    harness.canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: 1000, cancelable: true }));
    await settle();
    expect(redPanelWidth(harness.canvas)).toBeLessThan(clampedIn);

    harness.handle.resetView();
    await settle();
    expect(redPanelWidth(harness.canvas)).toBeCloseTo(before, 0);
  } finally {
    harness.dispose();
  }
});

test("updateCanvas repaints with the new texture content", async () => {
  const harness = setup("shirt");
  try {
    harness.handle.updateCanvas(atlasFixture(STANDARD_QUADRANTS));
    await settle();
    const camera = makeCamera(DEFAULT_AZIMUTH, DEFAULT_ELEVATION, DEFAULT_DISTANCE);
    const read = readPixels(harness.canvas);
    const topLeft = projectPoint(camera, read, new THREE.Vector3(0.5, 0.5, -0.5));
    const bottomRight = projectPoint(camera, read, new THREE.Vector3(-0.5, -0.5, -0.5));
    expectColorNear(sampleAt(read, topLeft.x, topLeft.y), RED, "initial top-left");
    expectColorNear(sampleAt(read, bottomRight.x, bottomRight.y), GREEN, "initial bottom-right");
    harness.handle.updateCanvas(atlasFixture(SWAPPED_QUADRANTS));
    await settle();
    const swapped = readPixels(harness.canvas);
    expectColorNear(sampleAt(swapped, topLeft.x, topLeft.y), GREEN, "repainted top-left");
    expectColorNear(sampleAt(swapped, bottomRight.x, bottomRight.y), RED, "repainted bottom-right");
  } finally {
    harness.dispose();
  }
});

test("transparent shirt pixels reveal the gray avatar body", async () => {
  const harness = setup("shirt");
  try {
    const fixture = atlasFixture({ TL: RED, TR: RED, BL: RED, BR: RED });
    const context = fixture.getContext("2d");
    if (context === null) throw new Error("2d context unavailable");
    context.clearRect(279, 122, 32, 32);
    harness.handle.updateCanvas(fixture);
    await settle();
    const read = readPixels(harness.canvas);
    const camera = makeCamera(DEFAULT_AZIMUTH, DEFAULT_ELEVATION, DEFAULT_DISTANCE);
    const clearCenter = projectPoint(camera, read, new THREE.Vector3(0, 0, -0.5));
    const paintedEdge = projectPoint(camera, read, new THREE.Vector3(0.4, 0, -0.5));
    const body = sampleAt(read, clearCenter.x, clearCenter.y);
    const red = sampleAt(read, paintedEdge.x, paintedEdge.y);
    for (const channel of body) expect(Math.abs(channel - 217)).toBeLessThanOrEqual(10);
    expectColorNear(red, RED, "opaque shirt beside cutout");
  } finally {
    harness.dispose();
  }
});

test("tshirt decal covers the torso front with the upright quadrant texture", async () => {
  const harness = setup("tshirt");
  try {
    harness.handle.updateCanvas(tshirtFixture(STANDARD_QUADRANTS));
    await settle();
    const read = readPixels(harness.canvas);
    const camera = makeCamera(DEFAULT_AZIMUTH, DEFAULT_ELEVATION, DEFAULT_DISTANCE);
    for (const [label, world, expected] of [
      ["decal TL", new THREE.Vector3(0.5, 0.5, -0.5), RED],
      ["decal TR", new THREE.Vector3(-0.5, 0.5, -0.5), YELLOW],
      ["decal BL", new THREE.Vector3(0.5, -0.5, -0.5), BLUE],
      ["decal BR", new THREE.Vector3(-0.5, -0.5, -0.5), GREEN],
    ] as const) {
      const point = projectPoint(camera, read, world);
      expectColorNear(sampleAt(read, point.x, point.y), expected, label);
    }
  } finally {
    harness.dispose();
  }
});

test("createPreview returns null and leaves the container empty when WebGL is unavailable", () => {
  const getContext = HTMLCanvasElement.prototype.getContext;
  const blockingGetContext = ((type: string): RenderingContext | null => {
    if (type === "webgl2" || type === "webgl" || type === "experimental-webgl") {
      return null;
    }
    return getContext.call(document.createElement("canvas"), type as "2d");
  }) as typeof HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = blockingGetContext;
  try {
    const container = document.createElement("div");
    document.body.appendChild(container);
    try {
      expect(createPreview(container, { garment: "shirt" })).toBeNull();
      expect(container.querySelector("canvas")).toBeNull();
    } finally {
      container.remove();
    }
  } finally {
    HTMLCanvasElement.prototype.getContext = getContext;
  }
});
