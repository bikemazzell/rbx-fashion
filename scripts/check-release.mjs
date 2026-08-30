import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const GARMENTS = ["shirt", "pants", "tshirt"];
const SOURCES = ["studio", "web"];
const VIEWS = ["front", "back", "left", "right", "top", "bottom"];
const README_PATH = "calibration/README.md";

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isNumericTuple(value, length) {
  return Array.isArray(value) && value.length === length && value.every(isFiniteNumber);
}

function readText(path, rel) {
  try {
    return { text: readFileSync(path, "utf8") };
  } catch {
    return { error: `${rel}: missing or unreadable` };
  }
}

function checkMeasurements(evidenceDir, failures) {
  const path = join(evidenceDir, "measurements.json");
  const rel = "calibration/evidence/measurements.json";
  const file = readText(path, rel);
  if (file.error !== undefined) {
    failures.push(`${file.error} — record it per the procedure in ${README_PATH}`);
    return;
  }
  let data;
  try {
    data = JSON.parse(file.text);
  } catch (error) {
    failures.push(`${rel}: invalid JSON (${error.message})`);
    return;
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    failures.push(`${rel}: top-level value must be an object`);
    return;
  }
  if (typeof data.studioVersion !== "string" || data.studioVersion.trim() === "") {
    failures.push(`${rel}: studioVersion must be a non-empty string`);
  }
  if (typeof data.capturedOn !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(data.capturedOn)) {
    failures.push(`${rel}: capturedOn must be a calendar date formatted YYYY-MM-DD`);
  }
  if (data.rigType !== "R6") {
    failures.push(`${rel}: rigType must be "R6"`);
  }
  if (!Array.isArray(data.parts) || data.parts.length < 7) {
    failures.push(`${rel}: parts must be an array with at least 7 entries`);
    return;
  }
  data.parts.forEach((part, index) => {
    if (part === null || typeof part !== "object" || Array.isArray(part)) {
      failures.push(`${rel}: parts[${index}] must be an object`);
      return;
    }
    if (typeof part.name !== "string" || part.name.trim() === "") {
      failures.push(`${rel}: parts[${index}].name must be a non-empty string`);
    }
    if (!isNumericTuple(part.size, 3)) {
      failures.push(`${rel}: parts[${index}].size must be 3 finite numbers`);
    }
    if (!isNumericTuple(part.relativeCFrame, 12)) {
      failures.push(`${rel}: parts[${index}].relativeCFrame must be 12 finite numbers`);
    }
  });
}

const CAPTURE_DIMENSIONS = {
  shirt: [585, 559],
  pants: [585, 559],
  tshirt: [512, 512],
};

function checkCaptures(evidenceDir, source, failures) {
  for (const garment of GARMENTS) {
    for (const view of VIEWS) {
      const rel = `calibration/evidence/captures/${garment}-${source}-${view}.png`;
      try {
        const bytes = readFileSync(join(evidenceDir, "captures", `${garment}-${source}-${view}.png`));
        if (bytes.length === 0 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
          failures.push(`${rel}: empty or missing PNG signature`);
          continue;
        }
        const [expectedWidth, expectedHeight] = CAPTURE_DIMENSIONS[garment];
        const width = bytes.readUInt32BE(16);
        const height = bytes.readUInt32BE(20);
        if (width !== expectedWidth || height !== expectedHeight) {
          failures.push(
            `${rel}: IHDR dimensions ${width}x${height} do not match expected ${expectedWidth}x${expectedHeight}`,
          );
        }
      } catch {
        failures.push(`${rel}: missing or unreadable`);
      }
    }
  }
}

