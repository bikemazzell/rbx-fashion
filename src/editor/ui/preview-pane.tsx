import { useEffect, useRef, useState } from "preact/hooks";
import type { AssetStore } from "../../assets/store";
import { composeProject, PATTERN_TOO_SMALL_MESSAGE } from "../../compositor/compose";
import type { GarmentType, ProjectDocumentV1 } from "../../domain/types";
import type { PreviewHandle } from "../../preview/preview";
import { PREVIEW_COMPOSE_FAILED_MESSAGE, PREVIEW_UNAVAILABLE_MESSAGE } from "./text";

interface PreviewPaneProps {
  garment: GarmentType;
  document: ProjectDocumentV1;
  assets: AssetStore;
  active: boolean;
}

type PreviewStage = "loading" | "live" | "unavailable";

function previewFailureMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "kind" in error) {
    const failure = error as { kind: unknown };
    if (failure.kind === "pattern-too-small") {
      return PATTERN_TOO_SMALL_MESSAGE;
    }
  }
  return PREVIEW_COMPOSE_FAILED_MESSAGE;
}

export function PreviewPane(props: PreviewPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<PreviewHandle | null>(null);
  const [stage, setStage] = useState<PreviewStage>("loading");
  const [composeMessage, setComposeMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!props.active) {
      return;
    }
    let cancelled = false;
    setStage("loading");
    void import("../../preview/preview.ts").then((module) => {
      if (cancelled) {
        return;
      }
      const container = containerRef.current;
      if (container === null) {
        return;
      }
      const handle = module.createPreview(container, {
        garment: props.garment,
        onContextLost: () => {
          if (!cancelled) {
            setStage("unavailable");
          }
        },
      });
      if (handle === null) {
        setStage("unavailable");
        return;
      }
      handleRef.current = handle;
      setStage("live");
    });
    return () => {
      cancelled = true;
      handleRef.current?.dispose();
      handleRef.current = null;
    };
  }, [props.active, props.garment]);

  const live = props.active && stage === "live";

  useEffect(() => {
    if (!live) {
      return;
    }
    const handle = handleRef.current;
    if (handle === null) {
      return;
    }
    let message: string | null = null;
    try {
      const composed = composeProject({ document: props.document, assets: props.assets });
      handle.updateCanvas(composed.canvas);
    } catch (error) {
      message = previewFailureMessage(error);
    }
    setComposeMessage(message);
  }, [props.document, props.assets, live]);

  if (!props.active) {
    return null;
  }

  return (
    <div class="preview-stage" ref={containerRef}>
      {stage === "loading" && (
        <p class="preview-status" role="status">
          Loading preview…
        </p>
      )}
      {stage === "unavailable" && (
        <p class="preview-notice" role="status">
          {PREVIEW_UNAVAILABLE_MESSAGE}
        </p>
      )}
      {live && composeMessage !== null && (
        <p class="preview-notice" role="status">
          {composeMessage}
        </p>
      )}
      {live && (
        <button
          type="button"
          class="preview-reset"
          aria-label="Reset view"
          onClick={() => handleRef.current?.resetView()}
        >
          Reset
        </button>
      )}
    </div>
  );
}
