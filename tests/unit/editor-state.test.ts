import { expect, test } from "vitest";
import { createProject } from "../../src/domain/project";
import type { PaintLayer } from "../../src/domain/types";
import { createSession, dispatch } from "../../src/editor/state";
import type {
  EditorSession,
  GestureMutation,
  ItemSpec,
  TransformPatch,
} from "../../src/editor/state";

const rasterSpec: ItemSpec = {
  kind: "raster",
  assetId: "asset-1",
  placement: "decal",
  transform: {
    positionX: 256,
    positionY: 256,
    rotationDeg: 0,
    scaleX: 1,
    scaleY: 1,
    crop: { x: 0, y: 0, width: 1, height: 1 },
  },
};

const solidSpec: ItemSpec = { kind: "solid", color: "#ff0000" };

function makeIds(): () => string {
  let n = 0;
  return () => `layer-${++n}`;
}

function add(s: EditorSession, item: ItemSpec, ids: () => string): EditorSession {
  return dispatch(s, { type: "add-item", item }, ids);
}

function addRaster(s: EditorSession, ids: () => string): EditorSession {
  return add(s, rasterSpec, ids);
}

function addPictures(s: EditorSession, ids: () => string, count: number): EditorSession {
  let next = s;
  for (let i = 0; i < count; i += 1) {
    next = addRaster(next, ids);
  }
  return next;
}

function layerAt(s: EditorSession, index: number): PaintLayer {
  const layer = s.document.layers[index];
  if (layer === undefined || layer.kind === "cutout") {
    throw new Error(`no paint layer at index ${index}`);
  }
  return layer;
}

test("createSession wraps createProject with clean history", () => {
  const session = createSession("shirt", "Vacation Fit");
  expect(session.document).toEqual(createProject("shirt", "Vacation Fit"));
  expect(session.undo).toEqual([]);
  expect(session.redo).toEqual([]);
  expect(session.pending).toBeNull();
  expect(session.dirty).toBe(false);
});

test("createSession defaults the document name", () => {
  expect(createSession("tshirt").document.name).toBe("My T-shirt");
});

test("add-item raster appends a fully formed Picture layer", () => {
  const ids = makeIds();
  const session = addRaster(createSession("shirt"), ids);
  expect(layerAt(session, 0)).toEqual({
    id: "layer-1",
    name: "Picture 1",
    kind: "raster",
    assetId: "asset-1",
    visible: true,
    opacity: 1,
    placement: "decal",
    transform: rasterSpec.transform,
  });
  expect(session.undo).toEqual([createProject("shirt")]);
  expect(session.dirty).toBe(true);
});

test("add-item solid appends a Color layer covering the garment", () => {
  const ids = makeIds();
  const session = add(createSession("pants"), solidSpec, ids);
  const layer = layerAt(session, 0);
  expect(layer.name).toBe("Color 1");
  expect(layer.kind).toBe("solid");
  expect(layer.color).toBe("#ff0000");
  expect(layer.placement).toBe("pattern");
  expect(layer.visible).toBe(true);
  expect(layer.opacity).toBe(1);
});

test("eight adds succeed; the ninth is rejected unchanged including history", () => {
  const ids = makeIds();
  const full = addPictures(createSession("shirt"), ids, 8);
  expect(full.document.layers).toHaveLength(8);
  expect(full.document.layers.map((layer) => layer.name)).toEqual([
    "Picture 1",
    "Picture 2",
    "Picture 3",
    "Picture 4",
    "Picture 5",
    "Picture 6",
    "Picture 7",
    "Picture 8",
  ]);
  const rejected = dispatch(full, { type: "add-item", item: rasterSpec }, ids);
  expect(rejected).toEqual(full);
});

test("duplicate-item is rejected at the eight-layer cap and for unknown ids", () => {
  const ids = makeIds();
  const full = addPictures(createSession("shirt"), ids, 8);
  expect(dispatch(full, { type: "duplicate-item", id: "layer-1" }, ids)).toEqual(full);
  const single = addRaster(createSession("shirt"), ids);
  expect(dispatch(single, { type: "duplicate-item", id: "nope" }, ids)).toEqual(single);
});

