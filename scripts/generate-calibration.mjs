import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { PANTS_ENTRY, SHIRT_ENTRY, TSHIRT_ENTRY } from "../src/domain/registry-data.ts";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function atlasSpec(entry) {
  const panels = [...entry.panels]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((panel, index) => ({
      id: panel.id,
      x: panel.atlasRect.x,
      y: panel.atlasRect.y,
      w: panel.atlasRect.width,
      h: panel.atlasRect.height,
      hue: (index * 137.508) % 360,
    }));
  return { width: entry.width, height: entry.height, panels };
}

async function drawAtlasFixture(page, spec) {
  return page.evaluate((fixture) => {
    const canvas = document.createElement("canvas");
    canvas.width = fixture.width;
    canvas.height = fixture.height;
    const ctx = canvas.getContext("2d");
    for (const panel of fixture.panels) {
      const cx = panel.x + panel.w / 2;
      ctx.fillStyle = `hsl(${panel.hue}, 85%, 45%)`;
      ctx.fillRect(panel.x, panel.y, panel.w, panel.h);
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      for (let gx = panel.x + 16; gx < panel.x + panel.w; gx += 16) {
        ctx.fillRect(gx, panel.y, 1, panel.h);
      }
      for (let gy = panel.y + 16; gy < panel.y + panel.h; gy += 16) {
        ctx.fillRect(panel.x, gy, panel.w, 1);
      }
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 1;
      ctx.strokeRect(panel.x + 0.5, panel.y + 0.5, panel.w - 1, panel.h - 1);
      const arrowHeight = Math.min(64, panel.h - 40);
      const arrowWidth = Math.min(Math.round(arrowHeight * 0.75), Math.max(16, panel.w - 44));
      const arrowTop = panel.y + 40;
      ctx.beginPath();
      ctx.moveTo(cx, arrowTop);
      ctx.lineTo(cx - arrowWidth / 2, arrowTop + arrowHeight);
      ctx.lineTo(cx + arrowWidth / 2, arrowTop + arrowHeight);
      ctx.closePath();
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 3;
      ctx.stroke();
      const pills = [
        { label: "1", x: cx, y: panel.y + 18 },
        { label: "2", x: panel.x + panel.w - 18, y: panel.y + Math.round(panel.h / 3) },
        { label: "3", x: cx, y: panel.y + panel.h - 18 },
        { label: "4", x: panel.x + 18, y: panel.y + Math.round((panel.h * 2) / 3) },
      ];
      ctx.font = "bold 24px sans-serif";
      for (const pill of pills) {
        const pillWidth = Math.ceil(ctx.measureText(pill.label).width) + 12;
        const pillHeight = 30;
        ctx.beginPath();
        ctx.roundRect(pill.x - pillWidth / 2, pill.y - pillHeight / 2, pillWidth, pillHeight, 8);
        ctx.fillStyle = "#000000";
        ctx.fill();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(pill.label, pill.x, pill.y + 1);
      }
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      ctx.font = "bold 28px sans-serif";
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 4;
      ctx.strokeText(panel.id, cx, panel.y + panel.h / 2);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(panel.id, cx, panel.y + panel.h / 2);
    }
    return canvas.toDataURL("image/png");
  }, spec);
}

