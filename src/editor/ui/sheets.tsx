import { useEffect, useRef, useState } from "preact/hooks";
import type { ComponentChildren, JSX } from "preact";
import { isCropValid } from "../../compositor/math";
import type { CutoutRect, Layer } from "../../domain/types";
import { EXPORT_DISCLAIMER } from "../../project/export";
import type { TransformPatch } from "../state";
import { GENERATE_PARENT_SETUP_MESSAGE, PALETTE, PATTERN_IDEAS } from "./text";

export function SheetBackdrop({
  label,
  children,
  onDismiss,
  sheetClass,
}: {
  label: string;
  children: ComponentChildren;
  onDismiss?: () => void;
  sheetClass?: string;
}) {
  return (
    <div
      class="sheet-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onDismiss?.();
      }}
    >
      <div
        class={`sheet${sheetClass === undefined ? "" : ` ${sheetClass}`}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        {children}
      </div>
    </div>
  );
}

export function AddSheet({
  onPicture,
  onChooseColor,
  onGenerate,
  onCutout,
  onCancel,
}: {
  onPicture: (file: File) => void;
  onChooseColor: () => void;
  onGenerate?: () => boolean;
  onCutout: () => void;
  onCancel: () => void;
}) {
  const [generateBlocked, setGenerateBlocked] = useState(false);
  return (
    <SheetBackdrop label="Add">
      <h2 class="sheet-title">Add</h2>
      <label class="big-choice">
        <span>Choose Picture</span>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          aria-label="Choose a picture file"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file !== undefined) {
              onPicture(file);
            }
            event.currentTarget.value = "";
          }}
        />
      </label>
      <button type="button" class="big-choice" onClick={onChooseColor}>
        <span>Choose Color</span>
      </button>
      <button type="button" class="big-choice" aria-label="Cut Out" onClick={onCutout}>
        <span>Cut Out</span>
      </button>
      {onGenerate !== undefined && (
        <button
          type="button"
          class="big-choice"
          onClick={() => {
            if (!onGenerate()) {
              setGenerateBlocked(true);
            }
          }}
        >
          <span>Generate a Pattern</span>
        </button>
      )}
      {generateBlocked && (
        <p class="sheet-text" role="status">
          {GENERATE_PARENT_SETUP_MESSAGE}
        </p>
      )}
      <button type="button" class="sheet-cancel" aria-label="Cancel" onClick={onCancel}>
        Cancel
      </button>
    </SheetBackdrop>
  );
}

export function ColorSheet({
  onSwatch,
  onCancel,
}: {
  onSwatch: (color: string) => void;
  onCancel: () => void;
}) {
  return (
    <SheetBackdrop label="Colors">
      <h2 class="sheet-title">Colors</h2>
      <div class="swatch-grid" role="group" aria-label="Color choices">
        {PALETTE.map((entry) => (
          <button
            key={entry.color}
            type="button"
            class="swatch"
            aria-label={entry.name}
            style={{ backgroundColor: entry.color }}
            onClick={() => onSwatch(entry.color)}
          />
        ))}
      </div>
      <button type="button" class="sheet-cancel" aria-label="Cancel" onClick={onCancel}>
        Cancel
      </button>
    </SheetBackdrop>
  );
}

export function QuestionSheet({
  onAnswer,
  onCancel,
}: {
  onAnswer: (garment: "shirt" | "pants") => void;
  onCancel: () => void;
}) {
  return (
    <SheetBackdrop label="Is this a Shirt or Pants?">
      <h2 class="sheet-title">Is this a Shirt or Pants?</h2>
      <div class="question-actions">
        <button type="button" aria-label="Shirt" onClick={() => onAnswer("shirt")}>
          Shirt
        </button>
        <button type="button" aria-label="Pants" onClick={() => onAnswer("pants")}>
          Pants
        </button>
      </div>
      <button type="button" class="sheet-cancel" aria-label="Cancel" onClick={onCancel}>
        Cancel
      </button>
    </SheetBackdrop>
  );
}

export function DisclaimerSheet({ onClose }: { onClose: () => void }) {
  return (
    <SheetBackdrop label="Download ready">
      <h2 class="sheet-title">Download started</h2>
      <p class="sheet-text">{EXPORT_DISCLAIMER}</p>
      <button type="button" class="sheet-done primary" aria-label="Okay" onClick={onClose}>
        Okay
      </button>
    </SheetBackdrop>
  );
}

export function UnsavedDialog({
  title,
  confirmLabel,
  onKeepEditing,
  onStartNew,
}: {
  title: string;
  confirmLabel: string;
  onKeepEditing: () => void;
  onStartNew: () => void;
}) {
  const keepRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    keepRef.current?.focus();
  }, []);
  return (
    <div class="dialog-backdrop">
      <div class="dialog" role="dialog" aria-modal="true" aria-label={title}>
        <p class="dialog-text">{title} Your changes will be lost.</p>
        <div class="dialog-actions">
          <button type="button" ref={keepRef} onClick={onKeepEditing}>
            Keep Editing
          </button>
          <button type="button" class="primary" onClick={onStartNew}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ParentSettingsSheet({
  hasKey,
  onSaveKey,
  onForgetKey,
  onClose,
}: {
  hasKey: boolean;
  onSaveKey: (key: string) => void;
  onForgetKey: () => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState("");
  const saveRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    saveRef.current?.focus();
  }, []);
  return (
    <SheetBackdrop label="Parent Settings">
      <h2 class="sheet-title">Parent Settings</h2>
      <p class="sheet-text">The key is kept in memory for this session only and is sent to the pattern service when your child generates a picture.</p>
      <label class="field">
        <span class="field-label">Gemini API key</span>
        <input
          type="password"
          aria-label="Gemini API key"
          autocomplete="off"
          value={value}
          onInput={(event) => setValue(event.currentTarget.value)}
        />
      </label>
      <div class="dialog-actions">
        <button
          type="button"
          ref={saveRef}
          onClick={() => {
            if (value.length > 0) {
              onSaveKey(value);
              setValue("");
            }
          }}
        >
          Save Key
        </button>
        <button type="button" onClick={onForgetKey}>
          Forget Key
        </button>
      </div>
      <p class="sheet-text" role="status">
        {hasKey ? "A key is saved for this session." : "No key saved."}
      </p>
      <button type="button" class="sheet-done" aria-label="Done" onClick={onClose}>
        Done
      </button>
    </SheetBackdrop>
  );
}

export function GenerateSheet({
  onGenerate,
  onClose,
}: {
  onGenerate: (prompt: string, signal: AbortSignal) => Promise<void>;
  onClose: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [inFlight, setInFlight] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const start = async () => {
    if (inFlight) {
      return;
    }
    setInFlight(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await onGenerate(prompt, controller.signal);
    } finally {
      abortRef.current = null;
      setInFlight(false);
    }
  };
  const cancel = () => {
    const controller = abortRef.current;
    if (controller !== null) {
      controller.abort();
    } else {
      onClose();
    }
  };
  return (
    <SheetBackdrop label="Make a Pattern">
      <h2 class="sheet-title">Make a Pattern</h2>
      <label class="field">
        <span class="field-label">What should the pattern look like?</span>
        <textarea
          aria-label="What should the pattern look like?"
          rows={3}
          value={prompt}
          onInput={(event) => setPrompt(event.currentTarget.value)}
        />
      </label>
      <div role="group" aria-label="Pattern ideas">
        {PATTERN_IDEAS.map((idea) => (
          <button key={idea} type="button" class="big-choice" onClick={() => setPrompt(idea)}>
            <span>{idea}</span>
          </button>
        ))}
      </div>
      {inFlight && (
        <p class="sheet-text" role="status">
          Making your pattern…
        </p>
      )}
      <div class="dialog-actions">
        <button type="button" class="primary" aria-label="Generate" disabled={inFlight} onClick={() => void start()}>
          Generate
        </button>
        <button type="button" aria-label="Cancel" onClick={cancel}>
          Cancel
        </button>
      </div>
    </SheetBackdrop>
  );
}

type FieldKey =
  | "left"
  | "up"
  | "turn"
  | "size"
  | "wide"
  | "tall"
  | "see"
  | "cropLeft"
  | "cropTop"
  | "cropWide"
  | "cropTall";

const FIELDS: readonly { key: FieldKey; label: string; min: number; step: number; max?: number }[] = [
  { key: "left", label: "Left/Right", min: -10000, step: 1 },
  { key: "up", label: "Up/Down", min: -10000, step: 1 },
  { key: "turn", label: "Turn", min: -3600, step: 1 },
  { key: "size", label: "Size", min: 1, step: 1 },
  { key: "wide", label: "Wide", min: 1, step: 1 },
  { key: "tall", label: "Tall", min: 1, step: 1 },
  { key: "see", label: "See-through", min: 0, max: 100, step: 1 },
];

const CROP_FIELDS: readonly { key: FieldKey; label: string }[] = [
  { key: "cropLeft", label: "Left" },
  { key: "cropTop", label: "Top" },
  { key: "cropWide", label: "Wide" },
  { key: "cropTall", label: "Tall" },
];

function roundCrop(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function isDecalSolid(layer: Layer): boolean {
  return layer.kind === "solid" && layer.placement === "decal";
}

function fieldValue(layer: Layer, key: FieldKey): string {
  if (layer.kind === "cutout") {
    switch (key) {
      case "left":
        return String(Math.round(layer.rect.centerX));
      case "up":
        return String(Math.round(layer.rect.centerY));
      case "turn":
        return String(Math.round(layer.rect.rotationDeg));
      case "size":
        return String(Math.max(1, Math.round((layer.rect.width + layer.rect.height) / 2)));
      case "wide":
        return String(Math.round(layer.rect.width));
      case "tall":
        return String(Math.round(layer.rect.height));
      case "see":
        return "0";
      case "cropLeft":
      case "cropTop":
        return "0";
      case "cropWide":
      case "cropTall":
        return "1";
    }
  }
  const transform = layer.transform;
  switch (key) {
    case "left":
      return String(Math.round(transform.positionX));
    case "up":
      return String(Math.round(transform.positionY));
    case "turn":
      return String(Math.round(transform.rotationDeg));
    case "size":
      return isDecalSolid(layer)
        ? String(Math.max(1, Math.round((transform.scaleX + transform.scaleY) / 2)))
        : String(Math.round(((transform.scaleX + transform.scaleY) / 2) * 100));
    case "wide":
      return String(Math.round(transform.scaleX * 100));
    case "tall":
      return String(Math.round(transform.scaleY * 100));
    case "see":
      return String(Math.round(layer.opacity * 100));
    case "cropLeft":
      return roundCrop(transform.crop.x);
    case "cropTop":
      return roundCrop(transform.crop.y);
    case "cropWide":
      return roundCrop(transform.crop.width);
    case "cropTall":
      return roundCrop(transform.crop.height);
  }
}

export interface MoreSheetProps {
  layer: Layer;
  onTransformCommit: (patch: TransformPatch) => void;
  onOpacityCommit: (percent: number) => void;
  onCutoutCommit: (patch: Partial<CutoutRect>) => void;
  onClose: () => void;
}

function commitField(props: MoreSheetProps, key: FieldKey, value: number): void {
  if (props.layer.kind === "cutout") {
    const rect = props.layer.rect;
    switch (key) {
      case "left": props.onCutoutCommit({ centerX: value }); break;
      case "up": props.onCutoutCommit({ centerY: value }); break;
      case "turn": props.onCutoutCommit({ rotationDeg: value }); break;
      case "size": {
        if (value > 0) {
          const average = (rect.width + rect.height) / 2;
          const ratio = value / average;
          props.onCutoutCommit({ width: rect.width * ratio, height: rect.height * ratio });
        }
        break;
      }
      case "wide": if (value > 0) props.onCutoutCommit({ width: value }); break;
      case "tall": if (value > 0) props.onCutoutCommit({ height: value }); break;
      default: break;
    }
    return;
  }
  const transform = props.layer.transform;
  switch (key) {
    case "left":
      props.onTransformCommit({ positionX: value });
      break;
    case "up":
      props.onTransformCommit({ positionY: value });
      break;
    case "turn":
      props.onTransformCommit({ rotationDeg: value });
      break;
    case "size":
      if (value > 0) {
        if (props.layer.kind === "solid") {
          const average = (transform.scaleX + transform.scaleY) / 2;
          const ratio = value / average;
          props.onTransformCommit({ scaleX: transform.scaleX * ratio, scaleY: transform.scaleY * ratio });
        } else {
          props.onTransformCommit({ scaleX: value / 100, scaleY: value / 100 });
        }
      }
      break;
    case "wide":
      if (value > 0) {
        props.onTransformCommit({ scaleX: value / 100 });
      }
      break;
    case "tall":
      if (value > 0) {
        props.onTransformCommit({ scaleY: value / 100 });
      }
      break;
    case "see":
      props.onOpacityCommit(value);
      break;
    case "cropLeft":
    case "cropTop":
    case "cropWide":
    case "cropTall": {
      const crop = { ...transform.crop };
      if (key === "cropLeft") {
        crop.x = value;
      } else if (key === "cropTop") {
        crop.y = value;
      } else if (key === "cropWide") {
        crop.width = value;
      } else {
        crop.height = value;
      }
      if (isCropValid(crop)) {
        props.onTransformCommit({ crop });
      }
      break;
    }
  }
}

export function MoreSheet(props: MoreSheetProps) {
  const layer = props.layer;
  const [nonce, setNonce] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const form = formRef.current;
    if (form === null) {
      return;
    }
    const keys: readonly FieldKey[] = [...FIELDS, ...CROP_FIELDS].map((field) => field.key);
    for (const key of keys) {
      const input = form.querySelector<HTMLInputElement>(`[data-field="${key}"]`);
      const expected = fieldValue(layer, key);
      if (input !== null && input.value !== expected) {
        input.value = expected;
      }
    }
  }, [layer, nonce]);

  const onCommit = (key: FieldKey) => (event: JSX.TargetedEvent<HTMLInputElement>) => {
    const raw = Number(event.currentTarget.value);
    if (Number.isFinite(raw)) {
      commitField(props, key, raw);
    }
    setNonce((value) => value + 1);
  };

  const visibleFields = layer.kind === "solid"
    ? isDecalSolid(layer)
      ? FIELDS.filter((field) => field.key !== "wide" && field.key !== "tall")
      : FIELDS.filter((field) => field.key === "see")
    : layer.kind === "cutout"
      ? FIELDS.filter((field) => ["left", "up", "turn", "size"].includes(field.key))
      : FIELDS;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") props.onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [props.onClose]);

  return (
    <SheetBackdrop label="More" onDismiss={props.onClose} sheetClass="more-sheet">
      <h2 class="sheet-title">More</h2>
      <form class="more-form" ref={formRef} onSubmit={(event) => event.preventDefault()}>
        {visibleFields.map((field) => (
          <label key={field.key} class="field">
            <span class="field-label">{field.label}</span>
            <input
              type="number"
              data-field={field.key}
              aria-label={field.label}
              min={field.min}
              max={field.max}
              step={field.step}
              defaultValue={fieldValue(layer, field.key)}
              onChange={onCommit(field.key)}
            />
          </label>
        ))}
        {layer.kind === "raster" && (
          <>
            <h3 class="field-group">Crop</h3>
            {CROP_FIELDS.map((field) => (
              <label key={field.key} class="field">
                <span class="field-label">{field.label}</span>
                <input
                  type="number"
                  data-field={field.key}
                  aria-label={`Crop ${field.label}`}
                  min={0}
                  max={1}
                  step={0.01}
                  defaultValue={fieldValue(layer, field.key)}
                  onChange={onCommit(field.key)}
                />
              </label>
            ))}
          </>
        )}
      </form>
      <button type="button" class="sheet-done more-sheet-done" aria-label="Done" onClick={props.onClose}>
        Done
      </button>
    </SheetBackdrop>
  );
}