test("duplicate-item copies content with a new id and monotonic name", () => {
  const ids = makeIds();
  let session = addRaster(createSession("shirt"), ids);
  session = dispatch(session, { type: "set-opacity", id: "layer-1", opacity: 0.5 }, ids);
  session = dispatch(session, { type: "toggle-visibility", id: "layer-1" }, ids);
  session = dispatch(
    session,
    { type: "patch-transform", id: "layer-1", patch: { positionX: 42, positionY: 43 } },
    ids,
  );
  const duplicated = dispatch(session, { type: "duplicate-item", id: "layer-1" }, ids);
  expect(duplicated.document.layers).toHaveLength(2);
  const copy = layerAt(duplicated, 1);
  expect(copy.id).toBe("layer-2");
  expect(copy.name).toBe("Picture 2");
  expect(copy.kind).toBe("raster");
  expect(copy.assetId).toBe("asset-1");
  expect(copy.placement).toBe("decal");
  expect(copy.opacity).toBe(0.5);
  expect(copy.visible).toBe(false);
  expect(copy.transform).toEqual({ ...rasterSpec.transform, positionX: 42, positionY: 43 });
  expect(duplicated.undo).toHaveLength(5);
});

test("duplicate-item on solid keeps kind and color with Color naming", () => {
  const ids = makeIds();
  const session = add(createSession("shirt"), solidSpec, ids);
  const duplicated = dispatch(session, { type: "duplicate-item", id: "layer-1" }, ids);
  const copy = layerAt(duplicated, 1);
  expect(copy.name).toBe("Color 2");
  expect(copy.kind).toBe("solid");
  expect(copy.color).toBe("#ff0000");
  expect(copy.id).toBe("layer-2");
});

test("rename-item trims and accepts names up to 40 characters", () => {
  const ids = makeIds();
  const session = addRaster(createSession("shirt"), ids);
  const renamed = dispatch(session, { type: "rename-item", id: "layer-1", name: "  Kitty  " }, ids);
  expect(layerAt(renamed, 0).name).toBe("Kitty");
  const forty = "x".repeat(40);
  const atLimit = dispatch(renamed, { type: "rename-item", id: "layer-1", name: forty }, ids);
  expect(layerAt(atLimit, 0).name).toBe(forty);
  expect(atLimit.undo).toHaveLength(3);
});

test("rename-item to the same name is a no-op without history", () => {
  const ids = makeIds();
  let session = addRaster(createSession("shirt"), ids);
  session = dispatch(session, { type: "rename-item", id: "layer-1", name: "Kitty" }, ids);
  const same = dispatch(session, { type: "rename-item", id: "layer-1", name: "Kitty" }, ids);
  const padded = dispatch(session, { type: "rename-item", id: "layer-1", name: "  Kitty  " }, ids);
  expect(same).toEqual(session);
  expect(padded).toEqual(session);
  expect(same.undo).toHaveLength(2);
});

test("rename-item rejects empty, whitespace, oversized, and unknown ids", () => {
  const ids = makeIds();
  const session = addRaster(createSession("shirt"), ids);
  const invalid = ["", "   ", "x".repeat(41), ` ${"x".repeat(41)} `];
  for (const name of invalid) {
    expect(dispatch(session, { type: "rename-item", id: "layer-1", name }, ids)).toEqual(session);
  }
  expect(dispatch(session, { type: "rename-item", id: "nope", name: "Kitty" }, ids)).toEqual(session);
});

test("reorder-item clamps to both ends", () => {
  const ids = makeIds();
  const session = addPictures(createSession("shirt"), ids, 3);
  const high = dispatch(session, { type: "reorder-item", id: "layer-1", toIndex: 99 }, ids);
  expect(high.document.layers.map((layer) => layer.id)).toEqual(["layer-2", "layer-3", "layer-1"]);
  const low = dispatch(high, { type: "reorder-item", id: "layer-1", toIndex: -5 }, ids);
  expect(low.document.layers.map((layer) => layer.id)).toEqual(["layer-1", "layer-2", "layer-3"]);
});

