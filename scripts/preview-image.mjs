// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Captures the site's link-preview image (#390), platform/icons/social-preview.jpg: a running
// platform's editor, in the light theme and full screen, showing a timeline from an .ochx
// file between two years, at 1200 × 630. Nothing but the platform is fetched.
// Usage: node scripts/preview-image.mjs <origin> <timeline.ochx> <out.jpg|.png> [from to density]
// The committed image: the Ancient Rome tour's sample timeline (the publicity repository's
// videos/19-tour-ancient-rome/sample/rome.ochx), `-170 225 14`, in Playwright's container.
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const [origin, file, out, from = '', to = '', density = ''] = process.argv.slice(2);
if (!origin || !file || !out) {
  console.error(
    'Usage: node scripts/preview-image.mjs <origin> <timeline.ochx> <out> [from to density]',
  );
  process.exit(2);
}
const sample = readFileSync(file, 'utf8');
const { title } = JSON.parse(sample);
/** The first of January of `year` (negative before 1 CE) as the bound fields read it. */
function yearStart(year) {
  const date = new Date(0);
  date.setUTCFullYear(Number(year), 0, 1);
  return date.toISOString().replace('.000Z', 'Z');
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    colorScheme: 'light',
  });
  // Only the platform: pictures the timeline links elsewhere are left out.
  const site = new URL(origin).origin;
  await page.route(
    (url) => url.origin !== site,
    (route) => route.abort(),
  );
  await page.goto(origin + '/editor?new=1&theme=light');
  const frame = await (await page.waitForSelector('iframe')).contentFrame();
  await frame.locator('#json-file').setInputFiles({
    name: 'timeline.ochx',
    mimeType: 'application/json',
    buffer: Buffer.from(sample),
  });
  await frame.waitForFunction(
    (title) => document.getElementById('timeline-title').value === title,
    title,
  );
  await frame.addStyleTag({ content: '.toast{display:none!important}' });
  await frame.locator('#fullscreen-button').click();
  if (density)
    await frame.evaluate((value) => {
      const input = document.getElementById('density');
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, density);
  if (from && to)
    await frame.evaluate(
      ([left, right]) => {
        document.getElementById('left-bound').value = left;
        document.getElementById('right-bound').value = right;
        document.getElementById('apply-bounds').click();
      },
      [yearStart(from), yearStart(to)],
    );
  await page.waitForTimeout(1500);
  const png = out.endsWith('.png');
  await page.screenshot({ path: out, type: png ? 'png' : 'jpeg', ...(png ? {} : { quality: 82 }) });
} finally {
  await browser.close();
}
