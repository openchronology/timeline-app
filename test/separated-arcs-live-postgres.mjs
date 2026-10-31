// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Relationship arcs on a separated server timeline, in a live browser (#415): separated by tags,
// links within a track arc over its axis and links between the tracks cross the gap from one
// event to the other, with the Relationship arrows plugin's arrowheads; only the upper track's
// queries ask for arcs. SCREENSHOT_DIR, when set, keeps light and dark screenshots.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { chromium } from 'playwright';
import { Auth } from '../server/auth.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
const port = Number(process.env.PLATFORM_TEST_PORT ?? 5195),
  origin = `http://127.0.0.1:${port}`;
const env = {
  ...process.env,
  NODE_ENV: 'production',
  APP_ORIGIN: origin,
  OCH_APP_ROOT: process.cwd(),
  NEXT_TELEMETRY_DISABLED: '1',
  PORT: String(port),
  HOSTNAME: '127.0.0.1',
};
for (const key of Object.keys(env))
  if (key.startsWith('OAUTH_') || ['PLUGIN_LIBRARY', 'FEATURED_TIMELINES'].includes(key))
    delete env[key];
const child = spawn(
  process.execPath,
  [resolve(process.env.PLATFORM_TEST_SERVER ?? 'platform/.next/standalone/platform/server.cjs')],
  { env, stdio: ['ignore', 'pipe', 'pipe'] },
);
let logs = '',
  exited = false;
for (const s of [child.stdout, child.stderr])
  s.on('data', (c) => (logs = (logs + c).slice(-12000)));
child.on('exit', () => (exited = true));

const suffix = Date.now().toString(36),
  id = randomUUID(),
  username = 'arcs_' + suffix;