test("reorder-item rejects unknown ids and non-finite indices", () => {
  const ids = makeIds();
  const session = addPictures(createSession("shirt"), ids, 2);
  expect(dispatch(session, { type: "reorder-item", id: "nope", toIndex: 0 }, ids)).toEqual(session);
  expect(
    dispatch(session, { type: "reorder-item", id: "layer-1", toIndex: Number.NaN }, ids),
  ).toEqual(session);
});

test("toggle-visibility flips and rejects unknown ids", () => {
  const ids = makeIds();
  const session = addRaster(createSession("shirt"), ids);
  const toggled = dispatch(session, { type: "toggle-visibility", id: "layer-1" }, ids);
  expect(layerAt(toggled, 0).visible).toBe(false);
  const back = dispatch(toggled, { type: "toggle-visibility", id: "layer-1" }, ids);
  expect(layerAt(back, 0).visible).toBe(true);
  expect(dispatch(session, { type: "toggle-visibility", id: "nope" }, ids)).toEqual(session);
});

test("delete-item removes the layer and rejects unknown ids", () => {
  const ids = makeIds();
  const session = addPictures(createSession("shirt"), ids, 2);
  const reduced = dispatch(session, { type: "delete-item", id: "layer-1" }, ids);
  expect(reduced.document.layers.map((layer) => layer.id)).toEqual(["layer-2"]);
  expect(reduced.undo).toHaveLength(3);
  expect(dispatch(session, { type: "delete-item", id: "nope" }, ids)).toEqual(session);
});

test("counters stay monotonic across deletes", () => {
  const ids = makeIds();
  let session = addRaster(createSession("shirt"), ids);
  session = dispatch(session, { type: "delete-item", id: "layer-1" }, ids);
  expect(session.document.layers).toEqual([]);
  session = addRaster(session, ids);
  expect(layerAt(session, 0).name).toBe("Picture 2");
  expect(layerAt(session, 0).id).toBe("layer-2");
});

test("set-opacity accepts the closed interval [0,1]", () => {
  const ids = makeIds();
  const session = addRaster(createSession("shirt"), ids);
  for (const opacity of [0, 0.5, 1]) {
    const next = dispatch(session, { type: "set-opacity", id: "layer-1", opacity }, ids);
    expect(layerAt(next, 0).opacity).toBe(opacity);
  }
});

test("set-opacity to the same value is a no-op without dirty", () => {
  const ids = makeIds();
  let session = addRaster(createSession("shirt"), ids);
  session = dispatch(session, { type: "mark-saved" }, ids);
  expect(session.dirty).toBe(false);
  const noop = dispatch(session, { type: "set-opacity", id: "layer-1", opacity: 1 }, ids);
  expect(noop).toEqual(session);
  expect(noop.dirty).toBe(false);
  expect(noop.undo).toHaveLength(1);
});

test("self-applying reorder, set-placement, and patch-transform are no-ops", () => {
  const ids = makeIds();
  let session = addPictures(createSession("shirt"), ids, 2);
  session = dispatch(session, { type: "mark-saved" }, ids);
  expect(dispatch(session, { type: "reorder-item", id: "layer-1", toIndex: 0 }, ids)).toEqual(session);
  expect(
    dispatch(session, { type: "set-placement", id: "layer-1", placement: "decal" }, ids),
  ).toEqual(session);
  expect(
    dispatch(
      session,
      { type: "patch-transform", id: "layer-1", patch: { positionX: rasterSpec.transform.positionX } },
      ids,
    ),
  ).toEqual(session);
  expect(session.undo).toHaveLength(2);
});

