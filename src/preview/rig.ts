import { BoxGeometry, PlaneGeometry } from "three";
import { getTemplate } from "../domain/registry";
import type { Face, GarmentType, UVQuad } from "../domain/types";
import { R6_MEASUREMENTS } from "./measurements";

export interface RigPart {
  name: string;
  geometry: BoxGeometry;
}

export interface PreviewRig {
  baseParts: readonly RigPart[];
  clothingParts: readonly RigPart[];
  decal?: { geometry: PlaneGeometry };
}

const FACE_INDEX: Readonly<Record<Face, number>> = {
  right: 0,
  left: 1,
  up: 2,
  down: 3,
  back: 4,
  front: 5,
};

const SIDE_SLOTS: readonly [number, number, number, number] = [3, 2, 0, 1];
const CAP_SLOTS: readonly [number, number, number, number] = [1, 0, 2, 3];

function assignQuad(
  geometry: BoxGeometry | PlaneGeometry,
  quad: UVQuad,
  slots: readonly [number, number, number, number],
  vertexBase: number,
): void {
  const attribute = geometry.getAttribute("uv");
  for (let slot = 0; slot < 4; slot += 1) {
    const quadIndex = slots[slot];
    const corner = quadIndex === undefined ? undefined : quad[quadIndex];
    if (corner === undefined) {
      throw new Error(`uv quad corner ${String(quadIndex)} missing`);
    }
    attribute.setXY(vertexBase + slot, corner[0], corner[1]);
  }
  attribute.needsUpdate = true;
}

function assignFaceQuad(geometry: BoxGeometry, face: Face, quad: UVQuad): void {
  const slots = face === "up" || face === "down" ? CAP_SLOTS : SIDE_SLOTS;
  assignQuad(geometry, quad, slots, FACE_INDEX[face] * 4);
}

function baseGeometry(part: { size: [number, number, number]; position: [number, number, number] }): BoxGeometry {
  const geometry = new BoxGeometry(part.size[0], part.size[1], part.size[2]);
  geometry.translate(part.position[0], part.position[1], part.position[2]);
  return geometry;
}

export function buildPreviewRig(garment: GarmentType): PreviewRig {
  const template = getTemplate(garment);
  const baseParts = R6_MEASUREMENTS.parts
    .filter((part) => part.rendered)
    .map((part) => ({ name: part.name, geometry: baseGeometry(part) }));

  const clothingParts: RigPart[] = [];
  const clothedNames: string[] = [];
  for (const binding of template.previewBindings) {
    if (binding.rig !== "R6" || binding.projection !== "wrapped-face") {
      continue;
    }
    if (!clothedNames.includes(binding.bodyPart)) {
      clothedNames.push(binding.bodyPart);
    }
  }
  for (const name of clothedNames) {
    const part = R6_MEASUREMENTS.parts.find((candidate) => candidate.name === name);
    if (part === undefined) {
      continue;
    }
    const geometry = baseGeometry(part);
    for (const face of Object.keys(FACE_INDEX) as Face[]) {
      const binding = template.previewBindings.find(
        (candidate) =>
          candidate.rig === "R6" &&
          candidate.projection === "wrapped-face" &&
          candidate.bodyPart === name &&
          candidate.face === face,
      );
      if (binding !== undefined) {
        assignFaceQuad(geometry, face, binding.uv);
      }
    }
    clothingParts.push({ name, geometry });
  }

  if (garment !== "tshirt") {
    return { baseParts, clothingParts };
  }

  const decalBinding = template.previewBindings.find(
    (candidate) =>
      candidate.rig === "R6" && candidate.projection === "front-graphic" && candidate.targetId === "torso-graphic",
  );
  if (decalBinding === undefined) {
    return { baseParts, clothingParts };
  }
  const decalGeometry = new PlaneGeometry(2, 2);
  decalGeometry.rotateY(Math.PI);
  decalGeometry.translate(0, 0, -0.5);
  assignQuad(decalGeometry, decalBinding.uv, SIDE_SLOTS, 0);
  return { baseParts, clothingParts, decal: { geometry: decalGeometry } };
}
