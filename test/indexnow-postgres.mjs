// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// IndexNow (#389) against PostgreSQL, through the HTTP API: creating, publishing, saving,
// renaming, making private and deleting timelines sends their public addresses (and their
// owner's profile) to a stand-in endpoint, a private timeline's never, matching the sitemap;
// so do the pages of the moments and durations a save changes (#453).
// No request leaves the machine.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { createApplication } from '../server/http.mjs';
import { Auth } from '../server/auth.mjs';
import { IndexNow, INDEXNOW_ENDPOINT, RESUBMIT_AFTER } from '../server/indexnow.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
// Nothing here may reach the network but the test's own server.
const realFetch = globalThis.fetch;
globalThis.fetch = (url, init) => {
  if (!String(url).startsWith('http://127.0.0.1:'))
    throw new Error('A test tried to reach the network: ' + url);
  return realFetch(url, init);
};
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const userId = randomUUID(),
  username = 'indexnow_' + userId.slice(0, 8);
let app;
try {
  await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
  await pool.query(
    'INSERT INTO oc_users(id,username,email_verified_at,terms_version) VALUES($1,$2,now(),oc_policy_version())',
    [userId, username],
  );
  app = createApplication({ pool });
  await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
  const api = 'http://127.0.0.1:' + app.address().port;
  const issued = await new Auth(pool, api).issue(
    (await pool.query('SELECT * FROM oc_users WHERE id=$1', [userId])).rows[0],
  );
  const headers = {
    'Content-Type': 'application/json',
    Cookie: issued.cookie.split(';')[0],
    'X-CSRF-Token': issued.csrf,
  };
  const call = async (method, path, data) => {
    const response = await fetch(api + path, { method, headers, body: JSON.stringify(data) });
    const text = await response.text();
    assert.ok(response.ok, `${method} ${path}: ${response.status} ${text}`);
    return text ? JSON.parse(text) : null;
  };
  const revision = async (id) =>
    (await pool.query('SELECT revision FROM oc_timelines WHERE id=$1', [id])).rows[0].revision;
  const document = (title) => ({
    format: 'openchronology',
    version: 1,
    title,
    description: '',
    events: [],
  });

  // The stand-in endpoint, and a clock the test moves.
  const submitted = [];
  let now = Date.now();
  const site = 'https://timescale.example';
  const indexNow = new IndexNow(pool, {
    origin: site,
    key: 'test-key-389',
    now: () => now,
    log: { info() {}, warn() {}, error: (...args) => console.error(...args) },
    fetch: async (url, init) => {
      assert.equal(url, INDEXNOW_ENDPOINT);
      submitted.push(JSON.parse(init.body));
      return new Response(null, { status: 202 });
    },
  });
  /** The addresses the next run sends, on this site, without the site. */
  const next = async () => {
    const before = submitted.length;
    now += 60_000;
    await indexNow.run();
    const sent = submitted.slice(before);
    for (const body of sent) {
      assert.equal(body.host, 'timescale.example');
      assert.equal(body.keyLocation, `${site}/test-key-389.txt`);
    }
    return sent.flatMap((body) => body.urlList.map((url) => url.slice(site.length))).sort();
  };
  await indexNow.run(); // the baseline

  // A private timeline is never sent, created or saved.
  const hidden = await call('POST', '/api/timelines', document('Hidden'));
  await call('PUT', `/api/timelines/${hidden.id}`, {
    revision: String(await revision(hidden.id)),
    document: document('Hidden, saved'),
  });
  await call('PATCH', `/api/timelines/${hidden.id}/settings`, { slug: 'hidden' });
  assert.deepEqual(await next(), []);

  // Made public, with an address: its page and its owner's new profile.
  const rome = await call('POST', '/api/timelines', document('Rome'));
  await call('PATCH', `/api/timelines/${rome.id}/settings`, {
    visibility: 'public',
    slug: 'rome',
  });
  assert.deepEqual(await next(), [`/${username}`, `/${username}/rome`].sort());
  assert.deepEqual(await next(), [], 'sent once');

  // Saved: its page, once the hour since it was sent has passed.
  now += RESUBMIT_AFTER;
  await call('PUT', `/api/timelines/${rome.id}`, {
    revision: String(await revision(rome.id)),
    document: document('Rome, saved'),
  });
  assert.deepEqual(await next(), [`/${username}/rome`]);

  // Renamed: the old address and the new, and the profile that lists it.
  now += RESUBMIT_AFTER;
  await call('PATCH', `/api/timelines/${rome.id}/settings`, { slug: 'roma' });
  assert.deepEqual(await next(), [`/${username}`, `/${username}/roma`, `/${username}/rome`].sort());

  // Made private: the address it had, so engines drop it, and the profile it leaves.
  now += RESUBMIT_AFTER;
  await call('PATCH', `/api/timelines/${rome.id}/settings`, { visibility: 'private' });
  assert.deepEqual(await next(), [`/${username}`, `/${username}/roma`].sort());

  // Deleted while public: likewise. The private one's deletion sends nothing.
  now += RESUBMIT_AFTER;
  await call('PATCH', `/api/timelines/${rome.id}/settings`, { visibility: 'public' });
  await next();
  now += RESUBMIT_AFTER;
  await call('DELETE', `/api/timelines/${rome.id}`);
  await call('DELETE', `/api/timelines/${hidden.id}`);
  assert.deepEqual(await next(), [`/${username}`, `/${username}/roma`].sort());
  assert.ok(
    !submitted.some((body) => body.urlList.some((url) => /hidden/i.test(url))),
    'nothing of the private timeline',
  );

  // Moments and durations (#453): published, all of their pages; then what each save changed.
  const era = { id: 'era', start: '0/1', end: '10/1', metadata: { title: 'Voyage' } },
    departure = { id: 'leg:1', time: '0/1', metadata: { title: 'Departure' } },
    storm = { id: 'leg:2', time: '10/1', metadata: { title: 'Storm' } };
  const ships = (events, more = {}) => ({
    ...document('Ships'),
    events,
    durations: [era],
    ...more,
  });
  const voyage = await call('POST', '/api/timelines', ships([departure, storm]));
  const save = async (doc) =>
    call('PUT', `/api/timelines/${voyage.id}`, {
      revision: String(await revision(voyage.id)),
      document: doc,
    });
  now += RESUBMIT_AFTER;
  await call('PATCH', `/api/timelines/${voyage.id}/settings`, {
    visibility: 'public',
    slug: 'ships',
  });
  const base = `/${username}/ships`,
    pages = {
      era: `${base}/durations/era`,
      departure: `${base}/moments/leg%3A1`,
      storm: `${base}/moments/leg%3A2`,
    };
  assert.deepEqual(
    await next(),
    [`/${username}`, base, pages.era, pages.departure, pages.storm].sort(),
  );
  // One moment's text edited: the timeline's page and that moment's.
  now += RESUBMIT_AFTER;
  await save(ships([departure, { ...storm, metadata: { title: 'Storm', description: 'Rough.' } }]));
  assert.deepEqual(await next(), [base, pages.storm].sort());
  // A relationship added: both of its ends, whose pages list what they relate to.
  now += RESUBMIT_AFTER;
  const linked = { relationships: [{ a: { moment: 'leg:1' }, b: { duration: 'era' } }] };
  await save(ships([departure, storm], linked));
  assert.deepEqual(await next(), [base, pages.era, pages.departure, pages.storm].sort());
  // A moment removed: its page, now gone, so engines drop it.
  now += RESUBMIT_AFTER;
  await save(ships([departure], linked));
  assert.deepEqual(await next(), [base, pages.storm].sort());
  // Renamed: all its entities at the new address.
  now += RESUBMIT_AFTER;
  await call('PATCH', `/api/timelines/${voyage.id}/settings`, { slug: 'boats' });
  const boats = `/${username}/boats`;
  assert.deepEqual(
    await next(),
    [`/${username}`, base, boats, `${boats}/durations/era`, `${boats}/moments/leg%3A1`].sort(),
  );
  // The editor's sparse saves too: one moment's change, its page.
  now += RESUBMIT_AFTER;
  await call('PUT', `/api/timelines/${voyage.id}/changes`, {
    revision: String(await revision(voyage.id)),
    settings: document('Ships'),
    changes: [{ id: 'leg:1', event: { ...departure, metadata: { title: 'Cast off' } } }],
  });
  assert.deepEqual(await next(), [boats, `${boats}/moments/leg%3A1`].sort());
  // Labelled, its entities are not listed: a save sends its page alone.
  now += RESUBMIT_AFTER;
  await pool.query("UPDATE oc_timelines SET content_labels=ARRAY['violence'] WHERE id=$1", [
    voyage.id,
  ]);
  await save(ships([{ ...departure, metadata: { title: 'Setting out' } }], linked));
  assert.deepEqual(await next(), [boats]);
  console.log(
    'PASS IndexNow: public timelines created, published, saved, renamed, made private and deleted are sent with their profile, at most hourly; private ones never; the pages of moments and durations published, renamed, edited (whole or sparse), linked and removed, not of labelled timelines.',
  );
} finally {
  globalThis.fetch = realFetch;
  if (app) await new Promise((resolve) => app.close(resolve));
  await pool.query('DELETE FROM oc_timelines WHERE owner_id=$1', [userId]);
  await pool.query('DELETE FROM oc_sessions WHERE user_id=$1', [userId]);
  await pool.query('DELETE FROM oc_users WHERE id=$1', [userId]);
  await pool.end();
}
