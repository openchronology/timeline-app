// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Captures the tours' shots of the real editor: opens a sample timeline in the built editor
// (dist/), in full screen, and records each shot frame by frame as JPEGs, moving the view
// between keyframes through Left bound, Right bound and Go, as a reader would, and running
// the shot's actions (open a moment, separate by tags, turn on view mode) at their times.
// Writes shots/<id>/NNNN.jpg and shots.js (each shot's frame count) in the video's folder.
// Usage (in the Playwright image, from the repository): node publicity/video/common/capture.mjs <video folder> [shot ids...]
//
// shots.json: { "sample": "../samples/usa.ochx", "shots": [ { "id": "fit", "dur": 5,
//   "keys": [ { "t": 0, "view": [left, right] }, { "t": 4, "view": [left, right] } ],
//   "actions": [ { "t": 1, "do": "open", "title": "Brown v. Board of Education" } ] } ] }
// Views are in the sample's stored coordinates (seconds, as numbers or decimal strings).
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, join } from 'node:path';
import { chromium } from 'playwright';

const folder = resolve(process.argv[2]);
const only = process.argv.slice(3);
const config = JSON.parse(readFileSync(join(folder, 'shots.json'), 'utf8'));
const sample = readFileSync(resolve(folder, config.sample), 'utf8');
const doc = JSON.parse(sample);
const [width, height] = config.size ?? [1600, 900];
const fps = config.fps ?? 30;
const dist = resolve(new URL('../../../dist', import.meta.url).pathname);

// The built editor, served as a static site would serve it; the API answers that there's no
// server, so the timeline is an in-memory one.
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};
const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  if (path === '/api/session') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end('{"user":null,"csrf":null,"server":false}');
  }
  if (path.startsWith('/api/')) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    return res.end('{"error":"Server storage is not configured."}');
  }
  try {
    const body = readFileSync(join(dist, path === '/' ? 'index.html' : path));
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)] ?? 'text/html' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}).listen(0);
const port = server.address().port;

/** The bound text for stored coordinate t, in the sample's time display. */
const presentation = doc.presentation ?? {
  mode: 'rational',
  unit: '',
  scale: '1/1',
  origin: '0/1',
};
const ratio = (s) => {
  const [n, d = '1'] = String(s).split('/');
  return Number(n) / Number(d);
};
function boundText(t) {
  if (presentation.mode === 'gregorian') {
    const whole = Math.floor(t),
      frac = t - whole;
    const iso = new Date(whole * 1000).toISOString();
    return frac > 1e-7
      ? iso.replace('.000Z', '.' + frac.toFixed(6).slice(2) + 'Z')
      : iso.replace('.000Z', 'Z');
  }
  const value = (t - ratio(presentation.origin)) / ratio(presentation.scale);
  const text = Number(value.toPrecision(17)).toString();
  return presentation.unit ? `${text} ${presentation.unit}` : text;
}
/** The view between keyframes a and b at progress p: the span moves geometrically, and the
    centre so that what's at the target stays put (a zoom into a point, not a slide past it). */
function between(a, b, p) {
  const [l0, r0] = a.view.map(Number),
    [l1, r1] = b.view.map(Number);
  const s0 = r0 - l0,
    s1 = r1 - l1,
    c0 = (l0 + r0) / 2,
    c1 = (l1 + r1) / 2;
  const e = b.ease === 'linear' ? p : p * p * (3 - 2 * p);
  const s = Math.exp(Math.log(s0) + (Math.log(s1) - Math.log(s0)) * e);
  const c =
    Math.abs(s0 - s1) > 1e-12 * Math.max(s0, s1)
      ? c1 + ((c0 - c1) * (s - s1)) / (s0 - s1)
      : c0 + (c1 - c0) * e;
  return [c - s / 2, c + s / 2];
}
function viewAt(keys, t) {
  if (t <= keys[0].t) return keys[0].view.map(Number);
  for (let i = 1; i < keys.length; i++)
    if (t <= keys[i].t)
      return between(keys[i - 1], keys[i], (t - keys[i - 1].t) / (keys[i].t - keys[i - 1].t));
  return keys.at(-1).view.map(Number);
}

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width, height },
  deviceScaleFactor: config.scale ?? 1.2,
});
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => d.accept());

