// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Related timelines (#447): what a timeline's page recommends, through the API.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { Auth, passwordHash } from '../server/auth.mjs';
import { createApplication } from '../server/http.mjs';
import { PostgresStore } from '../server/store.mjs';
import { sweepStanding } from '../server/standing.mjs';
import { validateDocument } from '../dist/core.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
// Words found in no other test's timelines, so only this run's can match.
const suffix = randomUUID().replace(/-/g, '').slice(0, 10).replace(/[0-9]/g, 'q'),
  harbor = 'harbor' + suffix,
  lighthouse = 'lighthouse' + suffix,
  ships = 'ships' + suffix,
  keeper = 'keeper' + suffix,
  weather = 'weather' + suffix,
  password = 'unique related testing passphrase';
const ids = [];
const app = createApplication({
  pool,
  mailer: { async send() {} },
  securityKey: Buffer.alloc(32, 31),
  passwordCheck: async () => {},
});
await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${app.address().port}`,
  auth = new Auth(pool, origin),
  store = new PostgresStore(pool);
async function request(path, headers = {}, expected = 200) {
  const response = await fetch(origin + '/api/' + path, { headers });
  const value = await response.json();
  assert.equal(response.status, expected, `GET ${path}: ${JSON.stringify(value)}`);
  return value;
}
/** An account `days` old, signed in, born in `born` (null: unknown). */
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
async function timeline(
  owner,
  title,
  { tags = [], description = '', events = [], visibility = 'public' } = {},
) {
  const t = await store.create(
    owner.id,
    validateDocument({ format: 'openchronology', version: 1, title, description, events }),
  );
  await pool.query('UPDATE oc_timelines SET visibility=$2,tags=$3 WHERE id=$1', [
    t.id,
    visibility,
    tags,
  ]);
  return t.id;
}
const related = async (id, who) =>
  (await request(`timelines/${id}/related`, who?.headers)).timelines.map((t) => t.id);
try {
  const alice = await account('alice', 40),
    bob = await account('bob', 40),
    carol = await account('carol', 40),
    newcomer = await account('newcomer', 1),
    young = await account('young', 40, new Date().getFullYear() - 15);
  const source = await timeline(alice, `${harbor} ${lighthouse}`, {
    tags: [ships],
    description: `The ${keeper} of the ${lighthouse}.`,
  });
  // Bob's: the same words and tag, one word, the tag alone, and a third that the cap of two
  // per owner leaves out.
  const both = await timeline(bob, `${harbor} ${lighthouse} ${keeper}`, { tags: [ships] }),
    tagOnly = await timeline(bob, 'Logbooks', { tags: [ships] }),
    bobsThird = await timeline(bob, `Old ${harbor}`);
  const oneWord = await timeline(carol, `The ${lighthouse}`);
  // Left out: private, a newcomer's, labelled (for most readers), a copy of the source, an
  // unrelated one, and one that names the words only in a moment.
  const hidden = await timeline(carol, `${harbor} ${lighthouse}`, { visibility: 'private' }),
    newcomers = await timeline(newcomer, `${harbor} ${lighthouse}`),
    labelled = await timeline(carol, `${harbor} ${lighthouse} wrecks`),
    copy = await timeline(carol, `${harbor} ${lighthouse} copy`),
    unrelated = await timeline(carol, `${weather} records`),
    inMoments = await timeline(carol, 'Plain notes', {
      events: [{ id: 'm', time: '0/1', metadata: { title: `${harbor} ${lighthouse}` } }],
    });
  await pool.query("UPDATE oc_timelines SET content_labels=ARRAY['violence'] WHERE id=$1", [
    labelled,
  ]);
  await pool.query(
    'UPDATE oc_timelines SET fork_base_revision_id=(SELECT head_revision_id FROM oc_timelines WHERE id=$2) WHERE id=$1',
    [copy, source],
  );
  await sweepStanding(pool);

  // A guest: the closest first; words and tags both count; two of Bob's at most.
  const guest = await related(source);
  assert.equal(guest[0], both, 'the same words and tag first');
  assert(guest.includes(oneWord) && guest.includes(tagOnly), JSON.stringify(guest));
  assert(!guest.includes(bobsThird), 'two per owner');
  for (const [name, id] of Object.entries({
    source,
    hidden,
    newcomers,
    labelled,
    copy,
    unrelated,
    inMoments,
  }))
    assert(!guest.includes(id), `${name} is not recommended`);
  assert.equal(guest.length, 3);
  // Each as a search result, with its card's shape.
  const [card] = (await request(`timelines/${source}/related`)).timelines;
  assert.equal(card.owner, `bob_${suffix}`);
  assert.equal(typeof card.star_count, 'string');
  assert('shape' in card && 'time_span' in card);

  // A featured newcomer's timeline shows; a labelled one, for a signed-in adult only.
  await pool.query('UPDATE oc_timelines SET featured=true WHERE id=$1', [newcomers]);
  assert((await related(source)).includes(newcomers));
  assert((await related(source, carol)).includes(labelled));
  assert(!(await related(source, young)).includes(labelled), 'not for someone under 18');

  // Only for a timeline the reader may read: a private one's are its readers' alone.
  await request(`timelines/${hidden}/related`, {}, 404);
  assert((await related(hidden, carol)).includes(both));
  // A timeline with nothing in common gets none.
  assert.deepEqual(await related(unrelated), []);
  console.log(
    'PASS related timelines: by words and tags, closest first, two per owner, browsing rules, never itself, copies, private or moment-only matches.',
  );
} finally {
  await pool.query('DELETE FROM oc_timelines WHERE owner_id=ANY($1::uuid[])', [ids]);
  await pool.query('DELETE FROM oc_users WHERE id=ANY($1::uuid[])', [ids]);
  app.close();
  await pool.end();
}
