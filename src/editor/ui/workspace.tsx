import { useEffect, useRef, useState } from "preact/hooks";
import type { AssetStore } from "../../assets/store";
import { composeProject } from "../../compositor/compose";
import { getTemplate } from "../../domain/registry";
import type { Layer, ProjectDocumentV1, Rect, TemplateRegistryEntry } from "../../domain/types";
import type { EditorAction, EditorSession } from "../state";
import { createGestureController, footprintGeometry } from "./gestures";
import type { Point, Viewport } from "./gestures";
import { composeFailureMessage } from "./text";

interface WorkspaceProps {
  document: ProjectDocumentV1;
  assets: AssetStore;
  selectedLayer: Layer | null;
  onComposeError: (message: string | null) => void;
  getSession: () => EditorSession;
  dispatch: (action: EditorAction) => void;
  onSelect: (id: string | null) => void;
}

function patternBounds(template: TemplateRegistryEntry): Rect {
  if (template.garment === "tshirt") {
    return template.target.rect;
  }
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const panel of template.panels) {
    minX = Math.min(minX, panel.atlasRect.x);
    minY = Math.min(minY, panel.atlasRect.y);
    maxX = Math.max(maxX, panel.atlasRect.x + panel.atlasRect.width);
    maxY = Math.max(maxY, panel.atlasRect.y + panel.atlasRect.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function rotatedBounds(
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  rotationDeg: number,
): Rect {
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const halfW = width / 2;
  const halfH = height / 2;
  const half = halfW * cos + halfH * sin;
  const halfOther = halfW * sin + halfH * cos;
  return { x: centerX - half, y: centerY - halfOther, width: half * 2, height: halfOther * 2 };
}

function selectionRect(layer: Layer, assets: AssetStore, template: TemplateRegistryEntry): Rect {
  const transform = layer.transform;
  if (layer.placement === "pattern") {
    return patternBounds(template);
  }
  if (layer.kind === "solid") {
    return rotatedBounds(
      transform.positionX,
      transform.positionY,
      transform.scaleX,
      transform.scaleY,
      transform.rotationDeg,
    );
  }
  const asset = layer.assetId === undefined ? undefined : assets.get(layer.assetId);
  const width = asset === undefined ? 20 : asset.width * transform.crop.width * transform.scaleX;
  const height = asset === undefined ? 20 : asset.height * transform.crop.height * transform.scaleY;
  return rotatedBounds(
    transform.positionX,
    transform.positionY,
    width,
    height,
    transform.rotationDeg,
  );
}

function strokePolygon(
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  lineWidth: number,
): void {
  ctx.beginPath();
  const first = points[0];
  if (first === undefined) {
    return;
  }
  ctx.moveTo(first.x, first.y);
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index];
    if (point !== undefined) {
      ctx.lineTo(point.x, point.y);
    }
  }
  ctx.closePath();
  ctx.strokeStyle = "#0b3954";
  ctx.lineWidth = lineWidth * 2;
  ctx.stroke();
  ctx.strokeStyle = "#00c4ff";
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

function drawHandle(
  ctx: CanvasRenderingContext2D,
  point: Point,
  radius: number,
  fill: string,
): void {
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = "#0b3954";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius * 0.6, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

export function Workspace(props: WorkspaceProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [viewport, setViewport] = useState<Viewport>({ panX: 0, panY: 0, scale: 1 });
  const propsRef = useRef(props);
  propsRef.current = props;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) {
      return;
    }
    let failure: string | null = null;
    try {
      const composed = composeProject({ document: props.document, assets: props.assets }).canvas;
      canvas.width = composed.width;
      canvas.height = composed.height;
      const ctx = canvas.getContext("2d");
      if (ctx !== null) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(composed, 0, 0);
      }
    } catch (error) {
      failure = composeFailureMessage(error);
    }
    props.onComposeError(failure);
  }, [props.document, props.assets, props.onComposeError]);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (overlay === null) {
      return;
    }
    const template = getTemplate(props.document.garmentType);
    if (overlay.width !== template.width) {
      overlay.width = template.width;
    }
    if (overlay.height !== template.height) {
      overlay.height = template.height;
    }
    const overlayCtx = overlay.getContext("2d");
    if (overlayCtx === null) {
      return;
    }
    overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
    const layer = props.selectedLayer;
    if (layer === null || !layer.visible) {
      return;
    }
    const lineWidth = Math.max(3, template.width / 160);
    overlayCtx.lineJoin = "round";
    if (layer.kind === "raster" && layer.assetId !== undefined) {
      const asset = props.assets.get(layer.assetId);
      if (asset !== undefined) {
        const handleBounds = { width: template.width, height: template.height, inset: 16 };
        const footprint = footprintGeometry(layer.transform, asset, handleBounds);
        strokePolygon(overlayCtx, footprint.corners, lineWidth);
        const topStart = footprint.corners[0];
        const topEnd = footprint.corners[1];
        if (topStart !== undefined && topEnd !== undefined) {
          overlayCtx.beginPath();
          overlayCtx.moveTo((topStart.x + topEnd.x) / 2, (topStart.y + topEnd.y) / 2);
          overlayCtx.lineTo(footprint.rotateHandle.x, footprint.rotateHandle.y);
          overlayCtx.strokeStyle = "#0b3954";
          overlayCtx.lineWidth = lineWidth;
          overlayCtx.stroke();
        }
        const handleRadius = Math.max(6, template.width / 60);
        drawHandle(overlayCtx, footprint.rotateHandle, handleRadius, "#ffffff");
        drawHandle(overlayCtx, footprint.scaleHandle, handleRadius, "#00c4ff");
      }
      return;
    }
    const rect = selectionRect(layer, props.assets, template);
    overlayCtx.strokeStyle = "#0b3954";
    overlayCtx.lineWidth = lineWidth * 2;
    overlayCtx.strokeRect(rect.x, rect.y, rect.width, rect.height);
    overlayCtx.strokeStyle = "#00c4ff";
    overlayCtx.lineWidth = lineWidth;
    overlayCtx.strokeRect(rect.x, rect.y, rect.width, rect.height);
  }, [props.document, props.assets, props.selectedLayer]);

  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    if (stage === null || canvas === null || overlay === null) {
      return;
    }
    let syncFrame = 0;
    const syncNow = () => {
      syncFrame = 0;
      overlay.style.left = `${canvas.offsetLeft}px`;
      overlay.style.top = `${canvas.offsetTop}px`;
      overlay.style.width = `${canvas.offsetWidth}px`;
      overlay.style.height = `${canvas.offsetHeight}px`;
    };
    const scheduleSync = () => {
      if (syncFrame === 0) syncFrame = requestAnimationFrame(syncNow);
    };
    const observer = new ResizeObserver(scheduleSync);
    observer.observe(canvas);
    observer.observe(stage);
    scheduleSync();
    return () => {
      observer.disconnect();
      if (syncFrame !== 0) cancelAnimationFrame(syncFrame);
    };
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    if (stage === null || canvas === null || overlay === null) {
      return;
    }
    const controller = createGestureController({
      overlay,
      canvasRect: () => {
        const stageRect = stage.getBoundingClientRect();
        return {
          left: stageRect.left + canvas.offsetLeft,
          top: stageRect.top + canvas.offsetTop,
          scale: canvas.width === 0 ? 1 : canvas.offsetWidth / canvas.width,
        };
      },
      getSession: () => propsRef.current.getSession(),
      dispatch: (action) => propsRef.current.dispatch(action),
      onSelect: (id) => propsRef.current.onSelect(id),
      selectedId: () => propsRef.current.selectedLayer?.id ?? null,
      itemFootprint: (id) => {
        const current = propsRef.current;
        const layer = current.document.layers.find((candidate) => candidate.id === id);
        if (layer === undefined || layer.kind !== "raster" || !layer.visible) {
          return null;
        }
        if (layer.assetId === undefined) {
          return null;
        }
        const asset = current.assets.get(layer.assetId);
        if (asset === undefined) {
          return null;
        }
        const template = getTemplate(current.document.garmentType);
        const handleBounds = { width: template.width, height: template.height, inset: 16 };
        return footprintGeometry(layer.transform, asset, handleBounds);
      },
      onViewportChange: setViewport,
    });
    return () => controller.destroy();
  }, []);

  const displayTransform = `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.scale})`;

  return (
    <div class="workspace-stage" ref={stageRef} tabIndex={0}>
      {props.document.layers.length === 0 && (
        <p class="workspace-empty">Tap Add to add a picture or color.</p>
      )}
      <canvas
        class="workspace-canvas"
        role="img"
        aria-label="Your clothing"
        ref={canvasRef}
        style={{ transform: displayTransform, transformOrigin: "center center" }}
      />
      <canvas
        class="workspace-overlay"
        ref={overlayRef}
        aria-hidden="true"
        style={{ transform: displayTransform, transformOrigin: "center center" }}
      />
    </div>
  );
}
