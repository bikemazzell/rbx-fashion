import type { GarmentType, ProjectDocumentV1 } from "./types";

const DEFAULT_NAMES: Readonly<Record<GarmentType, string>> = {
  tshirt: "My T-shirt",
  shirt: "My Shirt",
  pants: "My Pants",
};

export function createProject(type: GarmentType, name?: string): ProjectDocumentV1 {
  return {
    format: "rbx-fashion-project",
    schemaVersion: 1,
    name: name ?? DEFAULT_NAMES[type],
    garmentType: type,
    layers: [],
    assets: [],
  };
}
