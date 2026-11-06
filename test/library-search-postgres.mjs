// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Searching every timeline's moments and durations (#459; server/library-search.mjs), through
// the API: what each reader may find, prefixes, kinds, tags, scopes, labels, forks, deleted
// timelines, the order, pages and the cap.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { Auth, passwordHash } from '../server/auth.mjs';
import { createApplication } from '../server/http.mjs';
import { PostgresStore } from '../server/store.mjs';
import { Versioning } from '../server/versioning.mjs';
import { sweepStanding } from '../server/standing.mjs';
import { ENTITY_SEARCH_CAP } from '../server/library-search.mjs';
import { validateDocument } from '../dist/core.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
// Words found in no other test's timelines, so only this run's can match.
const suffix = randomUUID().replace(/-/g, '').slice(0, 10).replace(/[0-9]/g, 'q'),
  harbor = 'harbor' + suffix,
  lantern = 'lantern' + suffix,
  password = 'unique library search passphrase';
const ids = [];
const app = createApplication({
  pool,
  mailer: { async send() {} },
  securityKey: Buffer.alloc(32, 37),
  passwordCheck: async () => {},
});
await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${app.address().port}`,
  auth = new Auth(pool, origin),
  store = new PostgresStore(pool);
/** POSTs a search as `who` (a guest without), expecting `expected`. */
async function search(body, who, expected = 200) {
  const response = await fetch(origin + '/api/timelines/entities/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...who?.headers },
    body: JSON.stringify(body),
  });
  const value = await response.json();
  assert.equal(response.status, expected, JSON.stringify(value));
  return value;
}
/** What a search finds, as `timeline title/kind:id`, in order. */
const found = async (body, who) =>
  (await search(body, who)).entities.map((e) => `${e.timeline.title}/${e.kind}:${e.id}`);
/** An account `days` old, signed in, born in `born`. */
async function account(name, days, born = 1980) {
  const id = randomUUID();
  ids.push(id);
  await pool.query(
    `INSERT INTO oc_users(id,username,email,email_verified_at,password_hash,quota_bypass,created_at,terms_version,birth_year)
    VALUES($1,$2,$3,now(),$4,true,now()-$5::interval,oc_policy_version(),$6)`,
    [
      id,
      `${name}_${suffix}`,
      `${name}_${suffix}@example.test`,
      await passwordHash(password),
      `${days} days`,
      born,
    ],
  );
  const u = (await pool.query('SELECT * FROM oc_users WHERE id=$1', [id])).rows[0];
  const issued = await auth.issue(u);
  return { id, headers: { Cookie: issued.cookie.split(';')[0] } };
}
/** A timeline of `owner`'s, public unless told otherwise. */
async function timeline(owner, title, { events = [], durations, visibility = 'public' } = {}) {
  const t = await store.create(
    owner.id,
    validateDocument({
      format: 'openchronology',
      version: 1,
      title,
      description: '',
      events,
      ...(durations ? { durations } : {}),
    }),
  );
  await pool.query('UPDATE oc_timelines SET visibility=$2 WHERE id=$1', [t.id, visibility]);
  return t;
}
const moment = (id, time, title, extra = {}) => ({ id, time, metadata: { title, ...extra } });
try {
  const alice = await account('alice', 40),
    bob = await account('bob', 40),
    newcomer = await account('newcomer', 1),
    young = await account('young', 40, new Date().getFullYear() - 15);
  const ports = await timeline(alice, 'Ports', {
    events: [
      moment('lighthouse', '10/1', `The ${harbor} lighthouse`, { tags: ['Coast'] }),
      moment('notes', '20/1', 'Customs house', { description: `Built by the ${harbor} board.` }),
      moment('other', '30/1', 'Unrelated'),
    ],
    durations: [
      {
        id: 'blockade',
        start: '40/1',
        end: '50/1',
        metadata: { title: `${harbor} blockade` },
      },
    ],
  });
  const secret = await timeline(alice, 'Secret', {
    events: [moment('plan', '1/1', `${harbor} plan`)],
    visibility: 'private',
  });
  const shared = await timeline(bob, 'Shared', {
    events: [moment('memo', '1/1', `${harbor} memo`)],
    visibility: 'private',
  });
  await pool.query("INSERT INTO oc_members(timeline_id,user_id,role) VALUES($1,$2,'viewer')", [
    shared.id,
    alice.id,
  ]);
  const fresh = await timeline(newcomer, 'Fresh', {
    events: [moment('pier', '1/1', `${harbor} ${harbor} pier`)],
  });
  const labelled = await timeline(bob, 'Labelled', {
    events: [moment('wreck', '1/1', `${harbor} wreck`)],
  });
  await pool.query("UPDATE oc_timelines SET content_labels=ARRAY['violence'] WHERE id=$1", [
    labelled.id,
  ]);
  const compared = await timeline(bob, 'Compared', {
    events: [moment('copy', '1/1', `${harbor} copy`)],
  });
  await pool.query('UPDATE oc_timelines SET comparison=$2 WHERE id=$1', [
    compared.id,
    JSON.stringify({ sources: [ports.id] }),
  ]);
  await store.idle();
  await sweepStanding(pool);

  // A guest: public timelines' moments and durations, by a word's prefix, in title or notes;
  // established accounts' first (the newcomer's twice-matching pier last), title matches
  // before notes'. Not private, labelled or comparison timelines' entities.
  const guest = await found({ search: harbor.slice(0, -2) });
  assert.deepEqual(guest, [
    'Ports/moment:lighthouse',
    'Ports/duration:blockade',
    'Ports/moment:notes',
    'Fresh/moment:pier',
  ]);
  // Every word must match.
  assert.deepEqual(await found({ search: `${harbor} lighth` }), ['Ports/moment:lighthouse']);
  assert.deepEqual(await found({ search: 'zzz' + suffix }), []);
  // Each result, with its timeline and what showing it needs.
  const [first] = (await search({ search: `${harbor} lighthouse` })).entities;
  assert.deepEqual(first, {
    kind: 'moment',
    id: 'lighthouse',
    title: `The ${harbor} lighthouse`,
    snippet: '',
    first: '10/1',
    last: '10/1',
    tags: ['coast'],
    timeline: {
      id: ports.id,
      title: 'Ports',
      slug: ports.slug ?? null,
      owner: `alice_${suffix}`,
    },
    when: first.when,
  });
  assert.equal(
    (await search({ search: 'customs ' + harbor })).entities[0].snippet,
    `Built by the ${harbor} board.`,
  );
  // Times as the timeline shows them: a moment's, a duration's start and end.
  assert.notEqual(first.when, '');
  assert.match((await search({ search: harbor, kinds: ['duration'] })).entities[0].when, / – /);
  // Kinds, a tag (any case) and one owner's timelines.
  assert.deepEqual(await found({ search: harbor, kinds: ['duration'] }), [
    'Ports/duration:blockade',
  ]);
  assert.deepEqual(await found({ search: harbor, tag: 'coast' }), ['Ports/moment:lighthouse']);
  assert.deepEqual(await found({ search: harbor, owner: `newcomer_${suffix}` }), [
    'Fresh/moment:pier',
  ]);

  // Signed in, the visible scope adds their own private timelines and those they are a
  // member of, unless moderators restricted it; mine is their own alone.
  const visible = await found({ search: harbor, scope: 'visible' }, alice);
  for (const entry of ['Secret/moment:plan', 'Shared/moment:memo', 'Labelled/moment:wreck'])
    assert(visible.includes(entry), entry);
  assert(!(await found({ search: harbor, scope: 'visible' }, bob)).includes('Secret/moment:plan'));
  await pool.query(
    "INSERT INTO oc_moderation_cases(id,target_kind,target_id,owner_id,status) VALUES($1,'timeline',$2,$3,'restricted')",
    [randomUUID(), shared.id, bob.id],
  );
  assert(
    !(await found({ search: harbor, scope: 'visible' }, alice)).includes('Shared/moment:memo'),
  );
  assert.deepEqual((await found({ search: harbor, scope: 'mine' }, alice)).sort(), [
    'Ports/duration:blockade',
    'Ports/moment:lighthouse',
    'Ports/moment:notes',
    'Secret/moment:plan',
  ]);
  await search({ search: harbor, scope: 'mine' }, null, 401);
  // Only the timelines the reader starred, and only public or private ones (Explore's filters).
  await pool.query('INSERT INTO oc_timeline_stars(user_id,timeline_id) VALUES($1,$2)', [
    alice.id,
    secret.id,
  ]);
  assert.deepEqual(await found({ search: harbor, scope: 'visible', starred: true }, alice), [
    'Secret/moment:plan',
  ]);
  assert.deepEqual(await found({ search: harbor, scope: 'public', starred: true }, alice), []);
  assert.deepEqual(
    (await found({ search: harbor, scope: 'mine', visibility: 'private' }, alice)).sort(),
    ['Secret/moment:plan'],
  );
  assert(
    !(await found({ search: harbor, scope: 'mine', visibility: 'public' }, alice)).includes(
      'Secret/moment:plan',
    ),
  );
  await search({ search: harbor, starred: true }, null, 401);
  await search({ search: harbor, visibility: 'hidden' }, alice, 400);
  // Labelled timelines' entities: for signed-in adults, not for someone under 18.
  assert((await found({ search: harbor }, bob)).includes('Labelled/moment:wreck'));
  assert(!(await found({ search: harbor }, young)).includes('Labelled/moment:wreck'));

  // A fork reading through to its source shows only what it changed; deleting the source
  // leaves its rows for the fork to read, but they are found on no timeline.
  const fork = await new Versioning(store).copy(ports.id, bob.id, {
    revision: String(
      (await pool.query('SELECT revision FROM oc_timelines WHERE id=$1', [ports.id])).rows[0]
        .revision,
    ),
  });
  await pool.query("UPDATE oc_timelines SET visibility='public',title='Fork' WHERE id=$1", [
    fork.id,
  ]);
  await store.idle();
  await store.save(
    fork.id,
    bob.id,
    String(
      (await pool.query('SELECT revision FROM oc_timelines WHERE id=$1', [fork.id])).rows[0]
        .revision,
    ),
    undefined,
    {
      settings: {
        format: 'openchronology',
        version: 1,
        title: 'Fork',
        description: '',
        events: [],
      },
      changes: [{ id: 'pier2', event: moment('pier2', '5/1', `New ${harbor} pier`) }],
    },
  );
  await store.idle();
  const withFork = await found({ search: harbor });
  assert(withFork.includes('Fork/moment:pier2'), 'its own change');
  assert(!withFork.some((e) => e.startsWith('Fork/') && e !== 'Fork/moment:pier2'));
  await pool.query('DELETE FROM oc_timelines WHERE id=$1', [ports.id]);
  assert(!(await found({ search: harbor })).some((e) => e.startsWith('Ports/')));

  // Pages, with the total over every page.
  const many = await timeline(alice, 'Lanterns', {
    events: Array.from({ length: 7 }, (_, i) => moment('l' + i, `${i}/1`, `${lantern} ${i}`)),
  });
  await store.idle();
  const one = await search({ search: lantern, limit: 3 }),
    three = await search({ search: lantern, limit: 3, page: 3 }),
    past = await search({ search: lantern, limit: 3, page: 4 });
  assert.deepEqual(
    [one.total, one.pages, one.entities.length, three.entities.length, past.entities.length],
    [7, 3, 3, 1, 0],
  );
  assert.equal(past.total, 7, 'a page past the last still counts');
  assert.deepEqual(
    [
      ...one.entities,
      ...(await search({ search: lantern, limit: 3, page: 2 })).entities,
      ...three.entities,
    ].map((e) => e.id),
    ['l0', 'l1', 'l2', 'l3', 'l4', 'l5', 'l6'],
    'in time order when they rank the same',
  );
  assert(!('totalMore' in one));
  // Past the cap: the total stops there and says there are more.
  await pool.query(
    `INSERT INTO oc_entity_search(timeline_id,kind,entity_id,first_time,last_time,title,body,since)
    SELECT $1,'moment','x'||n,'0'::mpq,'0'::mpq,$2,'',0 FROM generate_series(1,$3) n`,
    [many.id, `${lantern} extra`, ENTITY_SEARCH_CAP],
  );
  const capped = await search({ search: lantern });
  assert.equal(capped.total, ENTITY_SEARCH_CAP);
  assert.equal(capped.totalMore, true);

  // Text with no words finds nothing; malformed searches are refused.
  assert.deepEqual(await search({ search: ' -- ' }), {
    entities: [],
    total: 0,
    page: 1,
    limit: 20,
    pages: 0,
  });
  for (const body of [
    { search: harbor, kinds: [] },
    { search: harbor, kinds: ['timeline'] },
    { search: harbor, scope: 'everything' },
    { search: harbor, limit: 51 },
    { search: harbor, other: 1 },
  ])
    await search(body, null, 400);
  console.log(
    'PASS searching every timeline’s moments and durations: by prefix in titles and notes, ranked with established accounts first; kinds, tags, owners and scopes (public, visible with memberships unless restricted, mine); starred and visibility filters; labelled timelines for adults; forks show their changes; deleted timelines none; paged and capped.',
  );
} finally {
  await store.idle();
  await pool.query('DELETE FROM oc_timelines WHERE owner_id=ANY($1::uuid[])', [ids]);
  await pool.query('DELETE FROM oc_users WHERE id=ANY($1::uuid[])', [ids]);
  app.close();
  await pool.end();
}
