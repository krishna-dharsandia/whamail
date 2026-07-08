import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function crc32Table() {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c;
  }
  return t;
}

const crcTable = crc32Table();

function crc32(buf) {
  let c = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = crcTable[(c ^ buf[n]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeB = Buffer.from(type, "ascii");
  const crcBuf = Buffer.concat([typeB, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcBuf));
  return Buffer.concat([len, typeB, data, crc]);
}

function createPng(size) {
  const width = size;
  const height = size;
  const cx = width / 2;
  const cy = height / 2;
  const r = width / 2 - 1;

  const pixels = Buffer.alloc(width * height * 4, 0);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const i = (y * width + x) * 4;

      if (dist <= r) {
        pixels[i] = 43;
        pixels[i + 1] = 130;
        pixels[i + 2] = 217;
        pixels[i + 3] = 255;
      } else {
        pixels[i] = 0;
        pixels[i + 1] = 0;
        pixels[i + 2] = 0;
        pixels[i + 3] = 0;
      }
    }
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0;
    pixels.copy(raw, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }

  const compressed = deflateSync(raw, { level: 9 });
  const iend = Buffer.alloc(0);

  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", iend),
  ]);
}

mkdirSync(join(root, "build"), { recursive: true });

const sizes = [16, 24, 32, 48, 64, 128, 256];

for (const size of sizes) {
  const png = createPng(size);
  writeFileSync(join(root, "build", `icon-${size}px.png`), png);
  console.log(`build/icon-${size}px.png`);
}

writeFileSync(join(root, "build", "icon.png"), createPng(512));
console.log("build/icon.png (512x512)");

// Generate .ico (multi-size Windows icon)
function createIco(pngBuffers) {
  const count = pngBuffers.length;
  const headerSize = 6 + count * 16;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);      // reserved
  header.writeUInt16LE(1, 2);      // type: icon
  header.writeUInt16LE(count, 4);  // image count

  const entries = [];
  let offset = headerSize;
  for (const { size, data } of pngBuffers) {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size; // width (0 = 256)
    entry[1] = size >= 256 ? 0 : size; // height
    entry[2] = 0;  // color palette
    entry[3] = 0;  // reserved
    entry.writeUInt16LE(1, 4);         // color planes
    entry.writeUInt16LE(32, 6);        // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += data.length;
  }

  return Buffer.concat([header, ...entries, ...pngBuffers.map(p => p.data)]);
}

const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const icoPngs = icoSizes.map(size => ({ size, data: createPng(size) }));
writeFileSync(join(root, "build", "icon.ico"), createIco(icoPngs));
console.log("build/icon.ico (multi-size)");

// Generate .icns for macOS
function createIcns(pngBuffers) {
  // Minimal .icns with PNG data for key sizes
  const typeMap = { 32: "icp4", 64: "icp5", 128: "ic07", 256: "ic08", 512: "ic09" };
  const chunks = [];
  for (const { size, data } of pngBuffers) {
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
const icnsPngs = icnsSizes.map(size => ({ size, data: createPng(size) }));
writeFileSync(join(root, "build", "icon.icns"), createIcns(icnsPngs));
console.log("build/icon.icns (macOS)");

console.log("\nReplace with proper design for production.");