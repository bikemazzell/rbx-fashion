import type { Ref } from "preact";
import type { AssetStore } from "../../assets/store";
import type { Layer, PlacementMode, ProjectDocument } from "../../domain/types";
import type { EditorAction, EditorSession, TransformPatch } from "../state";
import {
  IconAdd,
  IconColor,
  IconExport,
  IconMove,
  IconPreview,
  IconRedo,
  IconRepeat,
  IconUndo,
} from "./icons";
import { ItemsPanel } from "./items-panel";
import { PreviewPane } from "./preview-pane";
import {
  AddSheet,
  ColorSheet,
  DisclaimerSheet,
  GenerateSheet,
  MoreSheet,
  QuestionSheet,
  SheetBackdrop,
  UnsavedDialog,
} from "./sheets";
import { Workspace } from "./workspace";

const PLACEMENTS: readonly { label: string; value: PlacementMode }[] = [
  { label: "Sticker", value: "decal" },
  { label: "Repeat", value: "pattern" },
  { label: "Fill Clothing", value: "full-map" },
];

type TabKind = "edit" | "preview";
type ToolKind = "add" | "move" | "repeat" | "color" | "preview" | "export";
type SheetKind = null | "add" | "color" | "items" | "more" | "question" | "disclaimer" | "generate";

export interface EditorScreenProps {
  session: EditorSession;
  assets: AssetStore;
  selectedLayer: Layer | null;
  layersTopFirst: readonly Layer[];
  activeTab: TabKind;
  desktop: boolean;
  dualPane: boolean;
  sheet: SheetKind;
  pendingStartOpen: boolean;
  unsavedVariant: "new" | "open";
  notice: string | null;
  composeError: string | null;
  transparentWarning: string | null;
  undoRef: Ref<HTMLButtonElement>;
  redoRef: Ref<HTMLButtonElement>;
  undoDisabled: boolean;
  redoDisabled: boolean;
  onNew: () => void;
  onSave: () => void;
  onOpen: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onTabChange: (tab: TabKind) => void;
  onToolbar: (tool: ToolKind) => void;
  onPlacement: (placement: PlacementMode) => void;
  onComposeError: (message: string | null) => void;
  getSession: () => EditorSession;
  dispatch: (action: EditorAction) => void;
  onSelect: (id: string | null) => void;
  onRename: (id: string, name: string) => void;
  onToggleVisibility: (id: string) => void;
  onDuplicate: (id: string) => void;
  onReorder: (id: string, delta: 1 | -1) => void;
  onDelete: (id: string) => void;
  onTransformCommit: (patch: TransformPatch) => void;
  onOpacityCommit: (percent: number) => void;
  onFile: (file: File) => void;
  onSwatch: (color: string) => void;
  generateEnabled: boolean;
  onGenerateFromAdd: () => boolean;
  onGeneratePattern: (prompt: string, signal: AbortSignal) => Promise<void>;
  onAnswerGarment: (garment: "shirt" | "pants") => void;
  onCancelQuestion: () => void;
  onCloseSheet: () => void;
  onOpenItems: () => void;
  onOpenMore: () => void;
  onConfirmPendingStart: () => void;
  onCancelPendingStart: () => void;
}

function isPlacementActive(layer: Layer, value: PlacementMode): boolean {
  if (layer.kind === "cutout") {
    return false;
  }
  if (layer.kind === "solid") {
    return value === "full-map";
  }
  return layer.placement === value;
}

function placementDisabled(layer: Layer, value: PlacementMode): boolean {
  return layer.kind === "cutout" || (layer.kind === "solid" && value !== "full-map");
}

