// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Links between timelines (#422) in a live browser: a moment's details list its links to
// entities on other timelines, each opening that timeline there; its owner links it to an
// event on another of their timelines found in the picker's search (the words marked, nothing
// on its own timeline offered), or to a whole timeline by its pasted address, and removes a
// link; comparing the two timelines draws each link as an arc between the tracks,
// and on one axis when combined, on desktop and phone. The other timeline's editor lists the link
// to it as a whole under Linked from, and removes it (#458). SCREENSHOT_DIR keeps screenshots.
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
const port = Number(process.env.PLATFORM_TEST_PORT ?? 5197),
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
  username = 'xlinks_' + suffix;
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
  const { TimelineLinks } = await import('../server/timeline-links.mjs');
  const { Auth } = await import('../server/auth.mjs');
  const { validateDocument } = await import('../dist/core.mjs');
  const store = new PostgresStore(pool);
  const timeline = (title, events) =>
    store.create(
      id,
      validateDocument({
        format: 'openchronology',
        version: 1,
        title: `${title} ${suffix}`,
        description: '',
        events: events.map(([eid, time, name]) => ({ id: eid, time, metadata: { title: name } })),
      }),
    );
  const rome = await timeline('Rome', [
    ['founding', '0/1', 'Founding of Rome'],
    ['empire', '700/1', 'Augustus'],
  ]);
  const greece = await timeline('Greece', [
    ['olympics', '300/1', 'First Olympics'],
    ['athens', '500/1', 'Athenian democracy'],
  ]);
  await new TimelineLinks(store, { limit: Infinity }).create(
    rome.id,
    id,
    { moment: 'founding' },
    { timeline: greece.id, moment: 'olympics' },
  );
  browser = await chromium.launch(
    process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {},
  );
  const [name, value] = (
    await new Auth(pool, origin).issue(
      (await pool.query('SELECT * FROM oc_users WHERE id=$1', [id])).rows[0],
    )
  ).cookie
    .split(';')[0]
    .split('=');
  const errors = [];
  const count = async () =>
    Number(
      (
        await pool.query(
          'SELECT count(*) FROM oc_timeline_links WHERE a_timeline=ANY($1) OR b_timeline=ANY($1)',
          [[rome.id, greece.id]],
        )
      ).rows[0].count,
    );
  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({ viewport });
    await context.addCookies([{ name, value, url: origin }]);
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    const shot = async (label) => {
      if (!process.env.SCREENSHOT_DIR) return;
      await mkdir(process.env.SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({
        path: resolve(process.env.SCREENSHOT_DIR, `timeline-links-${label}-${viewport.width}.png`),
      });
    };

    // The moment's details list its link to Greece, opening Greece at that moment.
    await page.goto(`${origin}/timelines/${rome.id}/moments/founding`);
    let frame = page.frameLocator('iframe.editor-frame');
    const section = frame.locator('#inspector .timeline-links');
    await section.locator('a.related-entity').first().waitFor();
    const link = section.locator('a.related-entity');
    assert.equal(await link.count(), 1);
    assert.equal(await link.textContent(), `First Olympics · on Greece ${suffix}`);
    assert.equal(
      await link.getAttribute('href'),
      `/${username}/${greece.id}/moments/olympics`,
      'the moment’s own page, Greece open at it',
    );

    // Linking to an event on another of one's timelines, found in the picker as Explore's
    // search finds it (#459), the words marked; nothing on Rome itself is offered.
    const picker = page.frameLocator('iframe.editor-frame').locator('#link-picker');
    const words = picker.getByRole('searchbox');
    await section.getByRole('button', { name: 'Link to another timeline…' }).click();
    await words.fill('Augustus');
    await picker.getByText('Nothing you can link to matches.').waitFor();
    await words.fill('Greece');
    const greeceChoice = picker.locator('#link-picker-results .search-result', {
      hasText: `Greece ${suffix}`,
    });
    await greeceChoice.waitFor();
    assert.equal(await greeceChoice.locator('.picker-kind').textContent(), 'Timeline');
    await words.fill('Athenian');
    const athens = picker.locator('#link-picker-results .search-result', {
      hasText: 'Athenian democracy',
    });
    await athens.waitFor();
    assert.equal(await athens.locator('mark').textContent(), 'Athenian');
    assert.match(
      await athens.locator('.search-meta').textContent(),
      new RegExp(`on Greece ${suffix} by ${username}`),
    );
    await shot('picker');
    await athens.click();
    await picker.waitFor({ state: 'hidden' });
    await section.locator('a.related-entity', { hasText: 'Athenian democracy' }).waitFor();
    frame = page.frameLocator('iframe.editor-frame');
    const links = frame.locator('#inspector .timeline-links a.related-entity');
    assert.equal(await links.count(), 2);
    assert.equal(await count(), 2);
    await shot('details');
    // And removing it.
    await frame
      .locator(
        '#inspector .timeline-links .related-unlink[aria-label="Remove the link with Athenian democracy"]',
      )
      .click();
    await frame
      .locator('#inspector .timeline-links a.related-entity', { hasText: 'Athenian democracy' })
      .waitFor({ state: 'detached' });
    assert.equal(await count(), 1);

    // Linking to Greece as a whole by pasting its address; Rome's own is refused.
    await section.getByRole('button', { name: 'Link to another timeline…' }).click();
    await picker.getByRole('tab', { name: 'Address' }).click();
    const address = picker.getByRole('textbox', { name: 'Address' });
    await address.fill(`${origin}/${username}/${rome.id}`);
    await address.press('Enter');
    await picker
      .getByText('That’s this timeline: relate its events with Add a relationship.')
      .waitFor();
    await address.fill(`${origin}/${username}/${greece.id}`);
    await picker.getByRole('button', { name: 'Find' }).click();
    await picker
      .locator('#link-picker-found .search-result', { hasText: `Greece ${suffix}` })
      .click();
    await picker.waitFor({ state: 'hidden' });
    const wholeLink = section.locator('a.related-entity', { hasText: 'the whole timeline' });
    await wholeLink.waitFor();
    assert.equal(await wholeLink.textContent(), `Greece ${suffix} · the whole timeline`);
    assert.equal(await wholeLink.getAttribute('href'), `/${username}/${greece.id}`);
    assert.equal(await count(), 2);

    // Greece, opened in the editor, lists under Linked from what links to it as a whole
    // (#458), folded until opened; its editor removes the link from that end.
    await page.goto(`${origin}/timelines/${greece.id}`);
    frame = page.frameLocator('iframe.editor-frame');
    const linkedFrom = frame.locator('#linked-from');
    await linkedFrom.waitFor();
    await linkedFrom.locator('summary', { hasText: 'Linked from other timelines' }).click();
    const backLink = linkedFrom.locator('a.related-entity');
    await backLink.waitFor();
    assert.equal(await backLink.count(), 1, 'only the link to all of Greece');
    assert.equal(await backLink.textContent(), `Founding of Rome · on Rome ${suffix}`);
    assert.equal(await backLink.getAttribute('href'), `/${username}/${rome.id}/moments/founding`);
    await shot('linked-from');
    await linkedFrom
      .locator('.related-unlink[aria-label="Remove the link with Founding of Rome"]')
      .click();
    await linkedFrom.waitFor({ state: 'hidden' });
    assert.equal(await count(), 1);

    // Compared, the link is an arc between the tracks; combined, an arc over the one axis.
    await page.goto(`${origin}/compare?timelines=${rome.id},${greece.id}`);
    frame = page.frameLocator('iframe.editor-frame');
    const arc = frame.locator('.edge-arc[data-edge-id^="link:"]');
    await arc.waitFor({ state: 'attached' });
    assert.equal(await arc.count(), 1);
    // Named by its ends, in the link's canonical order.
    assert.match(
      await arc.locator('title').textContent(),
      /^(Founding of Rome ↔ First Olympics|First Olympics ↔ Founding of Rome)$/,
    );
    assert.equal(await arc.evaluate((e) => e.classList.contains('edge-arc-between')), true);
    assert.ok((await arc.getAttribute('d')).length > 0);
    await shot('stacked');
    await frame.locator('#compare-combined').check();
    await frame
      .locator('.edge-arc[data-edge-id^="link:"]:not(.edge-arc-between)')
      .waitFor({ state: 'attached' });
    await shot('combined');
    // Put back for the next viewport.
    await context.close();
    await new TimelineLinks(store, { limit: Infinity }).create(
      rome.id,
      id,
      { moment: 'founding' },
      { timeline: greece.id, moment: 'olympics' },
    );
  }
  assert.deepEqual(errors, []);

  // The pages search engines read (#335) carry the links, so each end's page leads to the
  // other's; only where the reader (a guest, as a crawler is) may read the other timeline.
  const html = async (path) => {
    const response = await fetch(origin + path);
    assert.equal(response.status, 200, path);
    return response.text();
  };
  const olympicsPage = `href="/${username}/${greece.id}/moments/olympics"`;
  await pool.query("UPDATE oc_timelines SET visibility='public' WHERE id=$1", [rome.id]);
  assert(!(await html(`/timelines/${rome.id}/moments/founding`)).includes(olympicsPage));
  await pool.query("UPDATE oc_timelines SET visibility='public' WHERE id=$1", [greece.id]);
  const founding = await html(`/timelines/${rome.id}/moments/founding`);
  assert(founding.includes('On other timelines'));
  assert(founding.includes(olympicsPage), 'Rome’s moment leads to Greece’s');
  assert(
    (await html(`/timelines/${greece.id}/moments/olympics`)).includes(
      `href="/${username}/${rome.id}/moments/founding"`,
    ),
    'and Greece’s back to Rome’s',
  );
  // A link to Greece as a whole: Greece's page lists what links to it.
  await new TimelineLinks(store, { limit: Infinity }).create(
    rome.id,
    id,
    { moment: 'empire' },
    { timeline: greece.id },
  );
  const greecePage = await html(`/timelines/${greece.id}`);
  assert(greecePage.includes('Linked from'));
  assert(greecePage.includes(`href="/${username}/${rome.id}/moments/empire"`));
  assert(
    (await html(`/timelines/${rome.id}/moments/empire`)).includes(
      `href="/${username}/${greece.id}"`,
    ),
  );
  console.log(
    'PASS links between timelines in a browser: listed in a moment’s details, opening the other entity’s page; added from the picker by searching or by an address, and removed; links to a whole timeline under its Linked from, removed there; drawn between compared timelines’ tracks, and over one axis combined, on desktop and phone; in the pages search engines read, both ways, and on a timeline’s page for links to all of it.',
  );
} finally {
  await browser?.close();
  child.kill();
  await pool.query('DELETE FROM oc_timelines WHERE owner_id=$1', [id]);
  await pool.query('DELETE FROM oc_sessions WHERE user_id=$1', [id]);
  await pool.query('DELETE FROM oc_users WHERE id=$1', [id]);
  await pool.end();
}
