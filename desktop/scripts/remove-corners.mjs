import sharp from "sharp";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const buildDir = join(__dirname, "..", "build");
const source = join(buildDir, "icon.png");

const image = sharp(source);
const meta = await image.metadata();
const w = meta.width;
const h = meta.height;

// Create a rounded rectangle mask matching the icon's corner radius
// The icon appears to have ~22% corner radius (like iOS style)
const radius = Math.round(w * 0.22);

const mask = Buffer.from(
  `<svg width="${w}" height="${h}">
    <rect x="0" y="0" width="${w}" height="${h}" rx="${radius}" ry="${radius}" fill="white"/>
  </svg>`
);

const result = await sharp(source)
  .ensureAlpha()
  .composite([{
    input: await sharp(mask).resize(w, h).grayscale().toBuffer(),
    blend: "dest-in",
  }])
  .png()
  .toBuffer();

const output = join(buildDir, "icon-transparent.png");
await sharp(result).toFile(output);
console.log(`Saved: ${output} (${w}x${h}, corners transparent)`);
