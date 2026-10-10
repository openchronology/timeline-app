// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Capacity measurements: how the in-browser editor copes with large timelines, in real
// Chromium at full speed and with 4× processor throttling (roughly a mid-range phone), plus
// what each platform stores. Seed first (node bench/seed.mjs).
// Usage: node bench/capacity.mjs   BENCH_SIZES=1000,10000  BENCH_THROTTLES=1,4
//   BENCH_DATABASE_URL=postgres://… adds PostgreSQL storage per timeline.
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { Q, Viewport } from '../dist/core.mjs';
import { DATA, sizes } from './seed.mjs';

const RESULTS = resolve(process.env.BENCH_RESULTS_DIR ?? 'bench/results');
const THROTTLES = (process.env.BENCH_THROTTLES ?? '1,4').split(',').map(Number);
const SAMPLES = 5;
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

/** Serves the built editor (dist/) to the page, signed in or not, with no server storage. */
async function context(browser, signedIn) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  await context.route('http://localhost:5173/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/session')
      return route.fulfill({
        json: signedIn
          ? { user: { id: 'bench', username: 'bench' }, csrf: 'bench', server: true }
          : { user: null, csrf: null, server: false },
      });
    if (url.pathname.startsWith('/api/'))
      return route.fulfill({ status: 503, json: { error: 'Server storage is not configured.' } });
    const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    if (!/^(index\.html|app\.(js|css))$/.test(name))
      return route.fulfill({ status: 404, body: 'Not found' });
    return route.fulfill({
      body: await readFile(resolve('dist', name)),
      contentType: name.endsWith('.css')
        ? 'text/css'
        : name.endsWith('.html')
          ? 'text/html'
          : 'text/javascript',
    });
  });
  return context;
}
/**
 * Waits until the editor has drawn the view [left, right]: the render writes the bound
 * fields (shown as exact rationals for these timelines, which have no time presentation).
 */
const drawn = (page, view) =>
  page.waitForFunction(
    ([left, right]) =>
      document.getElementById('left-bound').value === left &&
      document.getElementById('right-bound').value === right,
    [view.left.toString(), view.right.toString()],
    { timeout: 15 * 60 * 1000, polling: 'raf' },
  );