test("set-opacity rejects out-of-range, non-finite, and unknown ids", () => {
  const ids = makeIds();
  const session = addRaster(createSession("shirt"), ids);
  const invalid = [-0.1, 1.5, Number.NaN, Number.POSITIVE_INFINITY];
  for (const opacity of invalid) {
    expect(dispatch(session, { type: "set-opacity", id: "layer-1", opacity }, ids)).toEqual(session);
  }
  expect(dispatch(session, { type: "set-opacity", id: "nope", opacity: 0.5 }, ids)).toEqual(session);
});

test("patch-transform applies partial patches without clobbering siblings", () => {
  const ids = makeIds();
  const session = addRaster(createSession("shirt"), ids);
  const patched = dispatch(
    session,
    { type: "patch-transform", id: "layer-1", patch: { positionX: 10, positionY: 20 } },
    ids,
  );
  expect(layerAt(patched, 0).transform).toEqual({
    ...rasterSpec.transform,
    positionX: 10,
    positionY: 20,
  });
  expect(patched.undo).toHaveLength(2);
  const undone = dispatch(patched, { type: "undo" }, ids);
  expect(layerAt(undone, 0).transform).toEqual(rasterSpec.transform);
});

test("patch-transform accepts a valid crop change", () => {
  const ids = makeIds();
  const session = addRaster(createSession("shirt"), ids);
  const crop = { x: 0.25, y: 0.25, width: 0.5, height: 0.25 };
  const patched = dispatch(session, { type: "patch-transform", id: "layer-1", patch: { crop } }, ids);
  expect(layerAt(patched, 0).transform.crop).toEqual(crop);
});

test("patch-transform rejects invalid values and unknown ids unchanged", () => {
  const ids = makeIds();
  const session = addRaster(createSession("shirt"), ids);
  const invalid: TransformPatch[] = [
    { scaleX: 0 },
    { scaleX: -1 },
    { scaleY: 0 },
    { scaleY: Number.NaN },
    { positionX: Number.POSITIVE_INFINITY },
    { positionY: Number.NEGATIVE_INFINITY },
    { rotationDeg: Number.NaN },
    { crop: { x: -0.1, y: 0, width: 1, height: 1 } },
    { crop: { x: 0, y: 0, width: 0, height: 1 } },
    { crop: { x: 0.5, y: 0, width: 0.75, height: 1 } },
    { crop: { x: Number.NaN, y: 0, width: 1, height: 1 } },
  ];
  for (const patch of invalid) {
    expect(dispatch(session, { type: "patch-transform", id: "layer-1", patch }, ids)).toEqual(session);
  }
  expect(
    dispatch(session, { type: "patch-transform", id: "nope", patch: { scaleX: 2 } }, ids),
  ).toEqual(session);
});

test("set-color updates solid layers only", () => {
  const solidIds = makeIds();
  const solid = add(createSession("shirt"), solidSpec, solidIds);
  const recolored = dispatch(solid, { type: "set-color", id: "layer-1", color: "#00ff00" }, solidIds);
  expect(layerAt(recolored, 0).color).toBe("#00ff00");
  expect(recolored.undo).toHaveLength(2);
  expect(dispatch(solid, { type: "set-color", id: "nope", color: "#00ff00" }, solidIds)).toEqual(solid);
  const rasterIds = makeIds();
  const raster = addRaster(createSession("shirt"), rasterIds);
  expect(dispatch(raster, { type: "set-color", id: "layer-1", color: "#00ff00" }, rasterIds)).toEqual(raster);
});

test("set-placement switches mode and rejects unknown ids", () => {
  const ids = makeIds();
  const session = addRaster(createSession("shirt"), ids);
  const placed = dispatch(session, { type: "set-placement", id: "layer-1", placement: "pattern" }, ids);
  expect(layerAt(placed, 0).placement).toBe("pattern");
  expect(
    dispatch(session, { type: "set-placement", id: "nope", placement: "full-map" }, ids),
  ).toEqual(session);
});