function checkAlphaFixtures(repoRoot, failures) {
  for (const garment of GARMENTS) {
    const rel = `calibration/fixtures/${garment}-alpha.png`;
    try {
      const bytes = readFileSync(join(repoRoot, rel));
      if (bytes.length < 24 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
        failures.push(`${rel}: empty, truncated, or missing PNG signature`);
        continue;
      }
      const [expectedWidth, expectedHeight] = CAPTURE_DIMENSIONS[garment];
      const width = bytes.readUInt32BE(16);
      const height = bytes.readUInt32BE(20);
      if (width !== expectedWidth || height !== expectedHeight) {
        failures.push(`${rel}: IHDR dimensions ${width}x${height} do not match expected ${expectedWidth}x${expectedHeight}`);
      }
    } catch {
      failures.push(`${rel}: missing or unreadable — regenerate with npm run calibration:fixtures`);
    }
  }
}

function checkChecklist(evidenceDir, failures) {
  const rel = "calibration/evidence/r6-checklist-completed.md";
  const file = readText(join(evidenceDir, "r6-checklist-completed.md"), rel);
  if (file.error !== undefined) {
    failures.push(`${file.error} — complete calibration/r6-checklist.md and save it under calibration/evidence/`);
    return;
  }
  const text = file.text;
  if (!/^RESULT: PASS$/m.test(text)) {
    failures.push(`${rel}: must contain an exact "RESULT: PASS" line`);
  }
  if (text.includes("RESULT: FAIL")) {
    failures.push(`${rel}: contains "RESULT: FAIL" — a failed check must be resolved and the calibration repeated`);
  }
  if (text.includes("RESULT: PENDING")) {
    failures.push(`${rel}: still says "RESULT: PENDING" — the calibration run is not finished`);
  }
  let resultIndex = -1;
  for (const line of text.split("\n")) {
    if (!line.startsWith("|")) {
      continue;
    }
    const cells = line.split("|").slice(1, -1);
    if (cells.length === 0 || cells.every((cell) => /^:?-+:?$/.test(cell.trim()))) {
      continue;
    }
    const headerIndex = cells.findIndex((cell) => cell.trim() === "Result");
    if (headerIndex >= 0) {
      resultIndex = headerIndex;
      continue;
    }
    if (resultIndex >= 0) {
      const cell = cells[resultIndex];
      if (cell === undefined || cell.trim() === "") {
        failures.push(`${rel}: table row has an empty Result cell: ${line.trim()}`);
      }
    }
  }
}

function checkRegistry(repoRoot, failures) {
  const rel = "src/domain/registry-data.ts";
  const file = readText(join(repoRoot, "src", "domain", "registry-data.ts"), rel);
  if (file.error !== undefined) {
    failures.push(file.error);
    return;
  }
  if (file.text.includes("calibrationVersion: null")) {
    failures.push(
      `${rel} still contains "calibrationVersion: null" — the registry is not calibrated; record the calibration version from a passing run`,
    );
  }
}

export function runReleaseCheck(repoRoot) {
  const failures = [];
  const evidenceDir = join(repoRoot, "calibration", "evidence");
  try {
    if (!statSync(evidenceDir).isDirectory()) {
      failures.push(`calibration/evidence/ is not a directory — see ${README_PATH}`);
    }
  } catch {
    failures.push(
      `calibration/evidence/ is missing — no R6 calibration evidence exists; complete the procedure in ${README_PATH} before release`,
    );
  }
  checkMeasurements(evidenceDir, failures);
  checkAlphaFixtures(repoRoot, failures);
  for (const source of SOURCES) {
    checkCaptures(evidenceDir, source, failures);
  }
  checkChecklist(evidenceDir, failures);
  checkRegistry(repoRoot, failures);
  return { ok: failures.length === 0, failures };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = runReleaseCheck(process.cwd());
  if (result.ok) {
    console.log("check:release: ok — R6 calibration evidence complete and registry calibrated");
  } else {
    console.log(
      `check:release: FAILED — R6 calibration evidence missing or incomplete (${result.failures.length} problem(s)):`,
    );
    for (const failure of result.failures) {
      console.log(`  - ${failure}`);
    }
    console.log(
      `Complete the R6 Studio calibration procedure in ${README_PATH}, then commit real evidence under calibration/evidence/.`,
    );
    process.exitCode = 1;
  }
}
