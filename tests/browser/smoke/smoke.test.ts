import { expect, test } from "vitest";

test("canvas element is available", () => {
  expect(typeof HTMLCanvasElement !== "undefined").toBe(true);
});
