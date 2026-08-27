import { expect, test } from "vitest";
import { sha256Hex } from "../../src/assets/hash";

test("sha256Hex matches known digests", async () => {
  expect(await sha256Hex(new Uint8Array([]))).toBe(
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
  expect(await sha256Hex(new TextEncoder().encode("abc"))).toBe(
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  expect(await sha256Hex(new TextEncoder().encode("rbx-fashion"))).toBe(
    "c8281860415736d2ad19577974edc83939bd6cdaa69b43cdf27c5f58d61783da",
  );
});
