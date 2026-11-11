#!/usr/bin/env node
/**
 * Generate a small demo library under ./media so a fresh checkout shows
 * something. Safe to re-run; only writes files it creates itself.
 *
 *   npm run sample:images
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(process.cwd(), process.argv[2] ?? "media");

const palettes = [
  ["#0f2027", "#2c5364", "sunset-lake"],
  ["#42275a", "#734b6d", "dusk-hills"],
  ["#1f4037", "#99f2c8", "moss"],
  ["#3a1c71", "#d76d77", "bloom"],
  ["#003973", "#e5e5b4", "dunes"],
  ["#232526", "#414345", "graphite"],
];

function svg(from, to, label, seed) {
  const circles = Array.from({ length: 7 }, (_, index) => {
    const cx = ((seed * 37 + index * 91) % 100) + "%";
    const cy = ((seed * 53 + index * 47) % 100) + "%";
    const r = 10 + ((seed + index * 13) % 30);
    const opacity = 0.08 + ((index * 7) % 20) / 100;
    return `<circle cx="${cx}" cy="${cy}" r="${r}%" fill="white" opacity="${opacity.toFixed(2)}"/>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="${from}"/><stop offset="100%" stop-color="${to}"/>
  </linearGradient></defs>
  <rect width="1200" height="800" fill="url(#g)"/>
  ${circles}
  <text x="60" y="740" font-family="monospace" font-size="42" fill="white" opacity="0.85">${label}</text>
</svg>`;
}

async function writeImage(dir, name, buffer) {
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, name);
  fs.writeFileSync(target, buffer);
  console.log("wrote", path.relative(process.cwd(), target));
}

async function main() {
  const wallpaper = path.join(root, "wallpapers");
  const travel = path.join(root, "travel", "coast");
  fs.mkdirSync(travel, { recursive: true });

  let seed = 1;
  for (const [from, to, label] of palettes) {
    const base = svg(from, to, label, seed++);
    const png = await sharp(Buffer.from(base)).png({ quality: 80 }).toBuffer();
    await writeImage(wallpaper, `${label}.png`, png);
  }

  for (let index = 1; index <= 4; index += 1) {
    const [from, to] = palettes[index % palettes.length];
    const base = svg(to, from, `coast-${index}`, index + 40);
    const jpg = await sharp(Buffer.from(base)).jpeg({ quality: 78 }).toBuffer();
    await writeImage(travel, `coast-${String(index).padStart(2, "0")}.jpg`, jpg);
  }

  const gif = await sharp(Buffer.from(svg("#136a8a", "#267871", "animated", 99)))
    .gif({ colors: 64 })
    .toBuffer();
  await writeImage(root, "welcome.gif", gif);

  const flat = await sharp(Buffer.from(svg("#5f2c82", "#49a09d", "root-image", 7)))
    .webp({ quality: 75 })
    .toBuffer();
  await writeImage(root, "root-image.webp", flat);

  console.log(`\nDemo library ready in ${root}`);
}

await main();
