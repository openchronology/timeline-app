// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Following a link to a moment or duration in a live browser: its details open over the
// timeline, which the page scrolls into view, and a moment the whole view would count in a group
// is zoomed into until it is drawn on its own. SCREENSHOT_DIR, when set, keeps screenshots.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { chromium } from 'playwright';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
const port = Number(process.env.PLATFORM_TEST_PORT ?? 5196),
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
  username = 'links_' + suffix;
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
  const { validateDocument } = await import('../dist/core.mjs');
  const store = new PostgresStore(pool);
  // Three moments close together in a long timeline, which its whole view counts as one group,
  // below a description long enough that the timeline starts below the fold.
  const created = await store.create(
    id,
    validateDocument({
      format: 'openchronology',
      version: 1,
      title: 'Moment links ' + suffix,
      description: Array.from({ length: 40 }, (_, i) => `Paragraph ${i} of the introduction.`).join(
        '\n\n',
      ),
      events: [
        { id: 'start', time: '0/1', metadata: { title: 'Start' } },
        { id: 'before', time: '500000/1', metadata: { title: 'Before' } },
        { id: 'target', time: '500010/1', metadata: { title: 'Target' } },
        { id: 'after', time: '500020/1', metadata: { title: 'After' } },
        { id: 'end', time: '1000000/1', metadata: { title: 'End' } },
      ],
      durations: [{ id: 'era', start: '200000/1', end: '300000/1', metadata: { title: 'Era' } }],
    }),
  );
  await pool.query("UPDATE oc_timelines SET visibility='public' WHERE id=$1", [created.id]);
  browser = await chromium.launch(
    process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {},
  );
  const errors = [];
  /** Whether the editor's timeline is within the page's window, below its header. */
  const stageInView = (page) =>
    page.evaluate(() => {
      const frame = document.querySelector('iframe.editor-frame'),
        stage = frame.contentDocument.getElementById('timeline-stage').getBoundingClientRect(),
        top = frame.getBoundingClientRect().top + stage.top;
      return top >= 0 && top + Math.min(stage.height, 200) <= innerHeight;
    });
  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    // The timeline's own page opens at its top.
    await page.goto(`${origin}/timelines/${created.id}`);
    let frame = page.frameLocator('iframe.editor-frame');
    await frame.locator('.event-marker').first().waitFor();
    assert.equal(await stageInView(page), false, 'the timeline starts below the fold');
    assert.equal(await frame.locator('.event-marker[aria-label="Target"]').count(), 0);

    // A moment's link opens its details over the timeline, scrolled into view and zoomed
    // until the moment is drawn on its own.
    await page.goto(`${origin}/timelines/${created.id}/moments/target`);
    frame = page.frameLocator('iframe.editor-frame');
    await frame.locator('#inspector').waitFor({ state: 'visible' });
    assert.match(await frame.locator('#inspector').textContent(), /Target/);
    await frame.locator('.event-marker[aria-label="Target"]').waitFor({ state: 'attached' });
    assert(await stageInView(page), `the timeline is in view at ${viewport.width}px`);
    await page.keyboard.press('Escape');
    await frame.locator('#inspector').waitFor({ state: 'hidden' });
    const marker = frame.locator('.event-marker[aria-label="Target"]');
    await marker.waitFor({ state: 'visible' });
    // Its neighbours too, each alone, and the view kept once found.
    for (const name of ['Before', 'After'])
      assert.equal(await frame.locator(`.event-marker[aria-label="${name}"]`).count(), 1, name);
    assert(await stageInView(page));
    const box = await marker.boundingBox(),
      stage = await frame.locator('#timeline-stage').boundingBox();
    assert(
      Math.abs(box.x + box.width / 2 - (stage.x + stage.width / 2)) < stage.width / 4,
      'the moment is near the middle',
    );

    // A duration's link scrolls to the timeline too.
    await page.goto(`${origin}/timelines/${created.id}/durations/era`);
    frame = page.frameLocator('iframe.editor-frame');
    await frame.locator('#inspector').waitFor({ state: 'visible' });
    await frame.locator('.duration-band').first().waitFor();
    assert(await stageInView(page), 'a duration link shows the timeline');
    if (process.env.SCREENSHOT_DIR) {
      await mkdir(process.env.SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({
        path: resolve(process.env.SCREENSHOT_DIR, `moment-link-${viewport.width}.png`),
      });
    }
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    'PASS moment links in a browser: a moment or duration link scrolls the timeline into view, and a moment opens zoomed until it is drawn alone, on desktop and phone.',
  );
} finally {
  await browser?.close();
  child.kill();
  await pool.query('DELETE FROM oc_timelines WHERE owner_id=$1', [id]);
  await pool.query('DELETE FROM oc_users WHERE id=$1', [id]);
  await pool.end();
}
