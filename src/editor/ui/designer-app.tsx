import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { JSX } from "preact";
import { AssetStore, pngAssetFromBytes } from "../../assets/store";
import type { NormalizedPngAsset } from "../../assets/store";
import { sha256Hex } from "../../assets/hash";
import { defaultTransform } from "../../compositor/math";
import { getTemplate } from "../../domain/registry";
import { LIMITS } from "../../domain/types";
import type {
  AssetManifestEntry,
  GarmentType,
  PlacementMode,
  TemplateRegistryEntry,
  Transform,
} from "../../domain/types";
import { generatePattern, PATTERN_PROXY_URL } from "../../ai/pattern-client";
import { openProject, saveProject } from "../../project/archive";
import { downloadBlob, exportRobloxPng, TRANSPARENT_WARNING } from "../../project/export";
import { importImage } from "../import";
import { createSession, createSessionFromDocument, dispatch } from "../state";
import type { EditorAction, EditorSession, ItemSpec, TransformPatch } from "../state";
import { EditorScreen } from "./editor-screen";
import { StartScreen } from "./start-screen";
import { ParentSettingsSheet } from "./sheets";
import {
  EXPORT_FAILED_MESSAGE,
  GENERATE_FAILED_MESSAGE,
  ITEM_CAP_MESSAGE,
  OPEN_INVALID_MESSAGE,
  composeFailureMessage,
} from "./text";

type SheetKind = null | "add" | "color" | "items" | "more" | "question" | "disclaimer" | "generate";

interface PendingRaster {
  assetId: string;
  width: number;
  height: number;
  megapixels: number;
  entry: AssetManifestEntry;
}