async function drawTShirtFixture(page, spec) {
  return page.evaluate((fixture) => {
    const canvas = document.createElement("canvas");
    canvas.width = fixture.width;
    canvas.height = fixture.height;
    const ctx = canvas.getContext("2d");
    const size = fixture.width;
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    for (let p = 16; p < size; p += 16) {
      if (p % 64 === 0) {
        continue;
      }
      ctx.fillRect(p, 0, 1, size);
      ctx.fillRect(0, p, size, 1);
    }
    ctx.fillStyle = "#000000";
    for (let p = 64; p < size; p += 64) {
      ctx.fillRect(p - 1, 0, 3, size);
      ctx.fillRect(0, p - 1, size, 3);
    }
    ctx.fillStyle = "#ff00ff";
    ctx.fillRect(0, 0, size, 8);
    ctx.fillRect(0, size - 8, size, 8);
    ctx.fillRect(0, 0, 8, size);
    ctx.fillRect(size - 8, 0, 8, size);
    ctx.fillStyle = "#00ffff";
    ctx.fillRect(0, size / 2 - 4, size, 8);
    ctx.fillRect(size / 2 - 4, 0, 8, size);
    ctx.font = "bold 32px sans-serif";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 4;
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.strokeText("TL", 24, 24);
    ctx.fillText("TL", 24, 24);
    ctx.textAlign = "right";
    ctx.strokeText("TR", size - 24, 24);
    ctx.fillText("TR", size - 24, 24);
    ctx.textBaseline = "bottom";
    ctx.textAlign = "left";
    ctx.strokeText("BL", 24, size - 24);
    ctx.fillText("BL", 24, size - 24);
    ctx.textAlign = "right";
    ctx.strokeText("BR", size - 24, size - 24);
    ctx.fillText("BR", size - 24, size - 24);
    ctx.beginPath();
    ctx.moveTo(size / 2, 176);
    ctx.lineTo(size / 2 - 24, 240);
    ctx.lineTo(size / 2 + 24, 240);
    ctx.closePath();
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.font = "14px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#ffffff";
    for (let v = 0; v <= 448; v += 64) {
      ctx.fillText(String(v), v + 4, 4);
      ctx.fillText(String(v), 4, v + 20);
    }
    return canvas.toDataURL("image/png");
  }, spec);
}

function verifyPng(path, expectedWidth, expectedHeight) {
  const problems = [];
  let bytes;
  try {
    bytes = readFileSync(path);
  } catch {
    return [`unreadable output: ${path}`];
  }
  if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    problems.push("missing PNG signature");
  }
  if (bytes.length < 24) {
    problems.push("truncated before IHDR");
    return problems;
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width !== expectedWidth || height !== expectedHeight) {
    problems.push(`IHDR dimensions ${width}x${height} do not match expected ${expectedWidth}x${expectedHeight}`);
  }
  return problems;
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(scriptDir, "..", "calibration", "fixtures");
mkdirSync(fixturesDir, { recursive: true });

const browser = await chromium.launch();
const outputs = [];
try {
  const page = await browser.newPage();
  outputs.push({
    name: "shirt.png",
    width: SHIRT_ENTRY.width,
    height: SHIRT_ENTRY.height,
    dataUrl: await drawAtlasFixture(page, atlasSpec(SHIRT_ENTRY)),
  });
  outputs.push({
    name: "pants.png",
    width: PANTS_ENTRY.width,
    height: PANTS_ENTRY.height,
    dataUrl: await drawAtlasFixture(page, atlasSpec(PANTS_ENTRY)),
  });
  outputs.push({
    name: "tshirt.png",
    width: TSHIRT_ENTRY.width,
    height: TSHIRT_ENTRY.height,
    dataUrl: await drawTShirtFixture(page, { width: TSHIRT_ENTRY.width, height: TSHIRT_ENTRY.height }),
  });
} finally {
  await browser.close();
}

let failed = false;
for (const output of outputs) {
  const bytes = Buffer.from(output.dataUrl.slice("data:image/png;base64,".length), "base64");
  const path = join(fixturesDir, output.name);
  writeFileSync(path, bytes);
  const problems = verifyPng(path, output.width, output.height);
  if (problems.length > 0) {
    failed = true;
    for (const problem of problems) {
      console.log(`FAIL ${path}: ${problem}`);
    }
    continue;
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  console.log(`verified ${path} ${output.width}x${output.height} ${bytes.length} bytes sha256=${sha256}`);
}
if (failed) {
  process.exitCode = 1;
} else {
  console.log("calibration fixtures: 3 generated, PNG self-verification passed");
}