test("add-item rejects a raster spec with an invalid transform", () => {
  const ids = makeIds();
  const session = createSession("shirt");
  const badScale: ItemSpec = {
    kind: "raster",
    assetId: "asset-1",
    placement: "decal",
    transform: {
      positionX: 0,
      positionY: 0,
      rotationDeg: 0,
      scaleX: 0,
      scaleY: 1,
      crop: { x: 0, y: 0, width: 1, height: 1 },
    },
  };
  expect(dispatch(session, { type: "add-item", item: badScale }, ids)).toEqual(session);
  const badCrop: ItemSpec = {
    ...rasterSpec,
    transform: { ...rasterSpec.transform, crop: { x: 0.9, y: 0, width: 0.5, height: 1 } },
  };
  expect(dispatch(session, { type: "add-item", item: badCrop }, ids)).toEqual(session);
});

test("undo and redo reject on empty stacks", () => {
  const ids = makeIds();
  const session = createSession("shirt");
  expect(dispatch(session, { type: "undo" }, ids)).toEqual(session);
  expect(dispatch(session, { type: "redo" }, ids)).toEqual(session);
});

test("undo history caps at 50 after 55 single-step actions", () => {
  const ids = makeIds();
  let session = addRaster(createSession("shirt"), ids);
  for (let i = 1; i <= 55; i += 1) {
    session = dispatch(session, { type: "set-opacity", id: "layer-1", opacity: i / 100 }, ids);
  }
  expect(layerAt(session, 0).opacity).toBe(0.55);
  expect(session.undo).toHaveLength(50);
  for (let i = 0; i < 50; i += 1) {
    session = dispatch(session, { type: "undo" }, ids);
  }
  expect(session.undo).toHaveLength(0);
  expect(layerAt(session, 0).opacity).toBe(0.05);
  expect(session.redo).toHaveLength(50);
  expect(dispatch(session, { type: "undo" }, ids)).toEqual(session);
  const redone = dispatch(session, { type: "redo" }, ids);
  expect(layerAt(redone, 0).opacity).toBe(0.06);
});

test("a new commit after undo clears the redo stack", () => {
  const ids = makeIds();
  let session = addRaster(createSession("shirt"), ids);
  session = dispatch(session, { type: "set-opacity", id: "layer-1", opacity: 0.2 }, ids);
  session = dispatch(session, { type: "set-opacity", id: "layer-1", opacity: 0.4 }, ids);
  session = dispatch(session, { type: "set-opacity", id: "layer-1", opacity: 0.6 }, ids);
  session = dispatch(session, { type: "undo" }, ids);
  session = dispatch(session, { type: "undo" }, ids);
  expect(session.redo).toHaveLength(2);
  expect(layerAt(session, 0).opacity).toBe(0.2);
  const next = dispatch(session, { type: "set-opacity", id: "layer-1", opacity: 0.8 }, ids);
  expect(next.redo).toEqual([]);
  expect(next.undo).toHaveLength(3);
});

test("a gesture commits as exactly one undo step", () => {
  const ids = makeIds();
  const session = addRaster(createSession("shirt"), ids);
  const preGesture = session.document;
  let gestured = dispatch(session, { type: "begin-gesture" }, ids);
  expect(gestured.pending).toEqual(preGesture);
  expect(gestured.undo).toHaveLength(1);
  for (let i = 1; i <= 5; i += 1) {
    gestured = dispatch(
      gestured,
      {
        type: "update-gesture",
        mutation: {
          op: "patch-transform",
          id: "layer-1",
          patch: { positionX: 10 * i, positionY: 20 * i },
        },
      },
      ids,
    );
  }
  expect(layerAt(gestured, 0).transform.positionX).toBe(50);
  expect(gestured.undo).toHaveLength(1);
  const committed = dispatch(gestured, { type: "commit-gesture" }, ids);
  expect(committed.pending).toBeNull();
  expect(committed.undo).toHaveLength(2);
  expect(committed.redo).toEqual([]);
  expect(committed.dirty).toBe(true);
  const undone = dispatch(committed, { type: "undo" }, ids);
  expect(undone.document).toEqual(preGesture);
});

