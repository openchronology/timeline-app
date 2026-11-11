// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Oracle (#574): the PostgreSQL moment tree's measure totals. After random sparse saves (moments
// added, moved, revalued and deleted, applied in place, sometimes a slice at a time) every
// overview group's totals equal summing its moments' values by hand; so do those of a copy
// reading through to the original's rows, after its own edits, and of a tag separation's view.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { Auth, passwordHash } from '../server/auth.mjs';
import { createApplication } from '../server/http.mjs';
import { Q } from '../dist/core.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
const app = createApplication({ pool });
await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${app.address().port}`,
  owner = randomUUID();
let headers = {};
async function request(path, method = 'GET', data, expected = 200) {
  const response = await fetch(origin + '/api/' + path, {
    method,
    headers: { ...headers, ...(data ? { 'Content-Type': 'application/json' } : {}) },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  const value = await response.json();
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(value)}`);
  return value;
}
/** A small deterministic generator, so a failure can be replayed. */
function random(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
const rand = random(574);
const pick = (list) => list[Math.floor(rand() * list.length)];
const q = (t) => Q.parse(t.includes('/') ? t : t + '/1');
const text = (v) => (v.denominator === 1n ? v.numerator.toString() : v.toString());
const MEASURES = { cost: { type: 'mpz' }, hours: { type: 'mpq' } };
const SETTINGS = {
  format: 'openchronology',
  version: 1,
  title: 'Totals',
  description: '',
  measures: MEASURES,
};
const values = () => {
  const v = {};
  if (rand() < 0.7) v.cost = String(Math.floor(rand() * 2000) - 500);
  if (rand() < 0.5) v.hours = `${Math.floor(rand() * 9) + 1}/${Math.floor(rand() * 4) + 1}`;
  return v;
};
const moment = (id) => ({
  id,
  time: `${Math.floor(rand() * 400)}/${1 + Math.floor(rand() * 2)}`,
  metadata: { title: id, ...(rand() < 0.3 ? { tags: ['red'] } : {}), measures: values() },
});
const duration = (id) => {
  const start = Math.floor(rand() * 400);
  // Mostly short, collapsing into summaries; some long, drawn as bands (#576).
  const length = rand() < 0.75 ? Math.floor(rand() * 3) : 50 + Math.floor(rand() * 200);
  return {
    id,
    start: `${start}/1`,
    end: `${start + length}/1`,
    metadata: { title: id, ...(rand() < 0.3 ? { tags: ['red'] } : {}), measures: values() },
  };
};
const add = (into, values) => {
  for (const [name, v] of Object.entries(values ?? {}))
    into[name] = (into[name] ?? Q.zero).add(q(v));
};
const named = (sums) =>
  Object.fromEntries(
    Object.entries(sums)
      .filter(([, v]) => v.numerator !== 0n)
      .map(([n, v]) => [n, text(v)]),
  );
/**
 * Overview groups' totals against the document's values summed by hand: across all groups,
 * every moment and every duration starting in the window once, each duration's where it
 * starts (#576, #595). How the window is split between groups is test/measure-balance-postgres's.
 */
async function check(id, label, filter) {
  const { document } = await request(`timelines/${id}/document`);
  const { revision } = await request(`timelines/${id}`);
  const keep = (e) => !filter || (e.metadata.tags ?? []).includes('red');
  const events = document.events.filter(keep),
    durations = (document.durations ?? []).filter(keep);
  let groups = 0;
  for (const threshold of ['0/1', '3/1', '40/1', '1000/1']) {
    const frame = await request(`timelines/${id}/query`, 'POST', {
      kind: 'overview',
      lower: '-1/1',
      upper: '401/1',
      threshold,
      revision,
      ...(filter ? { filter } : {}),
    });
    const all = {};
    for (const e of events) add(all, e.metadata.measures);
    // Every duration starting in the window (#576), summarized or drawn as a band (#595).
    for (const d of durations) {
      const first = q(d.start);
      if (first.compare(q('-1')) >= 0 && first.compare(q('401')) <= 0)
        add(all, d.metadata.measures);
    }
    const summed = {};
    for (const group of frame.groups)
      for (const [name, v] of Object.entries(group.totals ?? {}))
        summed[name] = (summed[name] ?? Q.zero).add(q(v));
    assert.deepEqual(named(summed), named(all), `${label} at ${threshold}: every value once`);
    groups += frame.groups.length;
  }
  assert(groups > 0, label);
}
try {
  const auth = new Auth(pool, origin);
  await pool.query(
    'INSERT INTO oc_users(id,username,email,email_verified_at,password_hash,quota_bypass,terms_version) VALUES($1,$2,$3,now(),$4,true,oc_policy_version())',
    [
      owner,
      `totals_${owner.slice(0, 8)}`,
      `totals_${owner.slice(0, 8)}@example.test`,
      await passwordHash('x'.repeat(20)),
    ],
  );
  const issued = await auth.issue(
    (await pool.query('SELECT * FROM oc_users WHERE id=$1', [owner])).rows[0],
  );
  headers = { Cookie: issued.cookie.split(';')[0], 'X-CSRF-Token': issued.csrf };

  let next = 0;
  const created = await request(
    'timelines',
    'POST',
    {
      ...SETTINGS,
      events: Array.from({ length: 120 }, () => moment('m' + next++)),
      durations: Array.from({ length: 60 }, () => duration('d' + next++)),
    },
    201,
  );
  /** Random sparse saves to timeline `id`: adds, moves, value changes and deletions. */
  async function edit(id, saves) {
    for (let s = 0; s < saves; s++) {
      const { document } = await request(`timelines/${id}/document`);
      const { revision } = await request(`timelines/${id}`);
      const changes = [];
      const used = new Set();
      for (let k = 0; k < 1 + Math.floor(rand() * 12); k++) {
        const r = rand();
        if (r < 0.3 || !document.events.length) {
          const added = moment('m' + next++);
          changes.push({ id: added.id, event: added });
          continue;
        }
        const e = pick(document.events);
        if (used.has(e.id)) continue;
        used.add(e.id);
        if (r < 0.45) changes.push({ id: e.id, event: null });
        else if (r < 0.7)
          // Its values only, at the same time: the path's totals change, nothing moves.
          changes.push({
            id: e.id,
            event: { ...e, metadata: { ...e.metadata, measures: values() } },
          });
        else changes.push({ id: e.id, event: { ...moment(e.id), metadata: { ...e.metadata } } });
      }
      // Durations: added, revalued in place, moved and deleted.
      const durationChanges = [];
      for (let k = 0; k < Math.floor(rand() * 5); k++) {
        const r = rand(),
          d = document.durations?.length ? pick(document.durations) : null;
        if (r < 0.3 || !d) {
          const added = duration('d' + next++);
          durationChanges.push({ id: added.id, duration: added });
        } else if (durationChanges.some((c) => c.id === d.id)) continue;
        else if (r < 0.45) durationChanges.push({ id: d.id, duration: null });
        else if (r < 0.75)
          durationChanges.push({
            id: d.id,
            duration: { ...d, metadata: { ...d.metadata, measures: values() } },
          });
        else
          durationChanges.push({ id: d.id, duration: { ...duration(d.id), metadata: d.metadata } });
      }
      await request(`timelines/${id}/changes`, 'PUT', {
        revision,
        settings: SETTINGS,
        changes,
        durationChanges,
        relationshipChanges: [],
      });
    }
  }
  await check(created.id, 'built whole');
  await edit(created.id, 25);
  await check(created.id, 'after sparse saves');
  await check(created.id, 'a tag separation', { tags: ['red'], mode: 'any' });

  // A copy reads through to the original's rows; its own edits make paths its own.
  const { revision } = await request(`timelines/${created.id}`);
  const copy = await request(`timelines/${created.id}/duplicate`, 'POST', { revision }, 201);
  await check(copy.id, 'a copy, read through');
  await edit(copy.id, 15);
  await check(copy.id, 'a copy after its own saves');
  await check(created.id, 'the original, unchanged by its copy');

  // Every value removed: no group has totals.
  const { document } = await request(`timelines/${created.id}/document`);
  const t = await request(`timelines/${created.id}`);
  await request(`timelines/${created.id}/changes`, 'PUT', {
    revision: t.revision,
    settings: SETTINGS,
    changes: document.events.map((e) => {
      const { measures: _m, ...metadata } = e.metadata;
      return { id: e.id, event: { ...e, metadata } };
    }),
    durationChanges: (document.durations ?? []).map((d) => {
      const { measures: _m, ...metadata } = d.metadata;
      return { id: d.id, duration: { ...d, metadata } };
    }),
    relationshipChanges: [],
  });
  await check(created.id, 'without values');
  console.log(
    'PASS measure totals in PostgreSQL: overview groups match hand sums, in copies and views.',
  );
} finally {
  await pool.query('DELETE FROM oc_timelines WHERE owner_id=$1', [owner]);
  await pool.query('DELETE FROM oc_users WHERE id=$1', [owner]);
  app.close();
  await pool.end();
}