/** Opens a fresh editor page, throttled, and imports the timeline; returns timings and heap. */
async function open(browser, throttle, size, text, fitted, signedIn) {
  const ctx = await context(browser, signedIn);
  const page = await ctx.newPage();
  page.setDefaultTimeout(15 * 60 * 1000);
  const cdp = await ctx.newCDPSession(page);
  await page.goto('http://localhost:5173/');
  await page.locator('#json-file').waitFor({ state: 'attached' });
  await cdp.send('HeapProfiler.collectGarbage');
  const before = (await cdp.send('Runtime.getHeapUsage')).usedSize;
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  const start = Date.now();
  await page.locator('#json-file').setInputFiles({
    name: `timeline-${size}.ochx`,
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
  await drawn(page, fitted);
  const opened = Date.now() - start;
  await cdp.send('HeapProfiler.collectGarbage');
  const heap = (await cdp.send('Runtime.getHeapUsage')).usedSize - before;
  return { ctx, page, opened, heap };
}
/** Time to redraw after navigating: alternately the whole view and a slightly shifted one. */
async function redraws(page, fitted) {
  const times = [];
  const shift = fitted.right.sub(fitted.left).div(Q.from(1000n));
  for (let i = 0; i < SAMPLES; i++) {
    const view = i % 2 ? fitted : new Viewport(fitted.left.add(shift), fitted.span);
    const start = Date.now();
    // The exact-bounds fields live in a panel that may be closed; apply them directly.
    await page.evaluate(
      ([left, right]) => {
        document.getElementById('exact-left').value = left;
        document.getElementById('exact-right').value = right;
        document.getElementById('apply-exact-bounds').click();
      },
      [view.left.toString(), view.right.toString()],
    );
    await drawn(page, view);
    times.push(Date.now() - start);
  }
  return times;
}
/** The longest gap between animation frames after renaming the timeline (an edit). */
async function editPause(page) {
  await page.evaluate(() => {
    window.__gaps = [];
    let last = performance.now();
    const tick = (now) => {
      window.__gaps.push(now - last);
      last = now;
      if (window.__gaps.length < 100000) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => (window.__gaps.length = 0));
  const title = page.locator('#timeline-title');
  await title.fill('Renamed ' + Date.now());
  await title.press('Tab');
  // The draft save runs 0.7 s after the edit; watch well past it.
  await page.waitForTimeout(3000);
  return page.evaluate(() => Math.max(...window.__gaps));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await mkdir(RESULTS, { recursive: true });
  const browser = await chromium
    .launch({
      ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}),
    })
    .catch((error) => {
      console.log(
        `Skipping capacity measurements: Chromium is unavailable (npx playwright install chromium). ${error.message.split('\n')[0]}`,
      );
      process.exit(0);
    });
  const rows = [];
  const record = (platform, size, metric, values, throttle = 1) => {
    const list = [values].flat();
    rows.push({ platform, throttle, size, metric, value: median(list), samples: list });
    console.log(
      `${platform}${throttle > 1 ? ` ×${throttle}` : ''} ${size} ${metric}: ${median(list)}`,
    );
  };
  try {
    for (const size of sizes()) {
      const text = await readFile(`${DATA}/timeline-${size}.ochx`, 'utf8');
      const times = JSON.parse(text)
        .events.map((e) => Q.parse(e.time))
        .sort((a, b) => a.compare(b));
      const fitted = Viewport.fit(times[0], times.at(-1));
      for (const throttle of THROTTLES) {
        // Guests keep the timeline in memory only; open and redraw as a guest.
        const opens = [],
          heaps = [];
        let redraw = [];
        for (let i = 0; i < (size >= 100000 ? 2 : 3); i++) {
          const { ctx, page, opened, heap } = await open(
            browser,
            throttle,
            size,
            text,
            fitted,
            false,
          );
          opens.push(opened);
          heaps.push(heap);
          if (i === 0) redraw = await redraws(page, fitted);
          await ctx.close();
        }
        record('browser', size, 'open', opens, throttle);
        record('browser', size, 'redraw', redraw, throttle);
        record('browser', size, 'memory', heaps, throttle);
        // Signed-in editors save a draft of a browser-only timeline after each edit.
        const { ctx, page } = await open(browser, throttle, size, text, fitted, true);
        // Opening stores the whole draft once; measure edits after that.
        await page.waitForFunction(
          () => document.getElementById('save-status').textContent === 'Saved in this browser',
          null,
          { timeout: 15 * 60 * 1000 },
        );
        const pauses = [];
        for (let i = 0; i < 3; i++) pauses.push(await editPause(page));
        // The draft save alone, as the editor measures it.
        const drafts = await page.evaluate(() =>
          performance.getEntriesByName('openchronology:draft-changes').map((e) => e.duration),
        );
        await ctx.close();
        record('browser', size, 'edit', pauses, throttle);
        if (drafts.length) record('browser', size, 'draft', drafts, throttle);
      }
      const file = await stat(`${DATA}/timeline-${size}.och`).catch(() => null);
      if (file) record('sqlite', size, 'storage', file.size);
    }
    if (process.env.BENCH_DATABASE_URL) {
      const { default: pg } = await import('pg');
      const pool = new pg.Pool({ connectionString: process.env.BENCH_DATABASE_URL, max: 1 });
      const seeded = JSON.parse(await readFile(`${DATA}/postgres.json`, 'utf8'));
      try {
        for (const size of sizes()) {
          if (!seeded[size]) continue;
          // The timeline's own rows (moments, indexes, search, links); not history or B-trees.
          const { rows: bytes } = await pool.query(
            `SELECT ${[
              'oc_moments',
              'oc_nodes',
              'oc_duration_nodes',
              'oc_edge_nodes',
              'oc_entity_search',
              'oc_relationships',
            ]
              .map(
                (t) =>
                  `(SELECT coalesce(sum(pg_column_size(x.*)),0) FROM ${t} x WHERE x.timeline_id=$1)`,
              )
              .join('+')} AS bytes`,
            [seeded[size].id],
          );
          record('postgres', size, 'storage', Number(bytes[0].bytes));
        }
      } finally {
        await pool.end();
      }
    }
  } finally {
    await browser.close();
  }
  await writeFile(
    `${RESULTS}/capacity.json`,
    JSON.stringify(
      {
        chromium: browser.version?.() ?? null,
        throttles: THROTTLES,
        finished: new Date().toISOString(),
        rows,
      },
      null,
      2,
    ),
  );
}