test("committing an unchanged gesture pushes no history", () => {
  const ids = makeIds();
  const session = addRaster(createSession("shirt"), ids);
  const begun = dispatch(session, { type: "begin-gesture" }, ids);
  const committed = dispatch(begun, { type: "commit-gesture" }, ids);
  expect(committed.pending).toBeNull();
  expect(committed.undo).toHaveLength(1);
  expect(committed.document).toEqual(session.document);
});

test("a gesture that returns values to their original state commits no history", () => {
  const ids = makeIds();
  const session = addRaster(createSession("shirt"), ids);
  let gestured = dispatch(session, { type: "begin-gesture" }, ids);
  gestured = dispatch(
    gestured,
    { type: "update-gesture", mutation: { op: "patch-transform", id: "layer-1", patch: { positionX: 50 } } },
    ids,
  );
  gestured = dispatch(
    gestured,
    {
      type: "update-gesture",
      mutation: { op: "patch-transform", id: "layer-1", patch: { positionX: rasterSpec.transform.positionX } },
    },
    ids,
  );
  const committed = dispatch(gestured, { type: "commit-gesture" }, ids);
  expect(committed.pending).toBeNull();
  expect(committed.undo).toHaveLength(1);
  expect(committed).toEqual(session);
});

test("undo then redo of a gesture commit restores the post-gesture document", () => {
  const ids = makeIds();
  const session = addRaster(createSession("shirt"), ids);
  let gestured = dispatch(session, { type: "begin-gesture" }, ids);
  gestured = dispatch(
    gestured,
    {
      type: "update-gesture",
      mutation: { op: "patch-transform", id: "layer-1", patch: { positionX: 77, rotationDeg: 15 } },
    },
    ids,
  );
  const committed = dispatch(gestured, { type: "commit-gesture" }, ids);
  const undone = dispatch(committed, { type: "undo" }, ids);
  expect(undone.document).toEqual(session.document);
  const redone = dispatch(undone, { type: "redo" }, ids);
  expect(redone.document).toEqual(committed.document);
  expect(layerAt(redone, 0).transform.positionX).toBe(77);
  expect(layerAt(redone, 0).transform.rotationDeg).toBe(15);
  expect(redone.undo).toHaveLength(2);
});

test("cancel-gesture rolls back all updates without history changes", () => {
  const ids = makeIds();
  const session = addRaster(createSession("shirt"), ids);
  let gestured = dispatch(session, { type: "begin-gesture" }, ids);
  gestured = dispatch(
    gestured,
    { type: "update-gesture", mutation: { op: "set-opacity", id: "layer-1", opacity: 0.1 } },
    ids,
  );
  gestured = dispatch(
    gestured,
    { type: "update-gesture", mutation: { op: "patch-transform", id: "layer-1", patch: { scaleX: 3 } } },
    ids,
  );
  const cancelled = dispatch(gestured, { type: "cancel-gesture" }, ids);
  expect(cancelled.document).toEqual(session.document);
  expect(cancelled.pending).toBeNull();
  expect(cancelled.undo).toHaveLength(1);
  expect(cancelled.redo).toEqual(session.redo);
  expect(cancelled.dirty).toBe(session.dirty);
});

test("gesture state machine rejects out-of-order transitions", () => {
  const ids = makeIds();
  const session = addRaster(createSession("shirt"), ids);
  expect(
    dispatch(session, { type: "update-gesture", mutation: { op: "set-opacity", id: "layer-1", opacity: 0.5 } }, ids),
  ).toEqual(session);
  expect(dispatch(session, { type: "commit-gesture" }, ids)).toEqual(session);
  expect(dispatch(session, { type: "cancel-gesture" }, ids)).toEqual(session);
  const begun = dispatch(session, { type: "begin-gesture" }, ids);
  expect(dispatch(begun, { type: "begin-gesture" }, ids)).toEqual(begun);
});

