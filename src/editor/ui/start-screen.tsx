import type { GarmentType } from "../../domain/types";

const CARDS: readonly { garment: GarmentType; label: string; description: string }[] = [
  { garment: "tshirt", label: "T-Shirt", description: "A picture on the front" },
  { garment: "shirt", label: "Shirt", description: "Wraps the body and arms" },
  { garment: "pants", label: "Pants", description: "Covers the waist and legs" },
];

export function StartScreen({
  onChoose,
  onOpen,
  notice,
  onParentSettings,
}: {
  onChoose: (garment: GarmentType) => void;
  onOpen: () => void;
  notice: string | null;
  onParentSettings?: () => void;
}) {
  return (
    <main class="start-screen">
      <h1>Roblox Clothing Designer</h1>
      <p class="start-tagline">Make clothes for your Roblox character.</p>
      <div class="garment-cards">
        {CARDS.map((card) => (
          <button
            key={card.garment}
            type="button"
            class="garment-card"
            aria-label={card.label}
            onClick={() => onChoose(card.garment)}
          >
            <span class={`garment-shape garment-shape-${card.garment}`} aria-hidden="true" />
            <span class="garment-card-label">{card.label}</span>
            <span class="garment-card-description">{card.description}</span>
          </button>
        ))}
      </div>
      <button
        type="button"
        class="start-open-button"
        aria-label="Open Saved Project"
        onClick={onOpen}
      >
        Open Saved Project
      </button>
      {notice !== null && (
        <p class="start-notice" role="status">
          {notice}
        </p>
      )}
      {onParentSettings !== undefined && (
        <footer class="start-footer">
          <button type="button" class="start-footer-button" aria-label="Parent Settings" onClick={onParentSettings}>
            Parent Settings
          </button>
        </footer>
      )}
    </main>
  );
}
