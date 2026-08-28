import type { Layer } from "../../domain/types";
import { IconDown, IconDuplicate, IconEye, IconEyeOff, IconTrash, IconUp } from "./icons";

export interface ItemsPanelProps {
  layersTopFirst: readonly Layer[];
  selectedItemId: string | null;
  onSelect: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onToggleVisibility: (id: string) => void;
  onDuplicate: (id: string) => void;
  onReorder: (id: string, delta: 1 | -1) => void;
  onDelete: (id: string) => void;
}

function renameHandler(props: ItemsPanelProps, layer: Layer, value: string): void {
  props.onRename(layer.id, value);
}

export function ItemsPanel(props: ItemsPanelProps) {
  const count = props.layersTopFirst.length;
  if (count === 0) {
    return <p class="items-empty">No items yet. Tap Add to begin.</p>;
  }
  return (
    <ul class="items-list">
      {props.layersTopFirst.map((layer, displayIndex) => {
        const zIndex = count - 1 - displayIndex;
        const upDisabled = zIndex === count - 1;
        const downDisabled = zIndex === 0;
        return (
          <li
            key={layer.id}
            class="item-row"
            data-selected={layer.id === props.selectedItemId}
            aria-current={layer.id === props.selectedItemId ? "true" : undefined}
            onClick={() => props.onSelect(layer.id)}
          >
            <input
              class="item-name"
              key={`${layer.id}:${layer.name}`}
              type="text"
              defaultValue={layer.name}
              aria-label="Item name"
              onBlur={(event) => renameHandler(props, layer, event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  renameHandler(props, layer, event.currentTarget.value);
                }
              }}
            />
            <button
              type="button"
              class="item-tool item-tool-visibility"
              aria-label={layer.visible ? "Hide" : "Show"}
              aria-pressed={layer.visible}
              onClick={() => props.onToggleVisibility(layer.id)}
            >
              {layer.visible ? <IconEye /> : <IconEyeOff />}
            </button>
            <button
              type="button"
              class="item-tool item-tool-copy"
              aria-label="Copy item"
              onClick={() => props.onDuplicate(layer.id)}
            >
              <IconDuplicate />
              <span class="item-tool-label">Copy</span>
            </button>
            <button
              type="button"
              class="item-tool"
              aria-label="Move Up"
              disabled={upDisabled}
              aria-disabled={upDisabled ? "true" : "false"}
              onClick={() => props.onReorder(layer.id, 1)}
            >
              <IconUp />
            </button>
            <button
              type="button"
              class="item-tool"
              aria-label="Move Down"
              disabled={downDisabled}
              aria-disabled={downDisabled ? "true" : "false"}
              onClick={() => props.onReorder(layer.id, -1)}
            >
              <IconDown />
            </button>
            <button
              type="button"
              class="item-tool item-tool-delete"
              aria-label="Delete"
              onClick={() => props.onDelete(layer.id)}
            >
              <IconTrash />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
