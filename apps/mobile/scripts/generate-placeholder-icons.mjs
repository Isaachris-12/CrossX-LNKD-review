// One-off dev utility: writes a solid-color square PNG per platform (using
// the same accent colors as src/theme.ts) as a placeholder at the exact
// filenames PlatformIcon.tsx expects. Swap these files for real logo assets
// from each platform's official brand kit (see apps/mobile/assets/platforms/README.md)
// - same filenames, so no code changes are needed when you do.
//
// Re-run with: node scripts/generate-placeholder-icons.mjs

import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PLATFORM_COLORS = {
  instagram: "#E1306C",
  tiktok: "#12C2C2",
  facebook: "#1877F2",
  linkedin: "#0A66C2",
  youtube: "#FF0000",
  reddit: "#FF4500",
  bluesky: "#1185FE",
  pinterest: "#E60023",
  mastodon: "#6364FF",
};

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(crcInput) >>> 0, 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

function makeSolidPng(hexColor, size) {
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 2; // color type: RGB

  const rowSize = size * 3 + 1;
  const raw = Buffer.alloc(rowSize * size);
  for (let y = 0; y < size; y++) {
    const rowStart = y * rowSize;
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const px = rowStart + 1 + x * 3;
      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
    }
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = chunk("IHDR", ihdrData);
  const idat = chunk("IDAT", zlib.deflateSync(raw));
  const iend = chunk("IEND", Buffer.alloc(0));
  return Buffer.concat([signature, ihdr, idat, iend]);
}

const outDir = path.resolve(__dirname, "..", "assets", "platforms");
fs.mkdirSync(outDir, { recursive: true });

for (const [name, color] of Object.entries(PLATFORM_COLORS)) {
  const outPath = path.join(outDir, `${name}.png`);
  fs.writeFileSync(outPath, makeSolidPng(color, 128));
  console.log(`Wrote ${outPath}`);
}
