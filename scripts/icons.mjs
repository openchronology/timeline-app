// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Draws every icon the site and the desktop app use from logo/mark.svg and logo/small.svg:
// the favicons, the mobile home-screen and web-app icons, and the Windows, macOS and Linux
// app icons. Run `node scripts/icons.mjs` after changing either drawing; its output is in git.
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
// sharp comes with Next.js (for its image optimizer); it draws SVG with librsvg.
const sharp = createRequire(import.meta.url)('sharp');

const mark = await readFile('logo/mark.svg', 'utf8');
const small = await readFile('logo/small.svg', 'utf8');
/** The mark's drawing without its <svg> element, to place on a background. */
const inner = mark.replace(/^[\s\S]*?<svg[^>]*>|<\/svg>\s*$/g, '');
const TILE = '#192d25';

/**
 * The mark on a dark green background, in a 256-unit square.
 * @param {object} options
 * @param {number} options.inset how far the background stands in from the edge (macOS's margin)
 * @param {number} options.radius the background's corner radius; 0 fills the square to its edges
 * @param {number} options.scale the mark's size on it (1 as drawn; smaller for a safe zone)
 */
function tile({ inset = 0, radius = 56, scale = 1 } = {}) {
  const size = 256 - 2 * inset;
  const k = (size / 256) * scale;
  const offset = 128 - 128 * k;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <defs><radialGradient id="och-tile" gradientUnits="userSpaceOnUse" cx="102" cy="90" r="205"><stop offset="0" stop-color="#21392f"/><stop offset="1" stop-color="#142520"/></radialGradient></defs>
  <rect x="${inset}" y="${inset}" width="${size}" height="${size}" rx="${radius}" fill="url(#och-tile)"/>
  <g transform="translate(${offset} ${offset}) scale(${k})">${inner}</g>
</svg>
`;
}

/** A drawing as a PNG, `px` pixels square. */
const png = (svg, px) =>
  sharp(Buffer.from(svg), { density: Math.max(72, (72 * px) / 32) })
    .resize(px, px)
    .png({ compressionLevel: 9 })
    .toBuffer();
/** The drawing for a size: the bolder one at favicon sizes, the full one above them. */
const at = (px, svg = tile()) => png(px <= 32 ? small : svg, px);

/** A Windows .ico holding PNG images, one per size. */
async function ico(sizes) {
  const images = await Promise.all(sizes.map((px) => at(px)));
  const head = Buffer.alloc(6 + 16 * images.length);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach((image, i) => {
    const entry = 6 + 16 * i;
    head[entry] = head[entry + 1] = sizes[i] >= 256 ? 0 : sizes[i];
    head.writeUInt16LE(1, entry + 4);
    head.writeUInt16LE(32, entry + 6);
    head.writeUInt32LE(image.length, entry + 8);
    head.writeUInt32LE(offset, entry + 12);
    offset += image.length;
  });
  return Buffer.concat([head, ...images]);
}

/** A macOS .icns holding PNG images, in Apple's layout: a margin around a rounded square. */
async function icns() {
  const mac = tile({ inset: 25, radius: 46 });
  const types = [
    ['icp4', 16],
    ['icp5', 32],
    ['ic11', 32],
    ['ic12', 64],
    ['ic07', 128],
    ['ic08', 256],
    ['ic13', 256],
    ['ic09', 512],
    ['ic14', 512],
    ['ic10', 1024],
  ];
  const parts = [];
  for (const [type, px] of types) {
    const image = await png(mac, px);
    const head = Buffer.alloc(8);
    head.write(type, 0, 'ascii');
    head.writeUInt32BE(image.length + 8, 4);
    parts.push(head, image);
  }
  const head = Buffer.alloc(8);
  head.write('icns', 0, 'ascii');
  head.writeUInt32BE(8 + parts.reduce((sum, part) => sum + part.length, 0), 4);
  return Buffer.concat([head, ...parts]);
}

await mkdir('platform/icons', { recursive: true });
const files = {
  'logo/logo.svg': tile(),
  // The site: a tab icon in SVG and .ico, the iPhone and iPad home-screen icon (iOS rounds
  // its corners itself), and the web app manifest's icons, whose "maskable" one keeps the mark
  // inside the circle Android may crop it to.
  'platform/app/icon.svg': small,
  'platform/app/favicon.ico': await ico([16, 32, 48]),
  'platform/app/apple-icon.png': await png(tile({ radius: 0, scale: 0.86 }), 180),
  'platform/icons/icon-192.png': await at(192),
  'platform/icons/icon-512.png': await at(512),
  'platform/icons/icon-maskable-512.png': await png(tile({ radius: 0, scale: 0.78 }), 512),
  'platform/icons/logo-mark.svg': mark,
  // The desktop app.
  'src-tauri/icons/icon.svg': tile(),
  'src-tauri/icons/icon.png': await at(256),
  'src-tauri/icons/icon.ico': await ico([16, 24, 32, 48, 64, 128, 256]),
  'src-tauri/icons/icon.icns': await icns(),
};
for (const [file, data] of Object.entries(files)) await writeFile(file, data);
// The editor's own page, which also runs offline as one file, carries its tab icon inline.
const page = await readFile('src/index.html', 'utf8');
const link = `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,${Buffer.from(small.trim().replace(/\n\s*/g, '')).toString('base64')}" />`;
await writeFile('src/index.html', page.replace(/<link\s+rel="icon"[^>]*\/>/, link));
console.log([...Object.keys(files), 'src/index.html'].join('\n'));
console.log('Now run: npx prettier --write src/index.html');
