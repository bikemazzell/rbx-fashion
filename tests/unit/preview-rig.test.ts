import { expect, test } from "vitest";
import type { BoxGeometry, PlaneGeometry } from "three";
import { getTemplate } from "../../src/domain/registry";
import type { AtlasRegistryEntry, Face, UVQuad } from "../../src/domain/types";
import { R6_MEASUREMENTS } from "../../src/preview/measurements";
import { buildPreviewRig } from "../../src/preview/rig";

const BOX_FACE_ORDER: readonly Face[] = ["right", "left", "up", "down", "back", "front"];

const FACE_NORMAL: Readonly<Record<Face, [number, number, number]>> = {
  front: [0, 0, -1],
  back: [0, 0, 1],
  right: [1, 0, 0],
  left: [-1, 0, 0],
  up: [0, 1, 0],
  down: [0, -1, 0],
};

const AUTHORED_ATLAS_UP: Readonly<Record<Face, [number, number, number]>> = {
  front: [0, 1, 0],
  back: [0, 1, 0],
  right: [0, 1, 0],
  left: [0, 1, 0],
  up: [0, 0, 1],
  down: [0, 0, -1],
};

type Vec3 = readonly [number, number, number];

function cross(a: Vec3, b: Vec3): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function atlasEntry(garment: "shirt" | "pants"): AtlasRegistryEntry {
  const entry = getTemplate(garment);
  if (entry.garment === "tshirt") {
    throw new Error(`expected atlas entry for ${garment}`);
  }
  return entry;
}

function bindingQuad(garment: "shirt" | "pants", bodyPart: string, face: Face): UVQuad {
  const binding = atlasEntry(garment).previewBindings.find(
    (candidate) =>
      candidate.rig === "R6" &&
      candidate.projection === "wrapped-face" &&
      candidate.bodyPart === bodyPart &&
      candidate.face === face,
  );
  if (binding === undefined) {
    throw new Error(`missing R6 wrapped-face binding ${bodyPart}.${face} for ${garment}`);
  }
  return binding.uv;
}

function measuredPart(name: string): { size: [number, number, number]; position: [number, number, number] } {
  const part = R6_MEASUREMENTS.parts.find((candidate) => candidate.name === name);
  if (part === undefined) {
    throw new Error(`missing measurement part ${name}`);
  }
  return { size: part.size, position: part.position };
}

function vertexPosition(geometry: BoxGeometry | PlaneGeometry, index: number): [number, number, number] {
  const attribute = geometry.getAttribute("position");
  return [attribute.getX(index), attribute.getY(index), attribute.getZ(index)];
}

function vertexUv(geometry: BoxGeometry | PlaneGeometry, index: number): [number, number] {
  const attribute = geometry.getAttribute("uv");
  return [attribute.getX(index), attribute.getY(index)];
}

function expectedCornerIndex(
  position: Vec3,
  center: Vec3,
  face: Face,
): 0 | 1 | 2 | 3 {
  const up = AUTHORED_ATLAS_UP[face];
  const right = cross(up, FACE_NORMAL[face]);
  const relative: [number, number, number] = [
    position[0] - center[0],
    position[1] - center[1],
    position[2] - center[2],
  ];
  const screenX = dot(relative, right);
  const screenY = dot(relative, up);
  if (screenX < 0 && screenY > 0) return 3;
  if (screenX > 0 && screenY > 0) return 2;
  if (screenX < 0 && screenY < 0) return 0;
  if (screenX > 0 && screenY < 0) return 1;
  throw new Error(`vertex sits on a face axis boundary for ${face}`);
}

function expectFaceUv(
  geometry: BoxGeometry,
  partName: string,
  faceIndex: number,
  face: Face,
  quad: UVQuad,
): void {
  const center = measuredPart(partName).position;
  for (let slot = 0; slot < 4; slot += 1) {
    const vertexIndex = faceIndex * 4 + slot;
    const cornerIndex = expectedCornerIndex(vertexPosition(geometry, vertexIndex), center, face);
    const expected = quad[cornerIndex];
    if (expected === undefined) {
      throw new Error(`quad corner ${cornerIndex} missing`);
    }
    const actual = vertexUv(geometry, vertexIndex);
    expect(
      actual[0],
      `${partName}.${face} slot ${slot} u: got ${actual[0]} expected ${expected[0]}`,
    ).toBeCloseTo(expected[0], 6);
    expect(
      actual[1],
      `${partName}.${face} slot ${slot} v: got ${actual[1]} expected ${expected[1]}`,
    ).toBeCloseTo(expected[1], 6);
  }
}

