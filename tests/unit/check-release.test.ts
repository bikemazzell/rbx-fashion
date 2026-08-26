import { expect, test } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runReleaseCheck } from "../../scripts/check-release.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const GARMENTS = ["shirt", "pants", "tshirt"] as const;
const SOURCES = ["studio", "web"] as const;
const VIEWS = ["front", "back", "left", "right", "top", "bottom"] as const;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function minimalPng(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  return Buffer.concat([PNG_SIGNATURE, pngChunk("IHDR", ihdr), pngChunk("IEND", Buffer.alloc(0))]);
}

interface MeasurementFixture {
  name: string;
  size: [number, number, number];
  position: [number, number, number];
}

const PART_FIXTURES: readonly MeasurementFixture[] = [
  { name: "HumanoidRootPart", size: [2, 2, 1], position: [0, 3, 0] },
  { name: "Head", size: [2, 1, 1], position: [0, 1.5, 0] },
  { name: "Left Arm", size: [1, 2, 1], position: [-1.5, 0, 0] },
  { name: "Left Leg", size: [1, 2, 1], position: [-0.5, -2, 0] },
  { name: "Right Arm", size: [1, 2, 1], position: [1.5, 0, 0] },
  { name: "Right Leg", size: [1, 2, 1], position: [0.5, -2, 0] },
  { name: "Torso", size: [2, 2, 1], position: [0, 0, 0] },
];

function validMeasurements(): string {
  const parts = PART_FIXTURES.map((part) => ({
    name: part.name,
    size: part.size,
    relativeCFrame: [
      1, 0, 0, 0, 1, 0, 0, 0, 1, part.position[0], part.position[1], part.position[2],
    ],
  }));
  return JSON.stringify({
    studioVersion: "0.1.0-test",
    capturedOn: "2026-08-27",
    rigType: "R6",
    parts,
  });
}

function fillResultCells(source: string): string {
  const lines = source.split("\n");
  let resultIndex = -1;
  const filled = lines.map((line) => {
    if (!line.startsWith("|")) {
      return line;
    }
    const cells = line.split("|").slice(1, -1);
    if (cells.length === 0 || cells.every((cell) => /^:?-+:?$/.test(cell.trim()))) {
      return line;
    }
    const headerIndex = cells.findIndex((cell) => cell.trim() === "Result");
    if (headerIndex >= 0) {
      resultIndex = headerIndex;
      return line;
    }
    if (resultIndex >= 0) {
      const cell = cells[resultIndex];
      if (cell !== undefined && cell.trim() === "") {
        cells[resultIndex] = " PASS ";
        return `|${cells.join("|")}|`;
      }
    }
    return line;
  });
  return filled.join("\n");
}

function writeEvidenceTree(root: string, checklistText: string): void {
  mkdirSync(join(root, "calibration", "evidence", "captures"), { recursive: true });
  mkdirSync(join(root, "src", "domain"), { recursive: true });
  writeFileSync(join(root, "calibration", "evidence", "r6-checklist-completed.md"), checklistText);
  writeFileSync(join(root, "calibration", "evidence", "measurements.json"), validMeasurements());
  const png = minimalPng();
  for (const garment of GARMENTS) {
    for (const source of SOURCES) {
      for (const view of VIEWS) {
        writeFileSync(
          join(root, "calibration", "evidence", "captures", `${garment}-${source}-${view}.png`),
          png,
        );
      }
    }
  }
  const registrySource = readFileSync(join(repoRoot, "src", "domain", "registry-data.ts"), "utf8");
  writeFileSync(
    join(root, "src", "domain", "registry-data.ts"),
    registrySource.replaceAll("calibrationVersion: null", 'calibrationVersion: "test-v1"'),
  );
}

test("current repo fails the release gate with calibration failures", () => {
  const result = runReleaseCheck(repoRoot);
  expect(result.ok).toBe(false);
  expect(result.failures.some((failure) => failure.includes("measurements.json"))).toBe(true);
  expect(result.failures.some((failure) => failure.includes("calibration/evidence"))).toBe(true);
  expect(result.failures.some((failure) => failure.includes("calibrationVersion: null"))).toBe(true);
});

test("CLI exits 1 with calibration wording when evidence is missing", () => {
  const run = spawnSync(process.execPath, ["scripts/check-release.mjs"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  expect(run.status).toBe(1);
  expect(run.stdout.toLowerCase().includes("calibration")).toBe(true);
});

test("valid fabricated evidence tree passes the gate", () => {
  const template = readFileSync(join(repoRoot, "calibration", "r6-checklist.md"), "utf8");
  const completed = fillResultCells(template).replace("RESULT: PENDING", "RESULT: PASS");
  const root = mkdtempSync(join(tmpdir(), "rbx-check-release-"));
  try {
    writeEvidenceTree(root, `${completed}\n`);
    const result = runReleaseCheck(root);
    expect(result.failures).toEqual([]);
    expect(result.ok).toBe(true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checklist still saying RESULT: PENDING fails naming the checklist", () => {
  const template = readFileSync(join(repoRoot, "calibration", "r6-checklist.md"), "utf8");
  const pending = fillResultCells(template);
  const root = mkdtempSync(join(tmpdir(), "rbx-check-release-"));
  try {
    writeEvidenceTree(root, `${pending}\n`);
    const result = runReleaseCheck(root);
    expect(result.ok).toBe(false);
    expect(
      result.failures.some((failure) => failure.includes("r6-checklist-completed.md")),
    ).toBe(true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
