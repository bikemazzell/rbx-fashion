import type { GarmentType } from "../../domain/types";

const CARDS: readonly { garment: GarmentType; label: string }[] = [
  { garment: "tshirt", label: "T-Shirt" },
  { garment: "shirt", label: "Shirt" },
  { garment: "pants", label: "Pants" },
];

export function StartScreen({ onChoose }: { onChoose: (garment: GarmentType) => void }) {
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
          </button>
        ))}
      </div>
    </main>
  );
}