test("inferred measurements table matches the spec values exactly", () => {
  expect(R6_MEASUREMENTS.source).toBe("inferred");
  expect(R6_MEASUREMENTS.studioVersion).toBeNull();
  expect(R6_MEASUREMENTS.capturedOn).toBeNull();
  expect(R6_MEASUREMENTS.note.toLowerCase()).toContain("uncalibrated");
  expect(R6_MEASUREMENTS.parts).toHaveLength(7);
  expect(R6_MEASUREMENTS.parts.map((part) => [part.name, part.size, part.position, part.rendered])).toEqual([
    ["HumanoidRootPart", [2, 2, 1], [0, 0, 0], false],
    ["Torso", [2, 2, 1], [0, 0, 0], true],
    ["Head", [2, 1, 1], [0, 1.5, 0], true],
    ["Right Arm", [1, 2, 1], [1.5, 0, 0], true],
    ["Left Arm", [1, 2, 1], [-1.5, 0, 0], true],
    ["Right Leg", [1, 2, 1], [0.5, -2, 0], true],
    ["Left Leg", [1, 2, 1], [-0.5, -2, 0], true],
  ]);
});

for (const garment of ["shirt", "pants"] as const) {
  test(`${garment} clothing geometry carries the registry quad on every part face under the authored orientation`, () => {
    const rig = buildPreviewRig(garment);
    expect(rig.clothingParts.length).toBeGreaterThan(0);
    for (const part of rig.clothingParts) {
      for (const [faceIndex, face] of BOX_FACE_ORDER.entries()) {
        expectFaceUv(part.geometry, part.name, faceIndex, face, bindingQuad(garment, part.name, face));
      }
    }
  });
}

test("orientation outcomes: torso front/up/down top-left vertex carries the atlas top-left corner uv", () => {
  const rig = buildPreviewRig("shirt");
  const torso = rig.clothingParts.find((part) => part.name === "Torso");
  if (torso === undefined) {
    throw new Error("missing torso clothing part");
  }
  const panels = new Map(
    atlasEntry("shirt").panels.map((panel) => [`${panel.component}.${panel.face}`, panel] as const),
  );
  for (const [face, panelId] of [
    ["front", "torso.front"],
    ["up", "torso.up"],
    ["down", "torso.down"],
  ] as const) {
    const panel = panels.get(panelId);
    if (panel === undefined) {
      throw new Error(`missing panel ${panelId}`);
    }
    const faceIndex = BOX_FACE_ORDER.indexOf(face);
    const center = measuredPart("Torso").position;
    const up = AUTHORED_ATLAS_UP[face];
    const right = cross(up, FACE_NORMAL[face]);
    let topLeftUv: [number, number] | null = null;
    for (let slot = 0; slot < 4; slot += 1) {
      const position = vertexPosition(torso.geometry, faceIndex * 4 + slot);
      const relative: [number, number, number] = [
        position[0] - center[0],
        position[1] - center[1],
        position[2] - center[2],
      ];
      if (dot(relative, right) < 0 && dot(relative, up) > 0) {
        topLeftUv = vertexUv(torso.geometry, faceIndex * 4 + slot);
      }
    }
    if (topLeftUv === null) {
      throw new Error(`no top-left vertex found for torso ${face}`);
    }
    expect(topLeftUv[0]).toBeCloseTo(panel.atlasRect.x / 585, 6);
    expect(topLeftUv[1]).toBeCloseTo(1 - panel.atlasRect.y / 559, 6);
  }
});

test("winding is outward on every triangle of every box geometry face", () => {
  for (const garment of ["shirt", "pants", "tshirt"] as const) {
    const rig = buildPreviewRig(garment);
    const parts = [...rig.baseParts, ...rig.clothingParts];
    expect(parts.length).toBeGreaterThan(0);
    for (const part of parts) {
      const { size } = measuredPart(part.name);
      const index = part.geometry.getIndex();
      if (index === null) {
        throw new Error(`${part.name} geometry is not indexed`);
      }
      for (const [faceIndex, face] of BOX_FACE_ORDER.entries()) {
        const normal = FACE_NORMAL[face];
        const axis = normal.findIndex((component) => component !== 0);
        if (axis === -1) {
          throw new Error("bad face normal");
        }
        const halfExtent = (size[axis] ?? 0) / 2;
        const outward: [number, number, number] = [
          normal[0] * halfExtent,
          normal[1] * halfExtent,
          normal[2] * halfExtent,
        ];
        for (let triangle = 0; triangle < 2; triangle += 1) {
          const base = faceIndex * 6 + triangle * 3;
          const a = vertexPosition(part.geometry, index.getX(base));
          const b = vertexPosition(part.geometry, index.getX(base + 1));
          const c = vertexPosition(part.geometry, index.getX(base + 2));
          const ab: [number, number, number] = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
          const ac: [number, number, number] = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
          expect(
            dot(cross(ab, ac), outward),
            `${garment} ${part.name}.${face} triangle ${triangle}`,
          ).toBeGreaterThan(0);
        }
      }
    }
  }
});

