import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { AssetStore } from "../../assets/store";
import { defaultTransform } from "../../compositor/math";
import { getTemplate } from "../../domain/registry";
import { LIMITS } from "../../domain/types";
import type {
  GarmentType,
  PlacementMode,
  TemplateRegistryEntry,
  Transform,
} from "../../domain/types";
import { downloadBlob, exportRobloxPng, TRANSPARENT_WARNING } from "../../project/export";
import { importImage } from "../import";
import { createSession, dispatch } from "../state";
import type { EditorAction, EditorSession, ItemSpec, TransformPatch } from "../state";
import { EditorScreen } from "./editor-screen";
import { StartScreen } from "./start-screen";
import { ITEM_CAP_MESSAGE, composeFailureMessage } from "./text";

type SheetKind = null | "add" | "color" | "items" | "more" | "question" | "disclaimer";

interface PendingRaster {
  assetId: string;
  width: number;
  height: number;
  megapixels: number;
}

type PendingStart =
  | { go: "start-screen" }
  | { go: "new-project"; garment: GarmentType; item: ItemSpec | null; megapixels: number };

function placementTransform(
  placement: PlacementMode,
  source: { width: number; height: number },
  template: TemplateRegistryEntry,
): Transform {
  return {
    ...defaultTransform(placement, source, template),
    crop: { x: 0, y: 0, width: 1, height: 1 },
  };
}

function fullMapItem(
  garment: GarmentType,
  assetId: string,
  source: { width: number; height: number },
): ItemSpec {
  return {
    kind: "raster",
    assetId,
    placement: "full-map",
    transform: placementTransform("full-map", source, getTemplate(garment)),
  };
}

function topLayerId(session: EditorSession): string | null {
  const top = session.document.layers[session.document.layers.length - 1];
  return top?.id ?? null;
}