async function open() {
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForTimeout(800);
  await page.keyboard.press('Escape');
  await page.locator('#json-file').setInputFiles({
    name: 'sample.ochx',
    mimeType: 'application/json',
    buffer: Buffer.from(sample),
  });
  await page.waitForFunction(
    (title) => document.getElementById('timeline-title').value === title,
    doc.title,
  );
  // Hide the import toast and give the timeline the window, as Full screen does.
  await page.addStyleTag({
    content: '.toast{display:none!important} .focus-card{transition:none!important}',
  });
  await page.keyboard.press('Escape');
  await page.locator('#fullscreen-button').click();
  await page.waitForTimeout(600);
}
async function go([l, r]) {
  await page.evaluate(
    ([left, right]) => {
      document.getElementById('left-bound').value = left;
      document.getElementById('right-bound').value = right;
      document.getElementById('apply-bounds').click();
    },
    [boundText(l), boundText(r)],
  );
}
const frame = () =>
  page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );
/** Finds a marker (moment, duration band, heading) whose title starts with `title`, matching
    case: markers name themselves in their accessible name, headings in their text. */
async function marker(title) {
  const starts = new RegExp('^\\s*' + title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const all = page.locator(
    '#markers .event-marker, #duration-bands .duration-band, #stack-markers .event-marker',
  );
  const named = all.and(page.locator(`[aria-label^="${title.replace(/"/g, '\\"')}"]`));
  return (await named.count()) ? named.first() : all.filter({ hasText: starts }).first();
}
const ACTIONS = {
  async open(a) {
    await (await marker(a.title)).dispatchEvent('click');
  },
  async hover(a) {
    await (await marker(a.title)).hover({ force: true });
  },
  async press(a) {
    await page.keyboard.press(a.key);
  },
  async click(a) {
    await page.locator(a.selector).first().click();
  },
  async separate(a) {
    await page.locator('#separate-button').click();
    for (const tag of a.tags)
      await page
        .locator('#separate-dialog label', { hasText: new RegExp(`^\\s*${tag}\\b`) })
        .first()
        .click();
    await page.locator('#separate-dialog button', { hasText: /^Separate$/ }).click();
  },
  async rejoin() {
    await page.locator('#separation-rejoin').click();
  },
  async viewMode(a) {
    // Full screen covers the switch, so set it as a click would, through its change event.
    await page.evaluate((on) => {
      const box = document.getElementById('view-mode');
      if (box.checked !== on) {
        box.checked = on;
        box.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, a.on);
  },
  async eval(a) {
    await page.evaluate(a.js);
  },
};

const out = {};
for (const shot of config.shots) {
  if (only.length && !only.includes(shot.id)) continue;
  await open();
  for (const a of shot.setup ?? []) await ACTIONS[a.do](a);
  const dir = join(folder, 'shots', shot.id);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const frames = Math.round(shot.dur * fps);
  const pending = [...(shot.actions ?? [])].sort((a, b) => a.t - b.t);
  for (let f = 0; f < frames; f++) {
    const t = f / fps;
    if (shot.keys) await go(viewAt(shot.keys, t));
    while (pending.length && pending[0].t <= t) {
      const a = pending.shift();
      await ACTIONS[a.do](a);
    }
    await frame();
    if (f === 0) await page.waitForTimeout(300);
    await page.screenshot({
      path: join(dir, String(f).padStart(4, '0') + '.jpg'),
      type: 'jpeg',
      quality: 88,
    });
  }
  out[shot.id] = { frames, fps, width, height };
  console.log(shot.id, frames, 'frames');
}
// Keep shots captured before (when only some were asked for).
let previous = {};
try {
  previous = JSON.parse(
    readFileSync(join(folder, 'shots.js'), 'utf8')
      .replace(/^(\/\/.*\n)?var SHOTS = /, '')
      .replace(/;\s*$/, ''),
  );
} catch {}
writeFileSync(
  join(folder, 'shots.js'),
  "// Generated by common/capture.mjs: each captured shot's frame count, rate and size, for the page.\n" +
    'var SHOTS = ' +
    JSON.stringify({ ...previous, ...out }) +
    ';\n',
);
await browser.close();
server.close();
if (errors.length) console.log('page errors:', errors);