test("update-gesture applies the same validation as committed actions", () => {
  const ids = makeIds();
  const gestured = dispatch(addRaster(createSession("shirt"), ids), { type: "begin-gesture" }, ids);
  const invalid: GestureMutation[] = [
    { op: "patch-transform", id: "layer-1", patch: { scaleX: 0 } },
    { op: "patch-transform", id: "layer-1", patch: { crop: { x: 0, y: 0, width: 2, height: 1 } } },
    { op: "set-opacity", id: "layer-1", opacity: 2 },
    { op: "set-opacity", id: "layer-1", opacity: Number.NaN },
    { op: "set-color", id: "layer-1", color: "#000000" },
    { op: "set-color", id: "nope", color: "#000000" },
    { op: "set-placement", id: "nope", placement: "decal" },
  ];
  for (const mutation of invalid) {
    expect(dispatch(gestured, { type: "update-gesture", mutation }, ids)).toEqual(gestured);
  }
});

test("update-gesture supports color and placement mutations on solid layers", () => {
  const ids = makeIds();
  let gestured = dispatch(add(createSession("shirt"), solidSpec, ids), { type: "begin-gesture" }, ids);
  gestured = dispatch(
    gestured,
    { type: "update-gesture", mutation: { op: "set-color", id: "layer-1", color: "#0000ff" } },
    ids,
  );
  gestured = dispatch(
    gestured,
    { type: "update-gesture", mutation: { op: "set-placement", id: "layer-1", placement: "decal" } },
    ids,
  );
  expect(layerAt(gestured, 0).color).toBe("#0000ff");
  expect(layerAt(gestured, 0).placement).toBe("decal");
  expect(gestured.undo).toHaveLength(1);
  expect(gestured.dirty).toBe(true);
});

test("gesture commit clears redo", () => {
  const ids = makeIds();
  let session = addRaster(createSession("shirt"), ids);
  session = dispatch(session, { type: "set-opacity", id: "layer-1", opacity: 0.5 }, ids);
  session = dispatch(session, { type: "undo" }, ids);
  expect(session.redo).toHaveLength(1);
  session = dispatch(session, { type: "begin-gesture" }, ids);
  session = dispatch(
    session,
    { type: "update-gesture", mutation: { op: "patch-transform", id: "layer-1", patch: { positionX: 7 } } },
    ids,
  );
  session = dispatch(session, { type: "commit-gesture" }, ids);
  expect(session.redo).toEqual([]);
});

test("non-gesture mutations and history moves reject while a gesture is active", () => {
  const ids = makeIds();
  const begun = dispatch(addRaster(createSession("shirt"), ids), { type: "begin-gesture" }, ids);
  expect(dispatch(begun, { type: "add-item", item: rasterSpec }, ids)).toEqual(begun);
  expect(dispatch(begun, { type: "delete-item", id: "layer-1" }, ids)).toEqual(begun);
  expect(dispatch(begun, { type: "undo" }, ids)).toEqual(begun);
  expect(dispatch(begun, { type: "redo" }, ids)).toEqual(begun);
});

test("mark-saved is rejected while a gesture is active", () => {
  const ids = makeIds();
  const begun = dispatch(addRaster(createSession("shirt"), ids), { type: "begin-gesture" }, ids);
  expect(dispatch(begun, { type: "mark-saved" }, ids)).toEqual(begun);
});

test("dirty is false on create, true after commits, false after mark-saved", () => {
  const ids = makeIds();
  const fresh = createSession("shirt");
  expect(fresh.dirty).toBe(false);
  const mutated = addRaster(fresh, ids);
  expect(mutated.dirty).toBe(true);
  const saved = dispatch(mutated, { type: "mark-saved" }, ids);
  expect(saved.dirty).toBe(false);
  expect(saved.undo).toHaveLength(1);
  expect(saved.document).toEqual(mutated.document);
});