let browser;
try {
  for (let i = 0; i < 100 && !exited; i++) {
    try {
      if ((await fetch(origin + '/healthz', { signal: AbortSignal.timeout(500) })).ok) break;
    } catch {}
    await delay(200);
  }
  assert(!exited, logs);
  await pool.query(
    'INSERT INTO oc_users(id,username,email_verified_at,terms_version) VALUES($1,$2,now(),oc_policy_version())',
    [id, username],
  );
  const { PostgresStore } = await import('../server/store.mjs');
  const { validateDocument, RELATIONSHIP_ARROWS } = await import('../dist/core.mjs');
  const store = new PostgresStore(pool);
  // Two events tagged "war" (above, once separated) and two not (below); a link within each
  // side and two between them, one with an arrow from Battle to Harvest.
  const created = await store.create(
    id,
    validateDocument({
      format: 'openchronology',
      version: 1,
      title: 'Separated arcs ' + suffix,
      description: '',
      plugins: [{ manifest: RELATIONSHIP_ARROWS, enabled: true }],
      events: [
        { id: 'siege', time: '10/1', metadata: { title: 'Siege', tags: ['war'] } },
        { id: 'market', time: '30/1', metadata: { title: 'Market' } },
        {
          id: 'battle',
          time: '60/1',
          metadata: {
            title: 'Battle',
            tags: ['war'],
            arrows: [{ target: { moment: 'harvest' }, arrow: 'to' }],
          },
        },
        { id: 'harvest', time: '85/1', metadata: { title: 'Harvest' } },
      ],
      relationships: [
        { a: { moment: 'siege' }, b: { moment: 'battle' } },
        { a: { moment: 'market' }, b: { moment: 'harvest' } },
        { a: { moment: 'siege' }, b: { moment: 'market' } },
        { a: { moment: 'battle' }, b: { moment: 'harvest' } },
      ],
    }),
  );
  const user = (await pool.query('SELECT * FROM oc_users WHERE id=$1', [id])).rows[0];
  const [name, value] = (await new Auth(pool, origin).issue(user)).cookie.split(';')[0].split('=');

  browser = await chromium.launch(
    process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {},
  );
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies([{ name, value, url: origin }]);
  const page = await context.newPage();
  const errors = [],
    queries = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith(`/timelines/${created.id}/query`))
      queries.push(request.postDataJSON());
  });
  await page.goto(`${origin}/timelines/${created.id}`);
  const frame = page.frameLocator('iframe.editor-frame');
  await frame.locator('.event-marker').first().waitFor();
  await frame.locator('#left-bound').fill('0');
  await frame.locator('#right-bound').fill('100');
  await frame.locator('#apply-bounds').click();
  await frame.locator('.edge-arc').nth(3).waitFor({ state: 'attached' });

  // Separate by "war".
  await frame.locator('#separate-button').click();
  await frame.locator('#separate-dialog').getByLabel('war (2)').check();
  await frame.locator('#separate-submit').click();
  await frame.locator('#separation-settings').waitFor({ state: 'visible' });
  const editor = page.frames().find((f) => f.url().includes('/editor'));
  assert(editor, 'the editor frame');
  await editor.waitForFunction(
    () =>
      document.querySelectorAll('.edge-arc').length === 4 &&
      document.querySelectorAll('.edge-arc-between').length === 2,
  );
  // Settled once the markers are on their tracks: Siege and Battle above Market and Harvest.
  await editor.waitForFunction(() => {
    const y = (name) =>
      document.querySelector(`.event-marker[aria-label="${name}"]`)?.getBoundingClientRect().y;
    return y('Siege') < y('Market') - 100 && y('Battle') < y('Harvest') - 100;
  });
  await delay(600);
  const arcs = await editor.evaluate(() => {
    const svg = document.getElementById('edge-arcs'),
      box = svg.getBoundingClientRect(),
      scale = box.width / parseFloat(svg.style.width);
    const at = (p) => ({ x: box.x + p.x * scale, y: box.y + p.y * scale });
    const marker = (name) => {
      const r = document
        .querySelector(`.event-marker[aria-label="${name}"]`)
        .getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    };
    return {
      markers: Object.fromEntries(
        ['Siege', 'Market', 'Battle', 'Harvest'].map((n) => [n, marker(n)]),
      ),
      arcs: [...svg.querySelectorAll('.edge-arc')].map((arc) => {
        const next = arc.nextElementSibling;
        return {
          title: arc.querySelector('title').textContent,
          between: arc.classList.contains('edge-arc-between'),
          start: at(arc.getPointAtLength(0)),
          end: at(arc.getPointAtLength(arc.getTotalLength())),
          heads: next?.classList.contains('edge-arrows')
            ? next.getAttribute('d').split('M').length - 1
            : 0,
        };
      }),
    };
  });
  const near = (p, q) => Math.hypot(p.x - q.x, p.y - q.y) < 12;
  const byTitle = Object.fromEntries(arcs.arcs.map((a) => [a.title, a]));
  // Named by the link's ends in their stored order, with the arrow's direction when it has one.
  assert.deepEqual(Object.keys(byTitle).sort(), [
    'Battle → Harvest',
    'Battle ↔ Siege',
    'Harvest ↔ Market',
    'Market ↔ Siege',
  ]);
  for (const [title, a, b, between] of [
    ['Battle ↔ Siege', 'Battle', 'Siege', false],
    ['Harvest ↔ Market', 'Harvest', 'Market', false],
    ['Market ↔ Siege', 'Market', 'Siege', true],
    ['Battle → Harvest', 'Battle', 'Harvest', true],
  ]) {
    const arc = byTitle[title],
      [p, q] = [arcs.markers[a], arcs.markers[b]];
    assert.equal(arc.between, between, title);
    // Each arc runs from one event's marker to the other's.
    assert(
      (near(arc.start, p) && near(arc.end, q)) || (near(arc.start, q) && near(arc.end, p)),
      `${title}: ${JSON.stringify(arc)} ${JSON.stringify(arcs.markers)}`,
    );
  }
  // Battle's arrow points to Harvest, across the tracks.
  assert.equal(byTitle['Battle → Harvest'].heads, 1);
  assert.equal(byTitle['Market ↔ Siege'].heads, 0);
  // Only the upper track asks for arcs; the lower track's overviews ask for none.
  const overviews = queries.filter((q) => q.kind === 'overview' && q.filter);
  assert(overviews.some((q) => q.filter.mode === 'any' && q.arcs === undefined));
  assert(overviews.every((q) => (q.filter.mode === 'none') === (q.arcs === false)));
  if (process.env.SCREENSHOT_DIR) {
    await mkdir(process.env.SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({
      path: resolve(process.env.SCREENSHOT_DIR, 'separated-arcs-light.png'),
    });
    await page.emulateMedia({ colorScheme: 'dark' });
    await delay(400);
    await page.screenshot({ path: resolve(process.env.SCREENSHOT_DIR, 'separated-arcs-dark.png') });
    await page.emulateMedia({ colorScheme: 'light' });
  }
  // Rejoined, the same four arcs over one axis.
  await frame.locator('#separation-rejoin').click();
  await frame.locator('#separation-settings').waitFor({ state: 'hidden' });
  await editor.waitForFunction(
    () =>
      document.querySelectorAll('.edge-arc').length === 4 &&
      !document.querySelector('.edge-arc-between'),
  );
  assert.deepEqual(errors, []);
  console.log(
    'PASS separated arcs in a browser: within each track and between them, with arrowheads; the lower track asks for none.',
  );
} finally {
  await browser?.close();
  child.kill();
  await pool.query('DELETE FROM oc_timelines WHERE owner_id=$1', [id]);
  await pool.query('DELETE FROM oc_users WHERE id=$1', [id]);
  await pool.end();
}
