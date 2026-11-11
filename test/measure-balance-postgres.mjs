// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Oracle (#595): the PostgreSQL change index. After random sparse saves (moments and durations
// added, moved, revalued and deleted; durations ending where moments are, which move them),
// every overview splits the window's changes across its summaries, each counted once where it
// applies (a duration's at its start or end as its measure says), and its balances, before and
// after the window and after each summary, match an anchor plus the changes summed by hand: on
// the timeline, a copy reading through to it (and saving on its own), and a tag separation.
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
function random(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
const rand = random(5950);
const pick = (list) => list[Math.floor(rand() * list.length)];
const q = (t) => Q.parse(t.includes('/') ? t : t + '/1');
const text = (v) => (v.denominator === 1n ? v.numerator.toString() : v.toString());
const MEASURES = {
  cost: { type: 'mpz' },
  fee: { type: 'mpz', durations: 'end', balance: { at: 'end', value: '1000' } },
  bank: { type: 'mpq', balance: { at: 'start', value: '5/2' } },
  level: { type: 'mpz', durations: 'end', balance: { at: '200', value: '-7' } },
};
const SETTINGS = {
  format: 'openchronology',
  version: 1,
  title: 'Ledger',
  description: '',
  measures: MEASURES,
};
const values = () => {
  const v = {};
  for (const name of ['cost', 'fee', 'level'])
    if (rand() < 0.6) v[name] = String(Math.floor(rand() * 400) - 150 || 1);
  if (rand() < 0.5) v.bank = `${Math.floor(rand() * 9) + 1}/${Math.floor(rand() * 3) + 2}`;
  return v;
};
const tags = () => (rand() < 0.4 ? { tags: ['red'] } : {});
const moment = (id) => ({
  id,
  time: `${Math.floor(rand() * 400)}/1`,
  metadata: { title: id, ...tags(), measures: values() },
});
const duration = (id, moments) => {
  const start = Math.floor(rand() * 400);
  const r = rand();
  // Some end where a moment is (moving with it), some are short, some long.
  const end =
    r < 0.2 && moments.length
      ? { moment: pick(moments).id }
      : `${start + (r < 0.6 ? Math.floor(rand() * 3) : 40 + Math.floor(rand() * 150))}/1`;
  return { id, start: `${start}/1`, end, metadata: { title: id, ...tags(), measures: values() } };
};
/** Every change as [time, name, value], each where it applies. */
function changes(document, filter) {
  const keep = (e) => !filter || (e.metadata.tags ?? []).includes('red');
  const times = new Map(document.events.map((e) => [e.id, e.time]));
  const out = [];
  for (const e of document.events.filter(keep))
    for (const [n, v] of Object.entries(e.metadata.measures ?? {})) out.push([q(e.time), n, q(v)]);
  for (const d of (document.durations ?? []).filter(keep)) {
    const time = (end) => q(typeof end === 'string' ? end : times.get(end.moment));
    const [first, last] = [time(d.start), time(d.end)].sort((a, b) => a.compare(b));
    for (const [n, v] of Object.entries(d.metadata.measures ?? {}))
      out.push([MEASURES[n].durations === 'end' ? last : first, n, q(v)]);
  }
  return out;
}
const prefix = (all, name, t, inclusive) =>
  all
    .filter(
      ([time, n]) =>
        n === name && (t === undefined || (inclusive ? time.compare(t) <= 0 : time.compare(t) < 0)),
    )
    .reduce((s, [, , v]) => s.add(v), Q.zero);
const balance = (all, name, t, inclusive) => {
  const { at, value } = MEASURES[name].balance;
  const anchor =
    at === 'start' ? Q.zero : at === 'end' ? prefix(all, name) : prefix(all, name, q(at), true);
  return text(
    q(value)
      .sub(anchor)
      .add(prefix(all, name, t, inclusive)),
  );
};
async function check(id, label, filter) {
  const { document } = await request(`timelines/${id}/document`);
  const { revision } = await request(`timelines/${id}`);
  const all = changes(document, filter);
  let summaries = 0;
  for (const [lower, upper] of [
    ['-1', '600'],
    ['50', '150'],
    ['120', '125'],
    ['0', '399'],
  ])
    for (const threshold of ['0/1', '3/1', '40/1', '1000/1']) {
      const frame = await request(`timelines/${id}/query`, 'POST', {
        kind: 'overview',
        lower: `${lower}/1`,
        upper: `${upper}/1`,
        threshold,
        revision,
        ...(filter ? { filter } : {}),
      });
      const at = `${label} ${lower}..${upper} at ${threshold}`;
      const left = q(lower),
        right = q(upper);
      for (const name of Object.keys(MEASURES)) {
        const inWindow = all
          .filter(([t, n]) => n === name && t.compare(left) >= 0 && t.compare(right) <= 0)
          .reduce((s, [, , v]) => s.add(v), Q.zero);
        const summed = frame.groups.reduce((s, g) => s.add(q(g.totals?.[name] ?? '0')), Q.zero);
        if (frame.groups.length)
          assert.equal(text(summed), text(inWindow), `${at}: ${name} totals`);
      }
      for (const name of ['fee', 'bank', 'level']) {
        assert.equal(
          frame.balances[name].before,
          balance(all, name, left, false),
          `${at}: ${name} before`,
        );
        assert.equal(
          frame.balances[name].after,
          balance(all, name, right, true),
          `${at}: ${name} after`,
        );
        let running = q(frame.balances[name].before);
        for (const g of frame.groups) {
          running = running.add(q(g.totals?.[name] ?? '0'));
          assert.equal(g.balanceAfter[name], text(running), `${at}: ${name} after a summary`);
        }
      }
      summaries += frame.groups.length;
    }
  assert(summaries > 0, label);
}
try {
  const auth = new Auth(pool, origin);
  await pool.query(
    'INSERT INTO oc_users(id,username,email,email_verified_at,password_hash,quota_bypass,terms_version) VALUES($1,$2,$3,now(),$4,true,oc_policy_version())',
    [
      owner,
      `ledger_${owner.slice(0, 8)}`,
      `ledger_${owner.slice(0, 8)}@example.test`,
      await passwordHash('x'.repeat(20)),
    ],
  );
  const issued = await auth.issue(
    (await pool.query('SELECT * FROM oc_users WHERE id=$1', [owner])).rows[0],
  );
  headers = { Cookie: issued.cookie.split(';')[0], 'X-CSRF-Token': issued.csrf };
  let next = 0;
  const events = Array.from({ length: 90 }, () => moment('m' + next++));
  const created = await request(
    'timelines',
    'POST',
    {
      ...SETTINGS,
      events,
      durations: Array.from({ length: 50 }, () => duration('d' + next++, events)),
    },
    201,
  );
  async function edit(id, saves) {
    for (let s = 0; s < saves; s++) {
      const { document } = await request(`timelines/${id}/document`);
      const { revision } = await request(`timelines/${id}`);
      const anchored = new Set(
        (document.durations ?? [])
          .flatMap((d) => [d.start, d.end])
          .filter((e) => typeof e === 'object')
          .map((e) => e.moment),
      );
      const changes = [],
        durationChanges = [],
        used = new Set();
      for (let k = 0; k < 1 + Math.floor(rand() * 10); k++) {
        const r = rand();
        if (r < 0.25) {
          const added = moment('m' + next++);
          changes.push({ id: added.id, event: added });
          continue;
        }
        const e = pick(document.events);
        if (used.has(e.id)) continue;
        used.add(e.id);
        if (r < 0.35 && !anchored.has(e.id)) changes.push({ id: e.id, event: null });
        else if (r < 0.65)
          changes.push({
            id: e.id,
            event: { ...e, metadata: { ...e.metadata, measures: values() } },
          });
        else changes.push({ id: e.id, event: { ...e, time: `${Math.floor(rand() * 400)}/1` } });
      }
      for (let k = 0; k < Math.floor(rand() * 4); k++) {
        const r = rand(),
          d = document.durations?.length ? pick(document.durations) : null;
        if (r < 0.3 || !d) {
          const added = duration('d' + next++, document.events);
          durationChanges.push({ id: added.id, duration: added });
        } else if (durationChanges.some((c) => c.id === d.id)) continue;
        else if (r < 0.45) durationChanges.push({ id: d.id, duration: null });
        else
          durationChanges.push({
            id: d.id,
            duration: { ...d, metadata: { ...d.metadata, measures: values() } },
          });
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
  await edit(created.id, 20);
  await check(created.id, 'after sparse saves');
  await check(created.id, 'a tag separation', { tags: ['red'], mode: 'any' });
  const { revision } = await request(`timelines/${created.id}`);
  const copy = await request(`timelines/${created.id}/duplicate`, 'POST', { revision }, 201);
  await check(copy.id, 'a copy, read through');
  await edit(copy.id, 12);
  await check(copy.id, 'a copy after its own saves');
  await check(created.id, 'the original, unchanged by its copy');
  // Where a measure's durations apply changes: the index is rebuilt.
  const t = await request(`timelines/${created.id}`);
  await request(`timelines/${created.id}/changes`, 'PUT', {
    revision: t.revision,
    settings: { ...SETTINGS, measures: { ...MEASURES, cost: { type: 'mpz', durations: 'end' } } },
    changes: [],
    durationChanges: [],
    relationshipChanges: [],
  });
  MEASURES.cost = { type: 'mpz', durations: 'end' };
  await check(created.id, 'cost now at durations’ ends');
  console.log(
    'PASS measure balances in PostgreSQL: windows split, balances by hand, in copies and views.',
  );
} finally {
  await pool.query('DELETE FROM oc_timelines WHERE owner_id=$1', [owner]);
  await pool.query('DELETE FROM oc_users WHERE id=$1', [owner]);
  app.close();
  await pool.end();
}
