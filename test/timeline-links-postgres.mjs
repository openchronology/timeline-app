// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Links between entities on different timelines (#422; server/timeline-links.mjs) against
// PostgreSQL, through the HTTP API: added and removed only with write access to both
// timelines; listed to those who may read the other one; drawn between a comparison's
// timelines in a window, aligned; removed with an entity a save deletes (sparse or whole, on
// a fork that reads through too) and with a deleted timeline; held to TIMELINE_LINK_LIMIT;
// announced by the link generation live updates read.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { createApplication } from '../server/http.mjs';
import { Auth } from '../server/auth.mjs';
import { PostgresStore } from '../server/store.mjs';
import { Versioning } from '../server/versioning.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const owner = randomUUID(),
  other = randomUUID();
let app;
try {
  await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
  for (const id of [owner, other])
    await pool.query(
      'INSERT INTO oc_users(id,username,email_verified_at,terms_version) VALUES($1,$2,now(),oc_policy_version())',
      [id, 'links_' + id.slice(0, 8)],
    );
  app = createApplication({ pool, linkLimit: 3 });
  await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
  const api = 'http://127.0.0.1:' + app.address().port;
  const auth = new Auth(pool, api);
  const sessions = {};
  for (const id of [owner, other]) {
    const issued = await auth.issue(
      (await pool.query('SELECT * FROM oc_users WHERE id=$1', [id])).rows[0],
    );
    sessions[id] = {
      'Content-Type': 'application/json',
      Cookie: issued.cookie.split(';')[0],
      'X-CSRF-Token': issued.csrf,
    };
  }
  /** A request as `who` (an account, or null signed out); resolves to [status, body]. */
  const request = async (who, method, path, data) => {
    const response = await fetch(api + path, {
      method,
      headers: who ? sessions[who] : { 'Content-Type': 'application/json' },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    const text = await response.text();
    return [response.status, text ? JSON.parse(text) : null];
  };
  const call = async (who, method, path, data) => {
    const [status, result] = await request(who, method, path, data);
    assert.ok(status < 300, `${method} ${path}: ${status} ${JSON.stringify(result)}`);
    return result;
  };
  const revision = async (id) =>
    String(
      (await pool.query('SELECT revision FROM oc_timelines WHERE id=$1', [id])).rows[0].revision,
    );
  const timeline = (title, events, durations = []) => ({
    format: 'openchronology',
    version: 1,
    title,
    description: '',
    events: events.map(([id, time]) => ({ id, time, metadata: { title: `${title} ${id}` } })),
    durations: durations.map(([id, start, end]) => ({
      id,
      start,
      end,
      metadata: { title: `${title} ${id}` },
    })),
  });
  const rome = await call(
    owner,
    'POST',
    '/api/timelines',
    timeline(
      'Rome',
      [
        ['founding', '0/1'],
        ['empire', '100/1'],
      ],
      [['republic', '10/1', '90/1']],
    ),
  );
  const greece = await call(
    owner,
    'POST',
    '/api/timelines',
    timeline('Greece', [
      ['olympics', '5/1'],
      ['athens', '50/1'],
    ]),
  );
  const persia = await call(
    other,
    'POST',
    '/api/timelines',
    timeline('Persia', [['cyrus', '20/1']]),
  );
  await call(owner, 'PATCH', `/api/timelines/${rome.id}/settings`, { visibility: 'public' });
  const links = (who, id, entity) =>
    call(who, 'GET', `/api/timelines/${id}/links?${new URLSearchParams(entity)}`);
  const generation = async (id) =>
    (await pool.query('SELECT link_generation::text AS g FROM oc_timelines WHERE id=$1', [id]))
      .rows[0].g;

  // Linking two of one's own timelines, from either end; again is the same link.
  const before = await generation(greece.id);
  const link = await call(owner, 'POST', `/api/timelines/${rome.id}/links`, {
    from: { moment: 'founding' },
    to: { timeline: greece.id, moment: 'olympics' },
  });
  assert.equal(link.title, 'Greece olympics');
  assert.deepEqual(link.timeline.id, greece.id);
  assert.notEqual(await generation(greece.id), before, 'live updates hear of it');
  assert.equal(
    (await call(owner, 'GET', `/api/timelines/${greece.id}/revision`)).links,
    await generation(greece.id),
  );
  const again = await call(owner, 'POST', `/api/timelines/${greece.id}/links`, {
    from: { moment: 'olympics' },
    to: { timeline: rome.id, moment: 'founding' },
  });
  assert.equal(again.id, link.id);
  assert.equal(again.title, 'Rome founding');
  const fromGreece = await links(owner, greece.id, { moment: 'olympics' });
  assert.deepEqual(
    fromGreece.links.map((l) => [l.timeline.title, l.kind, l.entity, l.first]),
    [['Rome', 'moment', 'founding', '0/1']],
  );
  await call(owner, 'POST', `/api/timelines/${rome.id}/links`, {
    from: { duration: 'republic' },
    to: { timeline: greece.id, moment: 'athens' },
  });

  // A link to Greece as a whole: listed with its title, never an arc, lasting while Greece does.
  const whole = await call(owner, 'POST', `/api/timelines/${rome.id}/links`, {
    from: { moment: 'empire' },
    to: { timeline: greece.id },
  });
  assert.deepEqual(
    [whole.kind, whole.entity, whole.title, whole.first],
    ['timeline', '', 'Greece', null],
  );
  await call(owner, 'DELETE', `/api/timelines/${rome.id}/links`, { link: whole.id });

  // Greece is private: Rome's readers who may not read it see none of its links.
  assert.deepEqual((await links(null, rome.id, { moment: 'founding' })).links, []);
  assert.deepEqual((await links(other, rome.id, { moment: 'founding' })).links, []);
  assert.equal((await links(owner, rome.id, { moment: 'founding' })).links.length, 1);
  assert.equal(
    (await request(null, 'GET', `/api/timelines/${greece.id}/links?moment=olympics`))[0],
    404,
  );

  // Linking and unlinking need write access to both timelines.
  const persiaLink = { from: { moment: 'cyrus' }, to: { timeline: rome.id, moment: 'empire' } };
  assert.equal(
    (await request(other, 'POST', `/api/timelines/${persia.id}/links`, persiaLink))[0],
    403,
  );
  assert.equal(
    (
      await request(owner, 'POST', `/api/timelines/${rome.id}/links`, {
        from: { moment: 'empire' },
        to: { timeline: persia.id, moment: 'cyrus' },
      })
    )[0],
    404,
  );
  assert.equal(
    (await request(null, 'POST', `/api/timelines/${persia.id}/links`, persiaLink))[0],
    401,
  );
  assert.equal(
    (
      await request(owner, 'POST', `/api/timelines/${rome.id}/links`, {
        from: { moment: 'founding' },
        to: { timeline: greece.id, moment: 'missing' },
      })
    )[0],
    404,
  );
  assert.equal(
    (
      await request(owner, 'POST', `/api/timelines/${rome.id}/links`, {
        from: { moment: 'founding' },
        to: { timeline: rome.id, moment: 'empire' },
      })
    )[0],
    400,
  );
  await call(owner, 'POST', `/api/timelines/${rome.id}/members`, {
    username: 'links_' + other.slice(0, 8),
    role: 'writer',
  });
  const cyrus = await call(other, 'POST', `/api/timelines/${persia.id}/links`, persiaLink);
  assert.equal(cyrus.timeline.title, 'Rome');
  // Rome's owner may not read Persia, so they see no link to it, nor learn of it removing it.
  assert.deepEqual((await links(owner, rome.id, { moment: 'empire' })).links, []);
  assert.equal(
    (await request(owner, 'DELETE', `/api/timelines/${rome.id}/links`, { link: cyrus.id }))[0],
    404,
  );

  // The limit (3 here) counts both ends: Rome has three links now.
  const [status, refused] = await request(owner, 'POST', `/api/timelines/${greece.id}/links`, {
    from: { moment: 'athens' },
    to: { timeline: rome.id, moment: 'empire' },
  });
  assert.equal(status, 409);
  assert.match(
    refused.error ?? refused.message,
    /at most 3 links to other timelines, and the other one has 3/,
  );
  await call(other, 'DELETE', `/api/timelines/${persia.id}/links`, { link: cyrus.id });
  assert.equal(
    (await request(other, 'DELETE', `/api/timelines/${persia.id}/links`, { link: cyrus.id }))[0],
    404,
  );

  // A comparison's arcs: between its timelines, aligned, in the window, at least the
  // threshold long; only for those who may read every timeline.
  const between = (who, body) => call(who, 'POST', '/api/timelines/links/query', body);
  const sources = [
    { id: rome.id, scale: '1', offset: '0' },
    { id: greece.id, scale: '2', offset: '1' },
  ];
  let arcs = await between(owner, { sources, lower: '0', upper: '200', threshold: '0' });
  const byIds = (edges) =>
    edges.map((e) => [e.a, e.b, e.aTime, e.bTime].map((v) => JSON.stringify(v)).join(' ')).sort();
  const [ra, ga] = rome.id < greece.id ? ['a', 'b'] : ['b', 'a'];
  assert.equal(arcs.edges.length, 2);
  for (const edge of arcs.edges) {
    assert.equal(edge[ra + 'Key'], rome.id);
    assert.equal(edge[ga + 'Key'], greece.id);
  }
  const olympics = arcs.edges.find((e) => e[ga].moment === 'olympics');
  assert.equal(olympics[ra + 'Time'], '0/1');
  assert.equal(olympics[ga + 'Time'], '11/1', 'olympics at 5, × 2 + 1');
  assert.equal(olympics[ga + 'Title'], 'Greece olympics');
  const republic = arcs.edges.find((e) => e[ra].duration === 'republic');
  assert.equal(republic[ra + 'Time'], '10/1', 'a duration at its start');
  assert.equal(republic[ga + 'Time'], '101/1');
  // A window neither arc crosses; one only the longer does; a threshold above the shorter.
  assert.equal(
    (await between(owner, { sources, lower: '150', upper: '200', threshold: '0' })).edges.length,
    0,
  );
  arcs = await between(owner, { sources, lower: '50', upper: '60', threshold: '0' });
  assert.deepEqual(
    arcs.edges.map((e) => e[ra].duration),
    ['republic'],
  );
  arcs = await between(owner, { sources, lower: '0', upper: '200', threshold: '20' });
  assert.deepEqual(
    arcs.edges.map((e) => e[ra].duration),
    ['republic'],
  );
  assert.equal(
    (
      await request(null, 'POST', '/api/timelines/links/query', {
        sources,
        lower: '0',
        upper: '1',
        threshold: '0',
      })
    )[0],
    404,
  );
  assert.equal(
    (
      await request(owner, 'POST', '/api/timelines/links/query', {
        sources: [sources[0], { ...sources[1], scale: '0' }],
        lower: '0',
        upper: '1',
      })
    )[0],
    400,
  );

  // A sparse save deleting a linked moment removes its link; a whole save, a duration's.
  await call(owner, 'PUT', `/api/timelines/${greece.id}/changes`, {
    revision: await revision(greece.id),
    settings: timeline('Greece', []),
    changes: [{ id: 'olympics', event: null }],
  });
  assert.deepEqual((await links(owner, rome.id, { moment: 'founding' })).links, []);
  const count = async () =>
    Number(
      (
        await pool.query(
          'SELECT count(*) FROM oc_timeline_links WHERE a_timeline=ANY($1) OR b_timeline=ANY($1)',
          [[rome.id, greece.id, persia.id]],
        )
      ).rows[0].count,
    );
  assert.equal(await count(), 1);
  await call(owner, 'PUT', `/api/timelines/${rome.id}`, {
    revision: await revision(rome.id),
    document: timeline('Rome', [
      ['founding', '0/1'],
      ['empire', '100/1'],
    ]),
  });
  assert.equal(await count(), 0);

  // A fork reads its source's moments through: links to them hold until the fork deletes one.
  const store = new PostgresStore(pool);
  const fork = await new Versioning(store).copy(rome.id, other, {
    revision: await revision(rome.id),
  });
  const forked = await call(other, 'POST', `/api/timelines/${fork.id}/links`, {
    from: { moment: 'empire' },
    to: { timeline: persia.id, moment: 'cyrus' },
  });
  assert.equal(forked.title, 'Persia cyrus');
  await call(other, 'PUT', `/api/timelines/${fork.id}/changes`, {
    revision: await revision(fork.id),
    settings: timeline('Rome', []),
    changes: [{ id: 'founding', event: null }],
  });
  assert.equal((await links(other, fork.id, { moment: 'empire' })).links.length, 1, 'kept');
  await call(other, 'PUT', `/api/timelines/${fork.id}/changes`, {
    revision: await revision(fork.id),
    settings: timeline('Rome', []),
    changes: [{ id: 'empire', event: null }],
  });
  assert.equal(
    Number(
      (
        await pool.query(
          'SELECT count(*) FROM oc_timeline_links WHERE a_timeline=$1 OR b_timeline=$1',
          [fork.id],
        )
      ).rows[0].count,
    ),
    0,
  );

  // Deleting a timeline deletes its links.
  await call(owner, 'POST', `/api/timelines/${rome.id}/links`, {
    from: { moment: 'founding' },
    to: { timeline: greece.id, moment: 'athens' },
  });
  await call(owner, 'DELETE', `/api/timelines/${greece.id}`);
  assert.equal(await count(), 0);

  // Paging: a page of links, then the next after it.
  const many = await call(
    owner,
    'POST',
    '/api/timelines',
    timeline('Many', [
      ['a', '1/1'],
      ['b', '2/1'],
      ['c', '3/1'],
    ]),
  );
  assert.equal(await count(), 0);
  // The next links' IDs cross from one length to the next (99, 100, …), so a page ordered by
  // their text instead of their number shows.
  const { last_value: last } = (await pool.query('SELECT last_value FROM oc_timeline_links_id_seq'))
    .rows[0];
  await pool.query("SELECT setval('oc_timeline_links_id_seq',$1)", [
    String(10n ** BigInt(String(BigInt(last) + 2n).length) - 2n),
  ]);
  for (const id of ['a', 'b', 'c'])
    await call(owner, 'POST', `/api/timelines/${many.id}/links`, {
      from: { moment: id },
      to: { timeline: rome.id, moment: 'founding' },
    });
  const first = await call(owner, 'GET', `/api/timelines/${rome.id}/links?moment=founding&limit=2`);
  assert.equal(first.links.length, 2);
  assert.ok(first.next);
  const second = await call(
    owner,
    'GET',
    `/api/timelines/${rome.id}/links?moment=founding&limit=2&after=${first.next}`,
  );
  assert.deepEqual(
    second.links.map((l) => l.entity),
    ['c'],
  );
  assert.equal(second.next, null);
  // Finding what to link to: the events and timelines the account may save, below the limit,
  // never on the timeline linking; and what a pasted address names.
  const lyra = await call(
    owner,
    'POST',
    '/api/timelines',
    timeline(
      'Lyra',
      [
        ['vega', '1/1'],
        ['sheliak', '2/1'],
      ],
      [['summer', '1/1', '3/1']],
    ),
  );
  const draco = await call(owner, 'POST', '/api/timelines', timeline('Draco', [['thuban', '1/1']]));
  /** What `who` finds to link to, as `timeline title/kind:id`, retried while it is indexed. */
  const linkable = async (who, body, expected) => {
    let found;
    for (let attempt = 0; attempt < 50; attempt++) {
      found = (
        await call(who, 'POST', '/api/timelines/entities/search', {
          scope: 'writable',
          linkable: true,
          ...body,
        })
      ).entities.map((e) => `${e.timeline.title}/${e.kind}:${e.id}`);
      if (JSON.stringify(found) === JSON.stringify(expected)) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.deepEqual(found, expected, JSON.stringify(body));
  };
  const timelinesFound = async (who, body) =>
    (
      await call(who, 'POST', '/api/timelines/search', {
        scope: 'writable',
        linkable: true,
        ...body,
      })
    ).timelines.map((t) => t.title);
  await linkable(owner, { search: 'thuban' }, ['Draco/moment:thuban']);
  await linkable(owner, { search: 'vega' }, ['Lyra/moment:vega']);
  // From Lyra, nothing on Lyra itself.
  await linkable(owner, { search: 'vega', exclude: lyra.id }, []);
  await linkable(owner, { search: 'lyra summer', exclude: draco.id }, ['Lyra/duration:summer']);
  assert.deepEqual(await timelinesFound(owner, { search: 'lyra', exclude: lyra.id }), []);
  assert.deepEqual(await timelinesFound(owner, { search: 'draco', exclude: lyra.id }), ['Draco']);
  // Not another account's timelines, which it may not save.
  await linkable(other, { search: 'thuban' }, []);
  assert.deepEqual(await timelinesFound(other, { search: 'draco' }), []);
  const [signedOut] = await request(null, 'POST', '/api/timelines/entities/search', {
    search: 'thuban',
    scope: 'writable',
  });
  assert.equal(signedOut, 401);
  // Each timeline counts its links; at the limit (3 here) it is left out, until one goes.
  const added = [];
  for (const from of [{ moment: 'vega' }, { moment: 'sheliak' }, { duration: 'summer' }])
    added.push(
      await call(owner, 'POST', `/api/timelines/${lyra.id}/links`, {
        from,
        to: { timeline: draco.id, moment: 'thuban' },
      }),
    );
  const linkCount = async (id) =>
    (await pool.query('SELECT link_count FROM oc_timelines WHERE id=$1', [id])).rows[0].link_count;
  assert.deepEqual([await linkCount(lyra.id), await linkCount(draco.id)], [3, 3]);
  await linkable(owner, { search: 'thuban' }, []);
  assert.deepEqual(await timelinesFound(owner, { search: 'draco' }), []);
  await linkable(owner, { search: 'thuban', linkable: false }, ['Draco/moment:thuban']);
  await call(owner, 'DELETE', `/api/timelines/${lyra.id}/links`, { link: added[0].id });
  assert.equal(await linkCount(draco.id), 2);
  await linkable(owner, { search: 'thuban' }, ['Draco/moment:thuban']);

  // What an address names: a moment's page, a timeline's at its owner's name, an embed and the
  // editor's own address with what they open at; a timeline itself is `same`. Only addresses
  // on this site, of timelines the account may read, and entities they have.
  const resolve = (address) =>
    request(owner, 'POST', `/api/timelines/${rome.id}/links/resolve`, { address });
  const [found, thuban] = await resolve(`/timelines/${draco.id}/moments/thuban`);
  assert.equal(found, 200);
  assert.deepEqual(
    { ...thuban, entity: { ...thuban.entity, when: undefined } },
    {
      timeline: {
        id: draco.id,
        title: 'Draco',
        owner: 'links_' + owner.slice(0, 8),
        slug: draco.slug ?? null,
      },
      entity: {
        kind: 'moment',
        id: 'thuban',
        title: 'Draco thuban',
        first: '1/1',
        last: '1/1',
        when: undefined,
      },
      same: false,
      canWrite: true,
      full: false,
    },
  );
  const named = `http://localhost:5173/links_${owner.slice(0, 8)}/${draco.slug ?? draco.id}`;
  assert.deepEqual((await resolve(named))[1].entity, null);
  assert.equal((await resolve(named))[1].timeline.id, draco.id);
  for (const address of [
    `http://localhost:5173/embed/${draco.id}#moment/thuban`,
    `http://localhost:5173/editor#timeline/${draco.id}/moment/thuban`,
    `/timelines/${draco.id}#moment/thuban`,
  ])
    assert.equal((await resolve(address))[1].entity?.id, 'thuban', address);
  assert.equal((await resolve(`/timelines/${rome.id}`))[1].same, true);
  assert.equal((await resolve(`/timelines/${lyra.id}`))[1].full, false);
  for (const [address, status] of [
    [`/timelines/${draco.id}/moments/nothing`, 404],
    [`/timelines/${persia.id}`, 404],
    [`/timelines/${randomUUID()}`, 404],
    [`https://elsewhere.example/timelines/${draco.id}`, 400],
    [`/timelines/${draco.id}/history`, 400],
    ['not an address at all', 400],
  ])
    assert.equal((await resolve(address))[0], status, address);
  // A private timeline's address answers as one with no timeline, so it cannot be confirmed.
  await pool.query("UPDATE oc_timelines SET slug='persia-secret' WHERE id=$1", [persia.id]);
  const otherName = `http://localhost:5173/links_${other.slice(0, 8)}/`;
  const hidden = await resolve(otherName + 'persia-secret'),
    missing = await resolve(otherName + 'persia-nothing');
  assert.equal(hidden[0], 404);
  assert.deepEqual(hidden, missing);
  assert.deepEqual(await resolve(`/timelines/${persia.id}`), missing);
  // Deleting a timeline takes its links off the other's count.
  await call(owner, 'DELETE', `/api/timelines/${lyra.id}`);
  assert.equal(await linkCount(draco.id), 0);
  console.log(
    'PASS links between timelines: added and removed with write access to both, listed to readers of both, a comparison’s arcs aligned in a window, removed with deleted entities (sparse, whole, on a fork) and timelines, held to the limit, paged; what to link to found among the timelines and events the account may save, below the limit and off the timeline linking; pasted addresses resolved.',
  );
} finally {
  if (app) await new Promise((resolve) => app.close(resolve));
  for (const id of [owner, other]) {
    await pool.query('DELETE FROM oc_timelines WHERE owner_id=$1', [id]);
    await pool.query('DELETE FROM oc_sessions WHERE user_id=$1', [id]);
  }
  await pool.query('DELETE FROM oc_users WHERE id=ANY($1)', [[owner, other]]);
  await pool.end();
}
