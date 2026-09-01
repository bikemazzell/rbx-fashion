import type { GarmentType, ProjectDocument } from "./types";

const DEFAULT_NAMES: Readonly<Record<GarmentType, string>> = {
  tshirt: "My T-shirt",
  shirt: "My Shirt",
  pants: "My Pants",
};

export function createProject(type: GarmentType, name?: string): ProjectDocument {
  return {
    format: "rbx-fashion-project",
    schemaVersion: 3,
    name: name ?? DEFAULT_NAMES[type],
    garmentType: type,
    layers: [],
    assets: [],
  };
}
