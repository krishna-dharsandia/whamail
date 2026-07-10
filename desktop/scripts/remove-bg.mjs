import sharp from "sharp";
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const buildDir = join(__dirname, "..", "build");
const source = join(buildDir, "icon.png");

// Read raw pixel data
const image = sharp(source);
const { width, height, channels } = await image.metadata();
const raw = await image.ensureAlpha().raw().toBuffer();

// The dark background is roughly rgb < 40 in all channels (very dark navy)
// We'll make those pixels transparent
const pixels = Buffer.from(raw);

for (let i = 0; i < pixels.length; i += 4) {
  const r = pixels[i];
  const g = pixels[i + 1];
  const b = pixels[i + 2];

  // Dark background pixels: low brightness, not part of the colorful logo
  // The logo has cyan/blue/purple with higher saturation and brightness
  const maxChannel = Math.max(r, g, b);
  const brightness = (r + g + b) / 3;

  if (maxChannel < 50 && brightness < 40) {
    // Fully transparent
    pixels[i + 3] = 0;
  } else if (maxChannel < 70 && brightness < 50) {
    // Semi-transparent transition zone (anti-aliasing)
    const factor = (maxChannel - 30) / 40; // 0..1
    pixels[i + 3] = Math.round(Math.max(0, Math.min(255, pixels[i + 3] * factor)));
  }
}

const output = join(buildDir, "icon-transparent.png");
await sharp(pixels, { raw: { width, height, channels: 4 } })
  .png()
  .toFile(output);

console.log(`Saved: ${output}`);
console.log("Review the result. If good, run: node scripts/generate-icons-from-transparent.mjs");
