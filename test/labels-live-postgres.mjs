// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Sensitive-content labels in a live browser (#115): a labelled timeline opens behind a
// warning for readers, its images blurred until shown; a labelled moment's images are blurred
// in an unlabelled timeline; owners see their own as it is, and label moments and timelines.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { chromium } from 'playwright';
import { passwordHash } from '../server/auth.mjs';
import { PostgresStore } from '../server/store.mjs';
import { validateDocument, MOMENT_ICONS } from '../dist/core.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
const port = Number(process.env.PLATFORM_TEST_PORT ?? 5191),
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

const owner = randomUUID(),
  username = 'labeller_' + owner.slice(0, 8),
  password = 'labels-browser-password-2026';
/** Signs in over the API; the session's cookies, as [name, value] pairs. */
async function signIn(as = username) {
  const cookies = new Map();
  let csrf;
  for (const [path, data] of [['/api/session'], ['/api/auth/login', { username: as, password }]]) {
    const res = await fetch(origin + path, {
      method: data ? 'POST' : 'GET',
      headers: {
        Origin: origin,
        ...(cookies.size ? { Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
        ...(data ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
    for (const header of res.headers.getSetCookie()) {
      const [key, value] = header.split(';')[0].split('=');
      if (value) cookies.set(key, value);
      else cookies.delete(key);
    }
    const value = await res.json();
    assert(res.ok, `${path}: ${JSON.stringify(value)}`);
    csrf = value.csrf ?? csrf;
  }
  return [...cookies];
}
const icon = 'https://images.example.test/icon.png',
  // One pixel, served from the timeline's own images so the test needs no network.
  pixel =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
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
    'INSERT INTO oc_users(id,username,email_verified_at,password_hash,quota_bypass) VALUES($1,$2,now(),$3,true)',
    [owner, username, await passwordHash(password)],
  );
  const store = new PostgresStore(pool);
  const create = async (title, events, labels = []) => {
    const t = await store.create(
      owner,
      validateDocument({
        format: 'openchronology',
        version: 1,
        title,
        description: '',
        plugins: [{ manifest: MOMENT_ICONS, enabled: true }],
        assets: { [icon]: pixel },
        events,
      }),
    );
    await pool.query("UPDATE oc_timelines SET visibility='public',content_labels=$2 WHERE id=$1", [
      t.id,
      labels,
    ]);
    return t.id;
  };
  const moment = (id, title, days, extra = {}) => ({
    id,
    time: `${days * 86400}/1`,
    metadata: { title, iconUrl: icon, ...extra },
  });
  const war = await create(
    'A labelled war',
    [moment('battle', 'Battle', 0), moment('treaty', 'Treaty', 10)],
    ['violence'],
  );
  const history = await create('A mostly calm history', [
    moment('market', 'Market', 0),
    moment('massacre', 'Massacre', 10, { content_labels: ['violence'] }),
  ]);

  browser = await chromium.launch(
    process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {},
  );
  const errors = [];
  const tab = async (cookies = []) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    if (cookies.length)
      await context.addCookies(cookies.map(([name, value]) => ({ name, value, url: origin })));
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    return page;
  };
  const blurred = (frame, title) =>
    frame
      .locator(`.event-marker[aria-label="${title}"] img`)
      .evaluate((img) => getComputedStyle(img).filter.includes('blur'));

  // A reader is warned before a labelled timeline opens.
  const reader = await tab();
  await reader.goto(`${origin}/timelines/${war}`);
  const frame = reader.frameLocator('iframe.editor-frame');
  const gate = frame.locator('#sensitive-gate');
  await gate.waitFor();
  assert.match(await gate.textContent(), /labelled as containing graphic violence/);
  await frame.locator('#sensitive-gate-show').click();
  await gate.waitFor({ state: 'hidden' });
  // Its images stay blurred until shown.
  await frame.locator('.event-marker[aria-label="Battle"] img').waitFor({ state: 'attached' });
  assert(await blurred(frame, 'Battle'));
  assert(await blurred(frame, 'Treaty'));
  assert.match(
    await frame.locator('#sensitive-status').textContent(),
    /Sensitive: graphic violence/,
  );
  await frame.locator('#sensitive-status .reveal-images').click();
  assert(!(await blurred(frame, 'Battle')));
  // Chosen once in a tab, it stays chosen there.
  await reader.reload();
  await frame.locator('.event-marker[aria-label="Battle"] img').waitFor({ state: 'attached' });
  assert(await gate.isHidden());
  assert(!(await blurred(frame, 'Battle')));

  // A comparison with a labelled source opens behind the warning too (a new tab: the choice
  // was for the timeline alone).
  const comparer = await tab();
  await comparer.goto(`${origin}/compare?timelines=${history},${war}`);
  const compared = comparer.frameLocator('iframe.editor-frame');
  await compared.locator('#sensitive-gate').waitFor();
  assert.match(await compared.locator('#sensitive-gate').textContent(), /graphic violence/);

  // In an unlabelled timeline, only a labelled moment's images are blurred, and its details
  // say why.
  await reader.goto(`${origin}/timelines/${history}`);
  await frame.locator('.event-marker[aria-label="Massacre"] img').waitFor({ state: 'attached' });
  assert(await gate.isHidden());
  assert(await blurred(frame, 'Massacre'));
  assert(!(await blurred(frame, 'Market')));
  await frame.locator('.event-marker[aria-label="Massacre"]').click();
  await frame.locator('#moment-sensitive').waitFor();
  assert.match(await frame.locator('#moment-sensitive').textContent(), /graphic violence/);
  assert(await frame.locator('#event-labels').isVisible(), 'Readers see the labels it has.');

  // Its owner sees their own timeline as it is, and labels a moment and the timeline.
  const ownerTab = await tab(await signIn());
  await ownerTab.goto(`${origin}/timelines/${war}`);
  const own = ownerTab.frameLocator('iframe.editor-frame');
  await own.locator('.event-marker[aria-label="Battle"] img').waitFor({ state: 'attached' });
  assert(await own.locator('#sensitive-gate').isHidden());
  assert(!(await blurred(own, 'Battle')));
  await ownerTab.goto(`${origin}/timelines/${history}`);
  await own.locator('.event-marker[aria-label="Market"]').click();
  await own.locator('#event-labels').getByLabel('Disturbing content').check();
  await own.locator('#event-save').click();
  await own.locator('#inspector').waitFor({ state: 'hidden' });
  await own.locator('#publish-button').click();
  await own.locator('#toast', { hasText: 'Timeline saved' }).waitFor();
  const { rows } = await pool.query(
    "SELECT event->'metadata'->'content_labels' AS labels FROM oc_moments WHERE timeline_id=$1 AND id='market'",
    [history],
  );
  assert.deepEqual(rows[0].labels, ['disturbing']);
  await ownerTab.goto(`${origin}/timelines/${history}/settings`);
  // Checked once the server has saved it.
  await ownerTab.getByLabel('Nudity').click();
  for (let i = 0; i < 50; i++) {
    const labels = (
      await pool.query('SELECT content_labels FROM oc_timelines WHERE id=$1', [history])
    ).rows[0].content_labels;
    if (labels.includes('nudity')) break;
    assert(i < 49, 'The setting is saved.');
    await delay(100);
  }
  // An adult who turned the warnings off sees it as it is; a teenager cannot turn them off.
  const year = new Date().getUTCFullYear();
  for (const [name, born] of [
    ['adult', year - 30],
    ['teen', year - 15],
  ])
    await pool.query(
      'INSERT INTO oc_users(id,username,email_verified_at,password_hash,birth_year,show_sensitive) VALUES($1,$2,now(),$3,$4,true)',
      [randomUUID(), `${name}_${username}`, await passwordHash(password), born],
    );
  const adult = await tab(await signIn('adult_' + username));
  await adult.goto(`${origin}/timelines/${war}`);
  const adultFrame = adult.frameLocator('iframe.editor-frame');
  await adultFrame.locator('.event-marker[aria-label="Battle"] img').waitFor({ state: 'attached' });
  assert(await adultFrame.locator('#sensitive-gate').isHidden());
  assert(!(await blurred(adultFrame, 'Battle')));
  const teen = await tab(await signIn('teen_' + username));
  await teen.goto(`${origin}/timelines/${war}`);
  await teen.frameLocator('iframe.editor-frame').locator('#sensitive-gate').waitFor();
  await teen.goto(`${origin}/account`);
  await teen.getByText('Accounts of people under 18 always see these warnings.').waitFor();

  assert.deepEqual(errors, []);
  console.log(
    'PASS labels in a browser: warnings, blurred images, moment labels, owners’ view, adults’ choice and minors.',
  );
} finally {
  await browser?.close();
  child.kill();
  await pool.query('DELETE FROM oc_timelines WHERE owner_id=$1', [owner]);
  await pool.query('DELETE FROM oc_users WHERE id=$1 OR username LIKE $2', [
    owner,
    '%\\_' + username,
  ]);
  await pool.end();
}
