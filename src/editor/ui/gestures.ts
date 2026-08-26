import type { Transform } from "../../domain/types";
import type { EditorAction, EditorSession, TransformPatch } from "../state";

export interface Viewport {
  panX: number;
  panY: number;
  scale: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface FootprintGeometry {
  center: Point;
  rotationDeg: number;
  halfWidth: number;
  halfHeight: number;
  corners: readonly [Point, Point, Point, Point];
  scaleHandle: Point;
  rotateHandle: Point;
}

const ROTATE_HANDLE_OFFSET = 36;

export function footprintGeometry(
  transform: Transform,
  source: { width: number; height: number },
): FootprintGeometry {
  const cw = source.width * transform.crop.width;
  const ch = source.height * transform.crop.height;
  const rad = (transform.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const halfWidth = (cw * transform.scaleX) / 2;
  const halfHeight = (ch * transform.scaleY) / 2;
  const map = (x: number, y: number): Point => ({
    x: transform.positionX + x * cos - y * sin,
    y: transform.positionY + x * sin + y * cos,
  });
  return {
    center: { x: transform.positionX, y: transform.positionY },
    rotationDeg: transform.rotationDeg,
    halfWidth,
    halfHeight,
    corners: [
      map(-halfWidth, -halfHeight),
      map(halfWidth, -halfHeight),
      map(halfWidth, halfHeight),
      map(-halfWidth, halfHeight),
    ],
    scaleHandle: map(halfWidth, halfHeight),
    rotateHandle: map(0, -(halfHeight + ROTATE_HANDLE_OFFSET)),
  };
}

function pointInFootprint(footprint: FootprintGeometry, point: Point): boolean {
  const rad = (-footprint.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = point.x - footprint.center.x;
  const dy = point.y - footprint.center.y;
  const rotatedX = dx * cos - dy * sin;
  const rotatedY = dx * sin + dy * cos;
  const epsilon = 1e-6;
  return (
    Math.abs(rotatedX) <= footprint.halfWidth + epsilon &&
    Math.abs(rotatedY) <= footprint.halfHeight + epsilon
  );
}

const TAP_MAX_MS = 250;
const TAP_MAX_DISTANCE = 8;
const MIN_VIEWPORT_SCALE = 0.25;
const MAX_VIEWPORT_SCALE = 8;
const MIN_ITEM_SCALE = 0.01;
const HANDLE_SCREEN_RADIUS = 22;

interface GestureBase {
  id: string;
  pointerId: number;
  startTime: number;
  downX: number;
  downY: number;
}

type ItemGesture =
  | (GestureBase & {
      kind: "move";
      originX: number;
      originY: number;
      startCanvasX: number;
      startCanvasY: number;
    })
  | (GestureBase & {
      kind: "scale";
      center: Point;
      startDistance: number;
      startScaleX: number;
      startScaleY: number;
    })
  | (GestureBase & {
      kind: "rotate";
      center: Point;
      startRotation: number;
      lastAngleRad: number;
      cumulativeDeg: number;
    });

interface TapPending {
  pointerId: number;
  startTime: number;
  downX: number;
  downY: number;
  select: string | null;
}

export interface GestureControllerOptions {
  overlay: HTMLElement;
  canvasRect: () => { left: number; top: number; scale: number };
  getSession: () => EditorSession;
  dispatch: (action: EditorAction) => void;
  onSelect: (id: string | null) => void;
  selectedId: () => string | null;
  itemFootprint: (id: string) => FootprintGeometry | null;
  onViewportChange: (viewport: Viewport) => void;
}

export function createGestureController(options: GestureControllerOptions): { destroy: () => void } {
  const overlay = options.overlay;
  const pointers = new Map<number, Point>();
  const viewport: Viewport = { panX: 0, panY: 0, scale: 1 };
  let itemGesture: ItemGesture | null = null;
  let tapPending: TapPending | null = null;
  let viewportActive = false;
  let anchors: { cx: number; cy: number; dist: number | null } | null = null;
  let pendingUpdate: { id: string; patch: TransformPatch } | null = null;
  let scheduledFrame: number | null = null;

  const fitCenter = (): Point => {
    const rect = options.canvasRect();
    return {
      x: rect.left + overlay.offsetWidth / 2,
      y: rect.top + overlay.offsetHeight / 2,
    };
  };

  const screenToCanvas = (x: number, y: number): Point => {
    const rect = options.canvasRect();
    const centerX = rect.left + overlay.offsetWidth / 2;
    const centerY = rect.top + overlay.offsetHeight / 2;
    const fitX = centerX + (x - centerX - viewport.panX) / viewport.scale;
    const fitY = centerY + (y - centerY - viewport.panY) / viewport.scale;
    return { x: (fitX - rect.left) / rect.scale, y: (fitY - rect.top) / rect.scale };
  };

  const handleRadiusCanvasPx = (): number => {
    const rect = options.canvasRect();
    return HANDLE_SCREEN_RADIUS / (rect.scale * viewport.scale);
  };

  const hitLayerId = (point: Point): string | null => {
    const layers = options.getSession().document.layers;
    for (let index = layers.length - 1; index >= 0; index -= 1) {
      const layer = layers[index];
      if (layer === undefined || !layer.visible || layer.kind !== "raster") {
        continue;
      }
      const footprint = options.itemFootprint(layer.id);
      if (footprint !== null && pointInFootprint(footprint, point)) {
        return layer.id;
      }
    }
    return null;
  };

  const startItemInteraction = (event: PointerEvent): void => {
    const point = screenToCanvas(event.clientX, event.clientY);
    const selectedId = options.selectedId();
    const selectedFootprint = selectedId === null ? null : options.itemFootprint(selectedId);
    const transform =
      selectedId === null
        ? null
        : options.getSession().document.layers.find((layer) => layer.id === selectedId)?.transform ??
          null;
    if (selectedId !== null && selectedFootprint !== null && transform !== null) {
      const tolerance = handleRadiusCanvasPx();
      const rotateDistance = Math.hypot(
        point.x - selectedFootprint.rotateHandle.x,
        point.y - selectedFootprint.rotateHandle.y,
      );
      const scaleDistance = Math.hypot(
        point.x - selectedFootprint.scaleHandle.x,
        point.y - selectedFootprint.scaleHandle.y,
      );
      if (rotateDistance <= tolerance) {
        options.dispatch({ type: "begin-gesture" });
        itemGesture = {
          kind: "rotate",
          id: selectedId,
          pointerId: event.pointerId,
          center: selectedFootprint.center,
          startRotation: transform.rotationDeg,
          lastAngleRad: Math.atan2(point.y - selectedFootprint.center.y, point.x - selectedFootprint.center.x),
          cumulativeDeg: 0,
          startTime: event.timeStamp,
          downX: event.clientX,
          downY: event.clientY,
        };
        return;
      }
      if (scaleDistance <= tolerance) {
        options.dispatch({ type: "begin-gesture" });
        itemGesture = {
          kind: "scale",
          id: selectedId,
          pointerId: event.pointerId,
          center: selectedFootprint.center,
          startDistance: Math.hypot(
            point.x - selectedFootprint.center.x,
            point.y - selectedFootprint.center.y,
          ),
          startScaleX: transform.scaleX,
          startScaleY: transform.scaleY,
          startTime: event.timeStamp,
          downX: event.clientX,
          downY: event.clientY,
        };
        return;
      }
    }
    const hitId = hitLayerId(point);
    if (hitId !== null && hitId === selectedId && transform !== null) {
      options.dispatch({ type: "begin-gesture" });
      itemGesture = {
        kind: "move",
        id: selectedId,
        pointerId: event.pointerId,
        originX: transform.positionX,
        originY: transform.positionY,
        startCanvasX: point.x,
        startCanvasY: point.y,
        startTime: event.timeStamp,
        downX: event.clientX,
        downY: event.clientY,
      };
      return;
    }
    tapPending = {
      pointerId: event.pointerId,
      startTime: event.timeStamp,
      downX: event.clientX,
      downY: event.clientY,
      select: hitId,
    };
  };

  const centroidOfTrackedPointers = (): {
    cx: number;
    cy: number;
    dist: number | null;
  } => {
    const points = [...pointers.values()];
    let cx = 0;
    let cy = 0;
    for (const point of points) {
      cx += point.x;
      cy += point.y;
    }
    cx /= points.length;
    cy /= points.length;
    const first = points[0];
    const second = points[1];
    return {
      cx,
      cy,
      dist:
        first === undefined || second === undefined
          ? null
          : Math.hypot(second.x - first.x, second.y - first.y),
    };
  };

  const recomputeAnchors = (): void => {
    if (pointers.size === 0) {
      anchors = null;
      return;
    }
    anchors = centroidOfTrackedPointers();
  };

  const takeOverViewport = (): void => {
    if (itemGesture !== null) {
      flushItemUpdate();
      options.dispatch({ type: "cancel-gesture" });
      itemGesture = null;
    }
    tapPending = null;
    viewportActive = true;
    recomputeAnchors();
  };

  const updateViewport = (): void => {
    if (anchors === null) {
      recomputeAnchors();
      return;
    }
    const { cx, cy, dist } = centroidOfTrackedPointers();
    if (
      dist !== null &&
      anchors.dist !== null &&
      anchors.dist > 1e-6 &&
      dist > 1e-6 &&
      dist !== anchors.dist
    ) {
      const target = Math.min(
        MAX_VIEWPORT_SCALE,
        Math.max(MIN_VIEWPORT_SCALE, (viewport.scale * dist) / anchors.dist),
      );
      const center = fitCenter();
      const vx = cx - center.x - viewport.panX;
      const vy = cy - center.y - viewport.panY;
      const ratio = target / viewport.scale;
      viewport.panX = cx - center.x - vx * ratio;
      viewport.panY = cy - center.y - vy * ratio;
      viewport.scale = target;
    }
    viewport.panX += cx - anchors.cx;
    viewport.panY += cy - anchors.cy;
    anchors = { cx, cy, dist };
    options.onViewportChange({ ...viewport });
  };

  const flushItemUpdate = (): void => {
    if (scheduledFrame !== null) {
      cancelAnimationFrame(scheduledFrame);
      scheduledFrame = null;
    }
    const pending = pendingUpdate;
    pendingUpdate = null;
    if (pending !== null) {
      options.dispatch({
        type: "update-gesture",
        mutation: { op: "patch-transform", id: pending.id, patch: pending.patch },
      });
    }
  };

  const scheduleItemUpdate = (id: string, patch: TransformPatch): void => {
    pendingUpdate = { id, patch };
    if (scheduledFrame === null) {
      scheduledFrame = requestAnimationFrame(() => {
        scheduledFrame = null;
        flushItemUpdate();
      });
    }
  };

  const applyItemMove = (event: PointerEvent): void => {
    const gesture = itemGesture;
    if (gesture === null) {
      return;
    }
    const point = screenToCanvas(event.clientX, event.clientY);
    if (gesture.kind === "move") {
      const positionX = gesture.originX + (point.x - gesture.startCanvasX);
      const positionY = gesture.originY + (point.y - gesture.startCanvasY);
      if (Number.isFinite(positionX) && Number.isFinite(positionY)) {
        scheduleItemUpdate(gesture.id, { positionX, positionY });
      }
      return;
    }
    if (gesture.kind === "scale") {
      if (gesture.startDistance <= 1e-6) {
        return;
      }
      const ratio =
        Math.hypot(point.x - gesture.center.x, point.y - gesture.center.y) / gesture.startDistance;
      const scaleX = Math.max(MIN_ITEM_SCALE, gesture.startScaleX * ratio);
      const scaleY = Math.max(MIN_ITEM_SCALE, gesture.startScaleY * ratio);
      if (Number.isFinite(scaleX) && Number.isFinite(scaleY)) {
        scheduleItemUpdate(gesture.id, { scaleX, scaleY });
      }
      return;
    }
    const angle = Math.atan2(point.y - gesture.center.y, point.x - gesture.center.x);
    let delta = angle - gesture.lastAngleRad;
    if (delta > Math.PI) {
      delta -= 2 * Math.PI;
    } else if (delta < -Math.PI) {
      delta += 2 * Math.PI;
    }
    gesture.lastAngleRad = angle;
    gesture.cumulativeDeg += (delta * 180) / Math.PI;
    const rotationDeg = gesture.startRotation + gesture.cumulativeDeg;
    if (Number.isFinite(rotationDeg)) {
      scheduleItemUpdate(gesture.id, { rotationDeg });
    }
  };

  const isTap = (startTime: number, downX: number, downY: number, event: PointerEvent): boolean => {
    return (
      event.timeStamp - startTime < TAP_MAX_MS &&
      Math.hypot(event.clientX - downX, event.clientY - downY) < TAP_MAX_DISTANCE
    );
  };

  const drainIfEmpty = (): void => {
    if (pointers.size === 0) {
      viewportActive = false;
      anchors = null;
    }
  };

  const onPointerDown = (event: PointerEvent): void => {
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    try {
      overlay.setPointerCapture(event.pointerId);
    } catch {
    }
    if (pointers.size === 1 && !viewportActive) {
      startItemInteraction(event);
      return;
    }
    takeOverViewport();
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!pointers.has(event.pointerId)) {
      return;
    }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (viewportActive) {
      updateViewport();
      return;
    }
    if (itemGesture !== null && itemGesture.pointerId === event.pointerId) {
      applyItemMove(event);
    }
  };

  const onPointerUp = (event: PointerEvent): void => {
    pointers.delete(event.pointerId);
    if (itemGesture !== null && itemGesture.pointerId === event.pointerId) {
      flushItemUpdate();
      if (isTap(itemGesture.startTime, itemGesture.downX, itemGesture.downY, event)) {
        options.dispatch({ type: "cancel-gesture" });
      } else {
        options.dispatch({ type: "commit-gesture" });
      }
      itemGesture = null;
    } else if (tapPending !== null && tapPending.pointerId === event.pointerId) {
      if (isTap(tapPending.startTime, tapPending.downX, tapPending.downY, event)) {
        options.onSelect(tapPending.select);
      }
      tapPending = null;
    }
    if (viewportActive) {
      recomputeAnchors();
    }
    drainIfEmpty();
  };

  const onPointerCancel = (event: PointerEvent): void => {
    if (itemGesture !== null && itemGesture.pointerId === event.pointerId) {
      flushItemUpdate();
      options.dispatch({ type: "cancel-gesture" });
      itemGesture = null;
    }
    if (tapPending !== null && tapPending.pointerId === event.pointerId) {
      tapPending = null;
    }
    pointers.delete(event.pointerId);
    if (viewportActive) {
      recomputeAnchors();
    }
    drainIfEmpty();
  };

  const scaleBy = (transform: Transform, factor: number): TransformPatch => ({
    scaleX: Math.max(MIN_ITEM_SCALE, transform.scaleX * factor),
    scaleY: Math.max(MIN_ITEM_SCALE, transform.scaleY * factor),
  });

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) {
      return;
    }
    const id = options.selectedId();
    if (id === null) {
      return;
    }
    const layer = options.getSession().document.layers.find((candidate) => candidate.id === id);
    if (layer === undefined || layer.kind !== "raster" || !layer.visible) {
      return;
    }
    const transform = layer.transform;
    const step = event.shiftKey ? 10 : 1;
    let patch: TransformPatch;
    switch (event.key) {
      case "ArrowLeft":
        patch = { positionX: transform.positionX - step };
        break;
      case "ArrowRight":
        patch = { positionX: transform.positionX + step };
        break;
      case "ArrowUp":
        patch = { positionY: transform.positionY - step };
        break;
      case "ArrowDown":
        patch = { positionY: transform.positionY + step };
        break;
      case "+":
      case "=":
        patch = scaleBy(transform, 1.05);
        break;
      case "-":
      case "_":
        patch = scaleBy(transform, 1 / 1.05);
        break;
      case "]":
        patch = { rotationDeg: transform.rotationDeg + 5 };
        break;
      case "[":
        patch = { rotationDeg: transform.rotationDeg - 5 };
        break;
      default:
        return;
    }
    event.preventDefault();
    options.dispatch({ type: "patch-transform", id, patch });
  };

  overlay.addEventListener("pointerdown", onPointerDown);
  overlay.addEventListener("pointermove", onPointerMove);
  overlay.addEventListener("pointerup", onPointerUp);
  overlay.addEventListener("pointercancel", onPointerCancel);
  const keyboardHost = overlay.parentElement;
  if (keyboardHost !== null) {
    keyboardHost.addEventListener("keydown", onKeyDown);
  }

  return {
    destroy(): void {
      if (itemGesture !== null) {
        options.dispatch({ type: "cancel-gesture" });
        itemGesture = null;
      }
      pendingUpdate = null;
      if (scheduledFrame !== null) {
        cancelAnimationFrame(scheduledFrame);
        scheduledFrame = null;
      }
      overlay.removeEventListener("pointerdown", onPointerDown);
      overlay.removeEventListener("pointermove", onPointerMove);
      overlay.removeEventListener("pointerup", onPointerUp);
      overlay.removeEventListener("pointercancel", onPointerCancel);
      if (keyboardHost !== null) {
        keyboardHost.removeEventListener("keydown", onKeyDown);
      }
    },
  };
}