type PendingStart =
  | { go: "start-screen" }
  | {
      go: "new-project";
      garment: GarmentType;
      item: ItemSpec | null;
      entry: AssetManifestEntry | null;
      megapixels: number;
    }
  | { go: "open-file" };

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
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [parentSheetOpen, setParentSheetOpen] = useState(false);
  const generateEnabled = PATTERN_PROXY_URL !== undefined && PATTERN_PROXY_URL.length > 0;
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
  const saveInFlightRef = useRef(false);
  const openFileInputRef = useRef<HTMLInputElement>(null);
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

  const sessionDirty = session !== null && session.dirty;
  useEffect(() => {
    if (!sessionDirty) {
      return;
    }
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [sessionDirty]);

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
    assets.retainOnly([]);
    setSelectedItemId(null);
    setImportedMegapixels(0);
    resetTransient();
  };

  const runNewProject = (
    garment: GarmentType,
    item: ItemSpec | null,
    entry: AssetManifestEntry | null,
    megapixels: number,
  ) => {
    const current = sessionRef.current;
    if (current === null) {
      return;
    }
    let next = dispatch(current, { type: "new-project", garment });
    if (item !== null) {
      next = dispatch(next, { type: "add-item", item });
      if (entry !== null) {
        next = {
          ...next,
          document: { ...next.document, assets: [...next.document.assets, entry] },
        };
      }
    }
    commitSession(next);
    assets.retainOnly(next.document.assets.map((entry) => entry.id));
    setSelectedItemId(item === null ? null : topLayerId(next));
    setImportedMegapixels(item === null ? 0 : megapixels);
    resetTransient();
  };

  const beginNewProject = (
    garment: GarmentType,
    item: ItemSpec | null,
    entry: AssetManifestEntry | null,
    megapixels: number,
  ) => {
    const current = sessionRef.current;
    if (current === null) {
      return;
    }
    if (current.dirty) {
      setPendingStart({ go: "new-project", garment, item, entry, megapixels });
      return;
    }
    runNewProject(garment, item, entry, megapixels);
  };

  const goStartScreen = () => {
    commitSession(null);
    assets.retainOnly([]);
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
    if (pending.go === "open-file") {
      setPendingStart(null);
      openFileInputRef.current?.click();
      return;
    }
    runNewProject(pending.garment, pending.item, pending.entry, pending.megapixels);
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
      if (outcome.ok) {
        assets.remove(outcome.asset.id);
      }
      return;
    }
    if (!outcome.ok) {
      setNotice(outcome.message);
      return;
    }
    if (outcome.route === "add-item") {
      if (captured.document.layers.length >= LIMITS.MAX_LAYERS) {
        assets.remove(outcome.asset.id);
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
      const added = dispatch(captured, { type: "add-item", item });
      const next: EditorSession = {
        ...added,
        document: { ...added.document, assets: [...added.document.assets, outcome.asset] },
      };
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
        outcome.asset,
        outcome.megapixels,
      );
      return;
    }
    setPendingRaster({
      assetId: outcome.asset.id,
      width: outcome.asset.width,
      height: outcome.asset.height,
      megapixels: outcome.megapixels,
      entry: outcome.asset,
    });
    setSheet("question");
  };

  const answerGarment = (garment: "shirt" | "pants") => {
    const pending = pendingRaster;
    if (pending === null) {
      return;
    }
    beginNewProject(
      garment,
      fullMapItem(garment, pending.assetId, pending),
      pending.entry,
      pending.megapixels,
    );
  };

  const cancelQuestion = () => {
    if (pendingRaster !== null) {
      assets.remove(pendingRaster.entry.id);
    }
    setPendingRaster(null);
    setSheet(null);
  };

  const cancelPendingStart = () => {
    const pending = pendingStart;
    if (pending !== null && pending.go === "new-project" && pending.entry !== null) {
      assets.remove(pending.entry.id);
      if (pendingRaster !== null && pendingRaster.entry.id === pending.entry.id) {
        setPendingRaster(null);
        setSheet(null);
      }
    }
    setPendingStart(null);
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

  const onSave = async () => {
    if (saveInFlightRef.current) {
      return;
    }
    const current = sessionRef.current;
    if (current === null) {
      return;
    }
    saveInFlightRef.current = true;
    try {
      const result = await saveProject(current.document, (id) => {
        const asset = assets.get(id);
        if (asset === undefined) {
          throw new Error(`missing asset ${id}`);
        }
        return asset.bytes;
      });
      if (sessionRef.current !== current) {
        return;
      }
      if (result.ok) {
        downloadBlob(`${current.document.name}.rbxcloth.zip`, result.blob);
        commitIfChanged(current, dispatch(current, { type: "mark-saved" }));
      } else {
        setNotice(result.message);
      }
    } catch {
      setNotice(EXPORT_FAILED_MESSAGE);
    } finally {
      saveInFlightRef.current = false;
    }
  };

  const requestOpen = () => {
    const current = sessionRef.current;
    if (current === null) {
      return;
    }
    if (current.dirty) {
      setPendingStart({ go: "open-file" });
      return;
    }
    openFileInputRef.current?.click();
  };

  const onOpenFile = async (event: JSX.TargetedEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (file === undefined) {
      return;
    }
    const captured = sessionRef.current;
    if (captured === null) {
      return;
    }
    const result = await openProject(file);
    if (sessionRef.current !== captured) {
      return;
    }
    if (!result.ok) {
      setNotice(result.message);
      return;
    }
    const next = createSessionFromDocument(result.document);
    if (next === null) {
      setNotice(OPEN_INVALID_MESSAGE);
      return;
    }
    for (const asset of result.assets) {
      assets.add(asset);
    }
    assets.retainOnly(result.document.assets.map((entry) => entry.id));
    commitSession(next);
    setSelectedItemId(topLayerId(next));
    setImportedMegapixels(
      result.assets.reduce((sum, asset) => sum + (asset.width * asset.height) / 1_000_000, 0),
    );
    resetTransient();
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

  const onGenerateFromAdd = (): boolean => {
    if (apiKey === null) {
      return false;
    }
    setSheet("generate");
    return true;
  };

  const insertGeneratedPattern = async (
    captured: EditorSession,
    bytes: Uint8Array<ArrayBuffer>,
    prompt: string,
  ): Promise<void> => {
    const id = crypto.randomUUID();
    let asset: NormalizedPngAsset;
    try {
      asset = await pngAssetFromBytes(bytes, id);
    } catch {
      setSheet(null);
      setNotice(GENERATE_FAILED_MESSAGE);
      return;
    }
    if (sessionRef.current !== captured) {
      return;
    }
    const megapixels = (asset.width * asset.height) / 1_000_000;
    if (
      asset.width > LIMITS.IMPORT_MAX_DIM ||
      asset.height > LIMITS.IMPORT_MAX_DIM ||
      importedMegapixels + megapixels > LIMITS.IMPORT_MAX_MEGAPIXELS + 1e-6
    ) {
      setSheet(null);
      setNotice(GENERATE_FAILED_MESSAGE);
      return;
    }
    if (captured.document.layers.length >= LIMITS.MAX_LAYERS) {
      setSheet(null);
      setNotice(ITEM_CAP_MESSAGE);
      return;
    }
    const sha256 = await sha256Hex(asset.bytes);
    if (sessionRef.current !== captured) {
      return;
    }
    const entry: AssetManifestEntry = {
      id,
      path: `assets/${id}.png`,
      originalName: "AI pattern",
      sourceMimeType: "image/png",
      byteLength: asset.bytes.length,
      width: asset.width,
      height: asset.height,
      sha256,
      source: "generated",
      prompt,
    };
    assets.add(asset);
    const template = getTemplate(captured.document.garmentType);
    const item: ItemSpec = {
      kind: "raster",
      assetId: id,
      placement: "pattern",
      transform: placementTransform("pattern", { width: asset.width, height: asset.height }, template),
    };
    const added = dispatch(captured, { type: "add-item", item });
    const next: EditorSession = {
      ...added,
      document: { ...added.document, assets: [...added.document.assets, entry] },
    };
    if (commitIfChanged(captured, next)) {
      setSelectedItemId(topLayerId(next));
      setImportedMegapixels((value) => value + megapixels);
    }
    setSheet(null);
  };

  const onGeneratePattern = async (prompt: string, signal: AbortSignal): Promise<void> => {
    const captured = sessionRef.current;
    const proxyUrl = PATTERN_PROXY_URL;
    const key = apiKey;
    if (captured === null || proxyUrl === undefined || key === null) {
      setSheet(null);
      return;
    }
    const outcome = await generatePattern({ proxyUrl, apiKey: key, prompt, signal });
    if (sessionRef.current !== captured) {
      return;
    }
    if (!outcome.ok) {
      setSheet(null);
      if (outcome.kind !== "cancelled") {
        setNotice(outcome.message);
      }
      return;
    }
    await insertGeneratedPattern(captured, outcome.bytes, prompt);
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
    return (
      <>
        <StartScreen
          onChoose={startGarment}
          onParentSettings={generateEnabled ? () => setParentSheetOpen(true) : undefined}
        />
        {parentSheetOpen && (
          <ParentSettingsSheet
            hasKey={apiKey !== null}
            onSaveKey={(key) => setApiKey(key)}
            onForgetKey={() => setApiKey(null)}
            onClose={() => setParentSheetOpen(false)}
          />
        )}
      </>
    );
  }

  return (
    <>
      <EditorScreen
        session={session}
        assets={assets}
        selectedLayer={selectedLayer}
        layersTopFirst={layersTopFirst}
        activeTab={activeTab}
        desktop={desktop}
        sheet={sheet}
        pendingStartOpen={pendingStart !== null}
        unsavedVariant={pendingStart !== null && pendingStart.go === "open-file" ? "open" : "new"}
        notice={notice}
        composeError={composeError}
        transparentWarning={transparentWarning}
        undoRef={undoRef}
        redoRef={redoRef}
        undoDisabled={undoDisabled}
        redoDisabled={redoDisabled}
        onNew={onNew}
        onSave={() => void onSave()}
        onOpen={requestOpen}
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
        generateEnabled={generateEnabled}
        onGenerateFromAdd={onGenerateFromAdd}
        onGeneratePattern={onGeneratePattern}
          onAnswerGarment={answerGarment}
          onCancelQuestion={cancelQuestion}
          onCloseSheet={() => setSheet(null)}
          onOpenItems={() => setSheet("items")}
          onOpenMore={() => setSheet("more")}
          onConfirmPendingStart={confirmPendingStart}
          onCancelPendingStart={cancelPendingStart}
      />
      <input
        ref={openFileInputRef}
        type="file"
        accept=".rbxcloth.zip,.zip,application/zip"
        hidden
        onChange={onOpenFile}
      />
    </>
  );
}