export function EditorScreen(props: EditorScreenProps) {
  const doc: ProjectDocument = props.session.document;
  const selected = props.selectedLayer;
  const repeatDisabled =
    selected === null || selected.kind !== "raster" || !selected.visible;
  const itemsPanel = (
    <ItemsPanel
      layersTopFirst={props.layersTopFirst}
      selectedItemId={selected?.id ?? null}
      onSelect={props.onSelect}
      onRename={props.onRename}
      onToggleVisibility={props.onToggleVisibility}
      onDuplicate={props.onDuplicate}
      onReorder={props.onReorder}
      onDelete={props.onDelete}
    />
  );
  return (
    <div class="app">
      <header class="app-header">
        <button type="button" class="header-button" aria-label="New" onClick={props.onNew}>
          New
        </button>
        <button type="button" class="header-button" aria-label="Save" onClick={props.onSave}>
          Save
        </button>
        <button type="button" class="header-button" aria-label="Open" onClick={props.onOpen}>
          Open
        </button>
        <h1 class="project-name">{doc.name}</h1>
        <button
          ref={props.undoRef}
          type="button"
          class="header-button icon-button"
          aria-label="Undo"
          disabled={props.undoDisabled}
          aria-disabled={props.undoDisabled ? "true" : "false"}
          onClick={props.onUndo}
        >
          <IconUndo />
        </button>
        <button
          ref={props.redoRef}
          type="button"
          class="header-button icon-button"
          aria-label="Redo"
          disabled={props.redoDisabled}
          aria-disabled={props.redoDisabled ? "true" : "false"}
          onClick={props.onRedo}
        >
          <IconRedo />
        </button>
        {!props.desktop && (
          <button
            type="button"
            class="header-button items-toggle"
            aria-label="Items"
            onClick={props.onOpenItems}
          >
            Items
          </button>
        )}
      </header>
      <div class="app-body">
        <div class="panes" data-tab={props.activeTab}>
          <section class="pane pane-edit" aria-label="Edit">
            {selected !== null && (
              <div class="selection-bar">
                <div class="segmented" role="group" aria-label="Placement">
                  {PLACEMENTS.map(({ label, value }) => (
                    <button
                      key={value}
                      type="button"
                      aria-label={label}
                      aria-pressed={isPlacementActive(selected, value) ? "true" : "false"}
                      disabled={placementDisabled(selected, value)}
                      aria-disabled={placementDisabled(selected, value) ? "true" : "false"}
                      onClick={() => props.onPlacement(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  class="more-button"
                  aria-label="More"
                  onClick={props.onOpenMore}
                >
                  More
                </button>
              </div>
            )}
            <Workspace
              document={doc}
              assets={props.assets}
              selectedLayer={selected}
              onComposeError={props.onComposeError}
              getSession={props.getSession}
              dispatch={props.dispatch}
              onSelect={props.onSelect}
            />
          </section>
          <section class="pane pane-preview" aria-label="Preview">
            <PreviewPane
              garment={doc.garmentType}
              document={doc}
              assets={props.assets}
              active={props.desktop || props.dualPane || props.activeTab === "preview"}
            />
          </section>
        </div>
        {props.desktop && (
          <aside class="items-rail" aria-label="Items">
            <h2 class="rail-title">Items</h2>
            {itemsPanel}
          </aside>
        )}
      </div>
      {(props.notice !== null || props.composeError !== null || props.transparentWarning !== null) && (
        <div class="notice-area" role="status">
          {props.notice !== null && <p class="notice-line">{props.notice}</p>}
          {props.composeError !== null && <p class="notice-line">{props.composeError}</p>}
          {props.transparentWarning !== null && (
            <p class="notice-line">{props.transparentWarning}</p>
          )}
        </div>
      )}
      <nav class="tabbar" aria-label="View">
        <button
          type="button"
          aria-pressed={props.activeTab === "edit" ? "true" : "false"}
          onClick={() => props.onTabChange("edit")}
        >
          Edit
        </button>
        <button
          type="button"
          aria-pressed={props.activeTab === "preview" ? "true" : "false"}
          onClick={() => props.onTabChange("preview")}
        >
          Preview
        </button>
      </nav>
      <nav class="toolbar" aria-label="Tools">
        <button type="button" aria-label="Add" onClick={() => props.onToolbar("add")}>
          <IconAdd />
          <span class="tool-label">Add</span>
        </button>
        <button type="button" aria-label="Move" onClick={() => props.onToolbar("move")}>
          <IconMove />
          <span class="tool-label">Move</span>
        </button>
        <button
          type="button"
          aria-label="Repeat"
          disabled={repeatDisabled}
          aria-disabled={repeatDisabled ? "true" : "false"}
          onClick={() => props.onToolbar("repeat")}
        >
          <IconRepeat />
          <span class="tool-label">Repeat</span>
        </button>
        <button type="button" aria-label="Color" onClick={() => props.onToolbar("color")}>
          <IconColor />
          <span class="tool-label">Color</span>
        </button>
        <button type="button" aria-label="Preview" onClick={() => props.onToolbar("preview")}>
          <IconPreview />
          <span class="tool-label">Preview</span>
        </button>
        <button type="button" aria-label="Export" onClick={() => props.onToolbar("export")}>
          <IconExport />
          <span class="tool-label">Export</span>
        </button>
      </nav>
      {props.sheet === "add" && (
        <AddSheet
          onPicture={props.onFile}
          onChooseColor={() => props.onToolbar("color")}
          onGenerate={props.generateEnabled ? props.onGenerateFromAdd : undefined}
          onCancel={props.onCloseSheet}
        />
      )}
      {props.sheet === "generate" && (
        <GenerateSheet onGenerate={props.onGeneratePattern} onClose={props.onCloseSheet} />
      )}
      {props.sheet === "color" && (
        <ColorSheet onSwatch={props.onSwatch} onCancel={props.onCloseSheet} />
      )}
      {props.sheet === "items" && (
        <SheetBackdrop label="Items">
          <h2 class="sheet-title">Items</h2>
          {itemsPanel}
          <button
            type="button"
            class="sheet-done"
            aria-label="Done"
            onClick={props.onCloseSheet}
          >
            Done
          </button>
        </SheetBackdrop>
      )}
      {props.sheet === "more" && selected !== null && (
        <MoreSheet
          layer={selected}
          onTransformCommit={props.onTransformCommit}
          onOpacityCommit={props.onOpacityCommit}
          onClose={props.onCloseSheet}
        />
      )}
      {props.sheet === "question" && (
        <QuestionSheet onAnswer={props.onAnswerGarment} onCancel={props.onCancelQuestion} />
      )}
      {props.sheet === "disclaimer" && <DisclaimerSheet onClose={props.onCloseSheet} />}
      {props.pendingStartOpen && (
        <UnsavedDialog
          title={
            props.unsavedVariant === "open" ? "Open a different project?" : "Start a new project?"
          }
          confirmLabel={props.unsavedVariant === "open" ? "Open" : "Start New"}
          onKeepEditing={props.onCancelPendingStart}
          onStartNew={props.onConfirmPendingStart}
        />
      )}
    </div>
  );
}