test("new-project resets history, gesture, dirty, and counters", () => {
  const ids = makeIds();
  let session = addPictures(createSession("shirt"), ids, 2);
  session = dispatch(session, { type: "delete-item", id: "layer-1" }, ids);
  session = dispatch(session, { type: "undo" }, ids);
  session = dispatch(session, { type: "begin-gesture" }, ids);
  expect(session.pending).not.toBeNull();
  expect(session.dirty).toBe(true);
  const reset = dispatch(session, { type: "new-project", garment: "pants", name: "Fresh" }, ids);
  expect(reset.document).toEqual(createProject("pants", "Fresh"));
  expect(reset.undo).toEqual([]);
  expect(reset.redo).toEqual([]);
  expect(reset.pending).toBeNull();
  expect(reset.dirty).toBe(false);
  const readded = addRaster(reset, ids);
  expect(layerAt(readded, 0).name).toBe("Picture 1");
});

test("new-project defaults the garment name", () => {
  const ids = makeIds();
  const session = addRaster(createSession("shirt"), ids);
  const reset = dispatch(session, { type: "new-project", garment: "tshirt" }, ids);
  expect(reset.document.name).toBe("My T-shirt");
  expect(reset.document.layers).toEqual([]);
});

test("dispatch generates unique ids without an injected factory", () => {
  let session = createSession("shirt");
  session = dispatch(session, { type: "add-item", item: rasterSpec });
  session = dispatch(session, { type: "add-item", item: rasterSpec });
  expect(layerAt(session, 0).id).toBeTruthy();
  expect(layerAt(session, 1).id).toBeTruthy();
  expect(layerAt(session, 0).id).not.toBe(layerAt(session, 1).id);
});

test("dispatch leaves prior sessions untouched", () => {
  const ids = makeIds();
  const base = addPictures(createSession("shirt"), ids, 2);
  const snapshot = structuredClone(base);
  dispatch(base, { type: "patch-transform", id: "layer-1", patch: { scaleX: 2 } }, ids);
  dispatch(base, { type: "delete-item", id: "layer-1" }, ids);
  dispatch(base, { type: "add-item", item: rasterSpec }, ids);
  dispatch(base, { type: "undo" }, ids);
  dispatch(base, { type: "begin-gesture" }, ids);
  expect(base).toEqual(snapshot);
  const first = createSession("shirt");
  addRaster(first, ids);
  expect(first.document.layers).toHaveLength(0);
  expect(first.dirty).toBe(false);
});

test("mutating a returned session's document does not affect the next dispatch result", () => {
  const ids = makeIds();
  const s1 = createSession("shirt");
  const s2 = addRaster(s1, ids);
  const s3 = addRaster(s2, ids);
  const s3Snapshot = structuredClone(s3);
  s3.document.layers.length = 0;
  s3.document.name = "HACKED";
  expect(s2.document.layers).toHaveLength(1);
  expect(s2.document.name).toBe("My Shirt");
  const replayIds = makeIds();
  replayIds();
  expect(addRaster(s2, replayIds)).toEqual(s3Snapshot);
});

test("layer objects are shared where unchanged and copied on write", () => {
  const ids = makeIds();
  const s1 = createSession("shirt");
  const s2 = addRaster(s1, ids);
  const s3 = addRaster(s2, ids);
  expect(s2.document.layers).toHaveLength(1);
  expect(s3.document.layers[0]).toBe(s2.document.layers[0]);
  const s4 = dispatch(s3, { type: "patch-transform", id: "layer-1", patch: { scaleX: 2 } }, ids);
  expect(s4.document.layers[0]).not.toBe(s3.document.layers[0]);
  expect(layerAt(s3, 0).transform.scaleX).toBe(1);
});

test("add-item copies the caller-supplied transform defensively", () => {
  const ids = makeIds();
  const spec: ItemSpec = {
    kind: "raster",
    assetId: "asset-1",
    placement: "decal",
    transform: { ...rasterSpec.transform, crop: { ...rasterSpec.transform.crop } },
  };
  const session = add(createSession("shirt"), spec, ids);
  spec.transform.positionX = 999;
  spec.transform.crop.width = 0.5;
  expect(layerAt(session, 0).transform.positionX).toBe(256);
  expect(layerAt(session, 0).transform.crop.width).toBe(1);
});
