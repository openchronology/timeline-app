// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Draws the repository's GitHub social preview, platform/icons/github-preview.png (#479):
// 1280 × 640, GitHub's recommended size, with the project's name and mark, the one-sentence
// definition the home page and FAQ open with, the hosted site's address, and a strip of the
// Rome timeline cut from the site's link-preview screenshot (platform/icons/social-preview.jpg,
// scripts/preview-image.mjs). Drawn with the renderer the site's own previews use (Satori, from
// next/og), in the site's colours, with Noto Serif and Noto Sans (FONT_DIR, the system's Noto
// fonts by default). Upload it under the repository's Settings → General → Social preview.
//
//   node scripts/github-preview.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const require = createRequire(join(root, 'package.json'));
const { ImageResponse } = await import(
  join(root, 'node_modules/next/dist/compiled/@vercel/og/index.node.js')
);
const { createElement: h } = require('react');
const sharp = require('sharp');

const fonts = process.env.FONT_DIR ?? '/usr/share/fonts/truetype/noto';
const out = join(root, 'platform/icons/github-preview.png');
// The site's colours (platform/lib/preview-image.jsx).
const INK = '#192d25',
  PAPER = '#f6f3ea',
  ACCENT = '#c8643b',
  MUTED = '#5d6b63';
// The strip of the screenshot: its rows from the labels above the moments down to the first
// row of labels below them, whole.
const STRIP = { left: 0, top: 232, width: 1200, height: 234 };

const strip = await sharp(join(root, 'platform/icons/social-preview.jpg'))
  .extract(STRIP)
  .resize(1280)
  .png()
  .toBuffer();
const stripHeight = Math.round((STRIP.height * 1280) / STRIP.width);
const logo = await readFile(join(root, 'platform/icons/logo-mark.svg'));
const font = (file) => readFile(join(fonts, file));

const card = h(
  'div',
  {
    style: {
      width: 1280,
      height: 640,
      display: 'flex',
      flexDirection: 'column',
      background: PAPER,
      color: INK,
    },
  },
  h(
    'div',
    { style: { display: 'flex', flexDirection: 'column', padding: '56px 72px 0', flexGrow: 1 } },
    h(
      'div',
      { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
      h(
        'div',
        { style: { display: 'flex', alignItems: 'center' } },
        h('img', {
          src: 'data:image/svg+xml;base64,' + logo.toString('base64'),
          width: 92,
          height: 92,
        }),
        h(
          'div',
          {
            style: {
              fontFamily: 'Serif',
              fontWeight: 700,
              fontSize: 84,
              marginLeft: 28,
              letterSpacing: -1,
            },
          },
          'OpenChronology',
        ),
      ),
      h(
        'div',
        { style: { fontFamily: 'Sans', fontSize: 28, color: ACCENT, fontWeight: 700 } },
        'timescale.info',
      ),
    ),
    h(
      'div',
      {
        style: {
          fontFamily: 'Sans',
          fontSize: 34,
          lineHeight: 1.35,
          color: MUTED,
          marginTop: 26,
          maxWidth: 1120,
        },
      },
      'A free, open-source timeline editor for exact dates at any scale, from deep time to fractions of a second, with sources on every event.',
    ),
  ),
  h('div', { style: { display: 'flex', height: 3, background: ACCENT, opacity: 0.6 } }),
  h('img', {
    src: 'data:image/png;base64,' + strip.toString('base64'),
    width: 1280,
    height: stripHeight,
  }),
);
const image = new ImageResponse(card, {
  width: 1280,
  height: 640,
  fonts: [
    { name: 'Serif', data: await font('NotoSerif-Bold.ttf'), weight: 700, style: 'normal' },
    { name: 'Sans', data: await font('NotoSans-Regular.ttf'), weight: 400, style: 'normal' },
    { name: 'Sans', data: await font('NotoSans-Bold.ttf'), weight: 700, style: 'normal' },
  ],
});
await writeFile(out, Buffer.from(await image.arrayBuffer()));
console.log(out);
