import sharp from "sharp";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const buildDir = join(root, "build");
const source = join(buildDir, "icon-transparent.png");

mkdirSync(buildDir, { recursive: true });

// Generate PNG sizes
const pngSizes = [16, 24, 32, 48, 64, 128, 256, 512];
const pngBuffers = {};

for (const size of pngSizes) {
  const buf = await sharp(source).resize(size, size).png().toBuffer();
  pngBuffers[size] = buf;
  writeFileSync(join(buildDir, `icon-${size}px.png`), buf);
  console.log(`build/icon-${size}px.png`);
}

// Main icon.png (512x512)
writeFileSync(join(buildDir, "icon.png"), pngBuffers[512]);
console.log("build/icon.png (512x512)");

// Generate .ico (multi-size Windows icon)
function createIco(entries) {
  const count = entries.length;
  const headerSize = 6 + count * 16;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  const dirEntries = [];
  let offset = headerSize;
  for (const { size, data } of entries) {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size;
    entry[1] = size >= 256 ? 0 : size;
    entry[2] = 0;
    entry[3] = 0;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    dirEntries.push(entry);
    offset += data.length;
  }

  return Buffer.concat([header, ...dirEntries, ...entries.map((e) => e.data)]);
}

const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const icoEntries = icoSizes.map((size) => ({ size, data: pngBuffers[size] }));
writeFileSync(join(buildDir, "icon.ico"), createIco(icoEntries));
console.log("build/icon.ico (multi-size)");

// Generate .icns for macOS
function createIcns(entries) {
  const typeMap = { 32: "icp4", 64: "icp5", 128: "ic07", 256: "ic08", 512: "ic09" };
  const chunks = [];
  for (const { size, data } of entries) {
    const type = typeMap[size];
    if (!type) continue;
    const chunkHeader = Buffer.alloc(8);
    chunkHeader.write(type, 0, 4, "ascii");
    chunkHeader.writeUInt32BE(data.length + 8, 4);
    chunks.push(Buffer.concat([chunkHeader, data]));
  }
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(8);
  header.write("icns", 0, 4, "ascii");
  header.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([header, body]);
}

const icnsSizes = [32, 64, 128, 256, 512];
const icnsEntries = icnsSizes.map((size) => ({ size, data: pngBuffers[size] }));
writeFileSync(join(buildDir, "icon.icns"), createIcns(icnsEntries));
console.log("build/icon.icns (macOS)");

console.log("\nAll icons generated from source image.");
