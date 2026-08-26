import { expect, test } from "vitest";

test("canvas 2d renders a 2x2 red rectangle", () => {
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 2;
  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    throw new Error("2d context unavailable");
  }
  ctx.fillStyle = "#ff0000";
  ctx.fillRect(0, 0, 2, 2);
  const pixels = Array.from(ctx.getImageData(0, 0, 2, 2).data);
  expect(pixels).toEqual([
    255, 0, 0, 255,
    255, 0, 0, 255,
    255, 0, 0, 255,
    255, 0, 0, 255,
  ]);
});
