// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Renders a video's page.html to JPEG frames, in parallel pages.
// Usage (in the video's folder): node ../common/render.mjs <fps> <workers> [from] [to] [outdir]
// or, for a few stills to check: node ../common/render.mjs <fps> <workers> --at 3.5,12,40 [outdir]
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';

const fps = +process.argv[2] || 30,
  workers = +process.argv[3] || 6;
const out = process.argv[6] || `${process.cwd()}/frames`;
mkdirSync(out, { recursive: true });
// A short (video.json's "format": "vertical") is 1080 × 1920.
const vertical = JSON.parse(readFileSync('video.json', 'utf8')).format === 'vertical';
const viewport = vertical ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 };
const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
const FACES = ['Saira Condensed', 'IBM Plex Mono', 'EB Garamond'];
async function newPage() {
  const page = await browser.newPage({ viewport });
  // Fonts load only when first used; load every face the scenes use before drawing any frame,
  // and reload the page if one didn't arrive (it can time out when the machine is busy).
  for (let attempt = 1; ; attempt++) {
    await page.goto(`file://${process.cwd()}/page.html`);
    await page.evaluate(
      (faces) =>
        Promise.all(
          faces.flatMap((family) =>
            [400, 500, 600, 700].map((weight) => document.fonts.load(`${weight} 12px "${family}"`)),
          ),
        ),
      FACES,
    );
    await page.evaluate(() => document.fonts.ready);
    const ok = await page.evaluate(
      (faces) =>
        faces.every((f) => document.fonts.check(`600 12px "${f}"`)) &&
        [...document.fonts].filter((f) => f.status === 'loaded').length >= faces.length,
      FACES,
    );
    if (ok) break;
    if (attempt === 5) throw new Error('web fonts did not load');
    console.log('fonts not loaded; reloading', attempt);
  }
  await page.waitForTimeout(500);
  return page;
}
/** Waits for the frame's images (the tours' captured shots) before the screenshot. */
const settled = (page) =>
  page.evaluate(() =>
    Promise.all(
      [...document.querySelectorAll('image')].map(
        (img) =>
          new Promise((done) => {
            const probe = new Image();
            probe.onload = probe.onerror = done;
            probe.src = img.getAttribute('href');
          }),
      ),
    ),
  );
const first = await newPage();
const total = await first.evaluate(() => TL.total);
if (process.argv[4] === '--at') {
  const dir = process.argv[6] || `${process.cwd()}/stills`;
  mkdirSync(dir, { recursive: true });
  for (const t of process.argv[5].split(',').map(Number)) {
    const missing = await first.evaluate((t) => renderAt(t), t);
    await settled(first);
    await first.screenshot({ path: `${dir}/${t.toFixed(2)}.jpg`, type: 'jpeg', quality: 85 });
    if (missing.length) console.log(t, 'missing cues:', missing.join(', '));
  }
  console.log('total', total, 's; stills in', dir);
  await browser.close();
  process.exit(0);
}
const from = process.argv[4] !== undefined ? Math.round(+process.argv[4] * fps) : 0;
const end = Math.ceil(total * fps);
const to = process.argv[5] !== undefined ? Math.min(Math.round(+process.argv[5] * fps), end) : end;
// Report any cue word that isn't in the narration, and any scene that throws.
const missing = new Set();
for (let t = 0; t < total; t += 0.5)
  (await first.evaluate((t) => renderAt(t), t)).forEach((m) => missing.add(m));
console.log(
  'missing cues:',
  [...missing].join(', ') || 'none',
  '| total',
  total,
  's, frames',
  from,
  '-',
  to,
);
const pages = [first];
for (let i = 1; i < workers; i++) pages.push(await newPage());
let next = from,
  done = 0;
await Promise.all(
  pages.map(async (page) => {
    while (next < to) {
      const f = next++;
      await page.evaluate((t) => renderAt(t), f / fps);
      await settled(page);
      await page.screenshot({
        path: `${out}/${String(f).padStart(5, '0')}.jpg`,
        type: 'jpeg',
        quality: 92,
      });
      if (++done % 900 === 0) console.log('frames', done);
    }
  }),
);
await browser.close();
console.log('done', done);