export function DesignerApp() {
  const [session, setSession] = useState<EditorSession | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"edit" | "preview">("edit");
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [pendingStart, setPendingStart] = useState<PendingStart | null>(null);
  const [pendingRaster, setPendingRaster] = useState<PendingRaster | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [composeError, setComposeError] = useState<string | null>(null);
  const [transparentWarning, setTransparentWarning] = useState<string | null>(null);
  const [importedMegapixels, setImportedMegapixels] = useState(0);
  const [desktop, setDesktop] = useState(() =>
    window.matchMedia("(min-width: 1024px) and (pointer: fine)").matches,
  );
  const assetsRef = useRef<AssetStore | null>(null);
  if (assetsRef.current === null) {
    assetsRef.current = new AssetStore();
  }
  const assets = assetsRef.current;
  const sessionRef = useRef<EditorSession | null>(session);
  sessionRef.current = session;
  const exportInFlightRef = useRef(false);
  const undoRef = useRef<HTMLButtonElement>(null);
  const redoRef = useRef<HTMLButtonElement>(null);

  const commitSession = (next: EditorSession | null) => {
    sessionRef.current = next;
    setSession(next);
  };

  const commitIfChanged = (current: EditorSession, next: EditorSession): boolean => {
    if (next === current) {
      return false;
    }
    if (next.document !== current.document) {
      setNotice(null);
    }
    commitSession(next);
    return true;
  };

  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px) and (pointer: fine)");
    const onChange = () => setDesktop(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const selectedLayer = useMemo(() => {
    if (session === null) {
      return null;
    }
    return session.document.layers.find((layer) => layer.id === selectedItemId) ?? null;
  }, [session, selectedItemId]);

  const layersTopFirst = useMemo(() => {
    if (session === null) {
      return [];
    }
    return [...session.document.layers].reverse();
  }, [session]);

  const undoDisabled = session === null || session.undo.length === 0;
  const redoDisabled = session === null || session.redo.length === 0;

  useEffect(() => {
    if (session === null) {
      return;
    }
    const active = document.activeElement;
    if (active === undoRef.current && undoDisabled) {
      if (!redoDisabled && redoRef.current !== null) {
        redoRef.current.focus();
      } else {
        (document.querySelector(".workspace-stage") as HTMLElement | null)?.focus();
      }
    } else if (active === redoRef.current && redoDisabled) {
      if (!undoDisabled && undoRef.current !== null) {
        undoRef.current.focus();
      } else {
        (document.querySelector(".workspace-stage") as HTMLElement | null)?.focus();
      }
    }
  }, [undoDisabled, redoDisabled, session]);

  const layers = session === null ? null : session.document.layers;

  useEffect(() => {
    setTransparentWarning(null);
  }, [layers]);

  const apply = (action: EditorAction) => {
    const current = sessionRef.current;
    if (current === null) {
      return;
    }
    commitIfChanged(current, dispatch(current, action));
  };

  const handleComposeError = useCallback((message: string | null) => {
    setComposeError((current) => (current === message ? current : message));
  }, []);

  const resetTransient = () => {
    setSheet(null);
    setPendingStart(null);
    setPendingRaster(null);
    setNotice(null);
    setComposeError(null);
    setTransparentWarning(null);
    setActiveTab("edit");
  };

  const startGarment = (garment: GarmentType) => {
    commitSession(createSession(garment));
    setSelectedItemId(null);
    setImportedMegapixels(0);
    resetTransient();
  };

  const runNewProject = (garment: GarmentType, item: ItemSpec | null, megapixels: number) => {
    const current = sessionRef.current;
    if (current === null) {
      return;
    }
    let next = dispatch(current, { type: "new-project", garment });
    if (item !== null) {
      next = dispatch(next, { type: "add-item", item });
    }
    commitSession(next);
    setSelectedItemId(item === null ? null : topLayerId(next));
    setImportedMegapixels(item === null ? 0 : megapixels);
    resetTransient();
  };

  const beginNewProject = (garment: GarmentType, item: ItemSpec | null, megapixels: number) => {
    const current = sessionRef.current;
    if (current === null) {
      return;
    }
    if (current.dirty) {
      setPendingStart({ go: "new-project", garment, item, megapixels });
      return;
    }
    runNewProject(garment, item, megapixels);
  };

  const goStartScreen = () => {
    commitSession(null);
    setSelectedItemId(null);
    setImportedMegapixels(0);
    resetTransient();
  };

  const onNew = () => {
    const current = sessionRef.current;
    if (current === null) {
      return;
    }
    if (current.dirty) {
      setPendingStart({ go: "start-screen" });
      return;
    }
    goStartScreen();
  };

  const confirmPendingStart = () => {
    const pending = pendingStart;
    if (pending === null) {
      return;
    }
    if (pending.go === "start-screen") {
      goStartScreen();
      return;
    }
    runNewProject(pending.garment, pending.item, pending.megapixels);
  };

  const addSolid = (color: string) => {
    const current = sessionRef.current;
    if (current === null) {
      return;
    }
    if (current.document.layers.length >= LIMITS.MAX_LAYERS) {
      setNotice(ITEM_CAP_MESSAGE);
      return;
    }
    const next = dispatch(current, { type: "add-item", item: { kind: "solid", color } });
    if (commitIfChanged(current, next)) {
      setSelectedItemId(topLayerId(next));
    }
  };

  const onSwatch = (color: string) => {
    if (selectedLayer !== null && selectedLayer.kind === "solid") {
      apply({ type: "set-color", id: selectedLayer.id, color });
    } else {
      addSolid(color);
    }
    setSheet(null);
  };

  const handleFile = async (file: File) => {
    const captured = sessionRef.current;
    if (captured === null) {
      return;
    }
    setSheet(null);
    const outcome = await importImage(file, { assets, importedMegapixels });
    if (sessionRef.current !== captured) {
      return;
    }
    if (!outcome.ok) {
      setNotice(outcome.message);
      return;
    }
    if (outcome.route === "add-item") {
      if (captured.document.layers.length >= LIMITS.MAX_LAYERS) {
        setNotice(ITEM_CAP_MESSAGE);
        return;
      }
      const template = getTemplate(captured.document.garmentType);
      const item: ItemSpec = {
        kind: "raster",
        assetId: outcome.asset.id,
        placement: "decal",
        transform: placementTransform("decal", outcome.asset, template),
      };
      const next = dispatch(captured, { type: "add-item", item });
      if (commitIfChanged(captured, next)) {
        setSelectedItemId(topLayerId(next));
        setImportedMegapixels((value) => value + outcome.megapixels);
      }
      return;
    }
    if (outcome.route === "new-project-tshirt") {
      beginNewProject(
        "tshirt",
        fullMapItem("tshirt", outcome.asset.id, outcome.asset),
        outcome.megapixels,
      );
      return;
    }
    setPendingRaster({
      assetId: outcome.asset.id,
      width: outcome.asset.width,
      height: outcome.asset.height,
      megapixels: outcome.megapixels,
    });
    setSheet("question");
  };

  const answerGarment = (garment: "shirt" | "pants") => {
    if (pendingRaster === null) {
      return;
    }
    beginNewProject(
      garment,
      fullMapItem(garment, pendingRaster.assetId, pendingRaster),
      pendingRaster.megapixels,
    );
  };

  const onExport = async () => {
    if (exportInFlightRef.current) {
      return;
    }
    const current = sessionRef.current;
    if (current === null) {
      return;
    }
    exportInFlightRef.current = true;
    try {
      const result = await exportRobloxPng(current.document, assets);
      downloadBlob(`${current.document.name}.png`, result.blob);
      setTransparentWarning(result.warning === "fully-transparent" ? TRANSPARENT_WARNING : null);
      setSheet("disclaimer");
    } catch (error) {
      setNotice(composeFailureMessage(error));
    } finally {
      exportInFlightRef.current = false;
    }
  };

  const onPlacement = (placement: PlacementMode) => {
    const current = sessionRef.current;
    if (current === null) {
      return;
    }
    const layer = current.document.layers.find((item) => item.id === selectedItemId) ?? null;
    if (layer === null || layer.kind !== "raster") {
      return;
    }
    if (layer.placement === placement) {
      return;
    }
    const asset = layer.assetId === undefined ? undefined : assets.get(layer.assetId);
    if (asset === undefined) {
      return;
    }
    const template = getTemplate(current.document.garmentType);
    const transform = placementTransform(
      placement,
      { width: asset.width, height: asset.height },
      template,
    );
    let next = dispatch(current, { type: "begin-gesture" });
    next = dispatch(next, {
      type: "update-gesture",
      mutation: { op: "set-placement", id: layer.id, placement },
    });
    next = dispatch(next, {
      type: "update-gesture",
      mutation: { op: "patch-transform", id: layer.id, patch: transform },
    });
    commitIfChanged(current, dispatch(next, { type: "commit-gesture" }));
  };

  const onRepeatToolbar = () => {
    onPlacement("pattern");
  };

  const onToolbar = (tool: "add" | "move" | "repeat" | "color" | "preview" | "export") => {
    if (tool === "add") {
      setSheet("add");
    } else if (tool === "move") {
      setSheet(null);
      setActiveTab("edit");
    } else if (tool === "repeat") {
      onRepeatToolbar();
    } else if (tool === "color") {
      setSheet("color");
    } else if (tool === "preview") {
      setActiveTab("preview");
    } else {
      void onExport();
    }
  };

  const onRename = (id: string, name: string) => {
    apply({ type: "rename-item", id, name });
  };

  const onToggleVisibility = (id: string) => {
    apply({ type: "toggle-visibility", id });
  };

  const onDelete = (id: string) => {
    apply({ type: "delete-item", id });
  };

  const onReorder = (id: string, delta: 1 | -1) => {
    if (session === null) {
      return;
    }
    const index = session.document.layers.findIndex((layer) => layer.id === id);
    if (index < 0) {
      return;
    }
    apply({ type: "reorder-item", id, toIndex: index + delta });
  };

  const onDuplicate = (id: string) => {
    const current = sessionRef.current;
    if (current === null) {
      return;
    }
    if (current.document.layers.length >= LIMITS.MAX_LAYERS) {
      setNotice(ITEM_CAP_MESSAGE);
      return;
    }
    const next = dispatch(current, { type: "duplicate-item", id });
    if (commitIfChanged(current, next)) {
      setSelectedItemId(topLayerId(next));
    }
  };

  const onTransformCommit = (patch: TransformPatch) => {
    if (selectedLayer === null) {
      return;
    }
    apply({ type: "patch-transform", id: selectedLayer.id, patch });
  };

  const onOpacityCommit = (percent: number) => {
    if (selectedLayer === null) {
      return;
    }
    const clamped = Math.min(100, Math.max(0, percent));
    apply({ type: "set-opacity", id: selectedLayer.id, opacity: clamped / 100 });
  };

  if (session === null) {
    return <StartScreen onChoose={startGarment} />;
  }

  return (
    <EditorScreen
      session={session}
      assets={assets}
      selectedLayer={selectedLayer}
      layersTopFirst={layersTopFirst}
      activeTab={activeTab}
      desktop={desktop}
      sheet={sheet}
      pendingStartOpen={pendingStart !== null}
      notice={notice}
      composeError={composeError}
      transparentWarning={transparentWarning}
      undoRef={undoRef}
      redoRef={redoRef}
      undoDisabled={undoDisabled}
      redoDisabled={redoDisabled}
      onNew={onNew}
      onUndo={() => apply({ type: "undo" })}
      onRedo={() => apply({ type: "redo" })}
      onTabChange={setActiveTab}
      onToolbar={onToolbar}
      onPlacement={onPlacement}
      onComposeError={handleComposeError}
      getSession={() => session}
      dispatch={apply}
      onSelect={setSelectedItemId}
      onRename={onRename}
      onToggleVisibility={onToggleVisibility}
      onDuplicate={onDuplicate}
      onReorder={onReorder}
      onDelete={onDelete}
      onTransformCommit={onTransformCommit}
      onOpacityCommit={onOpacityCommit}
      onFile={handleFile}
      onSwatch={onSwatch}
      onAnswerGarment={answerGarment}
      onCancelQuestion={() => {
        setPendingRaster(null);
        setSheet(null);
      }}
      onCloseSheet={() => setSheet(null)}
      onOpenItems={() => setSheet("items")}
      onOpenMore={() => setSheet("more")}
      onConfirmPendingStart={confirmPendingStart}
      onCancelPendingStart={() => setPendingStart(null)}
    />
  );
}
