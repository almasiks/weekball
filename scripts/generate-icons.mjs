// Generates PWA icons from a simple SVG football. Run: npm run icons
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

const GREEN = "#1f7a45";

// A classic ball: white circle, black pentagon in the middle, five patches around.
function ball(cx, cy, r) {
  const pentagon = (x, y, size, rotation = -90) =>
    Array.from({ length: 5 }, (_, i) => {
      const a = ((rotation + i * 72) * Math.PI) / 180;
      return `${(x + size * Math.cos(a)).toFixed(1)},${(y + size * Math.sin(a)).toFixed(1)}`;
    }).join(" ");
  const patches = Array.from({ length: 5 }, (_, i) => {
    const a = ((-90 + i * 72) * Math.PI) / 180;
    const x = cx + r * 0.78 * Math.cos(a);
    const y = cy + r * 0.78 * Math.sin(a);
    return `<polygon points="${pentagon(x, y, r * 0.2, -90 + i * 72 + 180)}" fill="#111"/>`;
  }).join("");
  return `
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff" stroke="#111" stroke-width="${r * 0.05}"/>
    <polygon points="${pentagon(cx, cy, r * 0.3)}" fill="#111"/>
    ${patches}`;
}

// `padding` shrinks the ball for maskable icons (safe zone = inner 80%).
const svg = (size, padding) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${padding ? 0 : size * 0.22}" fill="${GREEN}"/>
  <clipPath id="c"><circle cx="${size / 2}" cy="${size / 2}" r="${size * (padding ? 0.3 : 0.36)}"/></clipPath>
  <g clip-path="url(#c)">${ball(size / 2, size / 2, size * (padding ? 0.3 : 0.36))}</g>
</svg>`;

await mkdir("public/icons", { recursive: true });
const outputs = [
  ["icon-192.png", 192, false],
  ["icon-512.png", 512, false],
  ["maskable-512.png", 512, true],
  ["apple-touch-icon.png", 180, true], // iOS rounds corners itself
];
for (const [name, size, padding] of outputs) {
  await sharp(Buffer.from(svg(size, padding))).png().toFile(`public/icons/${name}`);
  console.log(`public/icons/${name}`);
}
await writeFile("public/icons/icon.svg", svg(512, false).trim());