test("coverage sets: shirt wraps torso and arms, pants wraps torso and legs, boxes coincide with base parts", () => {
  const shirt = buildPreviewRig("shirt");
  expect(shirt.clothingParts.map((part) => part.name).sort()).toEqual(["Left Arm", "Right Arm", "Torso"]);
  const pants = buildPreviewRig("pants");
  expect(pants.clothingParts.map((part) => part.name).sort()).toEqual(["Left Leg", "Right Leg", "Torso"]);
  for (const rig of [shirt, pants]) {
    expect(rig.baseParts.map((part) => part.name)).toEqual([
      "Torso",
      "Head",
      "Right Arm",
      "Left Arm",
      "Right Leg",
      "Left Leg",
    ]);
    for (const clothing of rig.clothingParts) {
      const { size, position } = measuredPart(clothing.name);
      expect(clothing.geometry.parameters.width).toBe(size[0]);
      expect(clothing.geometry.parameters.height).toBe(size[1]);
      expect(clothing.geometry.parameters.depth).toBe(size[2]);
      for (let vertex = 0; vertex < 24; vertex += 1) {
        const point = vertexPosition(clothing.geometry, vertex);
        expect(Math.abs(point[0] - position[0]), `${clothing.name} x`).toBeLessThanOrEqual(size[0] / 2);
        expect(Math.abs(point[1] - position[1]), `${clothing.name} y`).toBeLessThanOrEqual(size[1] / 2);
        expect(Math.abs(point[2] - position[2]), `${clothing.name} z`).toBeLessThanOrEqual(size[2] / 2);
      }
    }
  }
});

test("tshirt rig has no clothing boxes and a 2x2 decal plane facing -Z at z=-0.5 with upright unit quad uvs", () => {
  const rig = buildPreviewRig("tshirt");
  expect(rig.clothingParts).toEqual([]);
  const decal = rig.decal;
  if (decal === undefined) {
    throw new Error("missing tshirt decal");
  }
  const index = decal.geometry.getIndex();
  if (index === null) {
    throw new Error("decal geometry is not indexed");
  }
  expect(index.count).toBe(6);
  const positions: [number, number, number][] = [];
  for (let vertex = 0; vertex < 4; vertex += 1) {
    positions.push(vertexPosition(decal.geometry, vertex));
  }
  for (const position of positions) {
    expect(position[2]).toBeCloseTo(-0.5, 10);
  }
  const xs = positions.map((position) => position[0]);
  const ys = positions.map((position) => position[1]);
  expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(2, 10);
  expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(2, 10);
  const normalAttribute = decal.geometry.getAttribute("normal");
  for (let vertex = 0; vertex < 4; vertex += 1) {
    expect(normalAttribute.getX(vertex)).toBeCloseTo(0, 10);
    expect(normalAttribute.getY(vertex)).toBeCloseTo(0, 10);
    expect(normalAttribute.getZ(vertex)).toBeCloseTo(-1, 10);
  }
  for (const [position, expectedUv] of [
    [[1, 1], [0, 1]],
    [[-1, 1], [1, 1]],
    [[1, -1], [0, 0]],
    [[-1, -1], [1, 0]],
  ] as const) {
    const vertex = positions.findIndex(
      (candidate) => candidate[0] === position[0] && candidate[1] === position[1],
    );
    if (vertex === -1) {
      throw new Error(`missing decal vertex at ${position.join(",")}`);
    }
    expect(vertexUv(decal.geometry, vertex)).toEqual([expectedUv[0], expectedUv[1]]);
  }
});

test("head never receives clothing geometry", () => {
  for (const garment of ["shirt", "pants", "tshirt"] as const) {
    const rig = buildPreviewRig(garment);
    expect(rig.clothingParts.map((part) => part.name)).not.toContain("Head");
    expect(rig.baseParts.map((part) => part.name)).toContain("Head");
  }
});
