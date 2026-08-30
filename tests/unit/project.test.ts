import { expect, test } from "vitest";
import { createProject } from "../../src/domain/project";
import type { AssetManifestEntry, ClothingBodyPart, PlacementMode } from "../../src/domain/types";

const PLACEMENT_MODES: readonly PlacementMode[] = ["decal", "pattern", "full-map"];

const BODY_PARTS: readonly ClothingBodyPart[] = [
  "Torso",
  "Left Arm",
  "Right Arm",
  "Left Leg",
  "Right Leg",
  "UpperTorso",
  "LowerTorso",
  "LeftUpperArm",
  "LeftLowerArm",
  "LeftHand",
  "RightUpperArm",
  "RightLowerArm",
  "RightHand",
  "LeftUpperLeg",
  "LeftLowerLeg",
  "LeftFoot",
  "RightUpperLeg",
  "RightLowerLeg",
  "RightFoot",
];

test("PlacementMode uses the internal decal/pattern/full-map literals", () => {
  expect(PLACEMENT_MODES).toHaveLength(3);
});

test("ClothingBodyPart is exactly the 19 documented members", () => {
  expect(BODY_PARTS).toHaveLength(19);
  expect(BODY_PARTS).not.toContain("Head");
});

test("AssetManifestEntry is metadata-only with a normalized asset path", () => {
  const entry: AssetManifestEntry = {
    id: "asset-1",
    path: "assets/asset-1.png",
    originalName: "cat.png",
    sourceMimeType: "image/png",
    byteLength: 12,
    width: 4,
    height: 4,
    sha256: "abc123",
    source: "imported",
  };
  expect(entry.path.endsWith(".png")).toBe(true);
  expect("bytes" in entry).toBe(false);
});

test.each([
  ["tshirt", "My T-shirt"],
  ["shirt", "My Shirt"],
  ["pants", "My Pants"],
] as const)("createProject(%s) uses default name %s", (type, name) => {
  const project = createProject(type);
  expect(project.format).toBe("rbx-fashion-project");
  expect(project.schemaVersion).toBe(2);
  expect(project.name).toBe(name);
  expect(project.garmentType).toBe(type);
  expect(project.layers).toEqual([]);
  expect(project.assets).toEqual([]);
});

test("createProject honors a given name", () => {
  expect(createProject("shirt", "Vacation Fit").name).toBe("Vacation Fit");
  expect(createProject("tshirt", "X").garmentType).toBe("tshirt");
  expect(createProject("pants", "Y").layers).toEqual([]);
});

test("createProject returns independent documents", () => {
  const first = createProject("shirt");
  const second = createProject("shirt");
  expect(first.layers).not.toBe(second.layers);
  expect(first.assets).not.toBe(second.assets);
});
