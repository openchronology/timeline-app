// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Comparison limits (#86): a saved comparison holds at most as many sources as its owner's
// kind of account may compare, and sessions report each account's limit. Entry limits
// (#129): a timeline grows to the server's TIMELINE_ENTRY_LIMIT, or without one when unlimited.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { PostgresStore } from '../server/store.mjs';
import { createRequestHandler } from '../server/http.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
const limits = { guest: 2, user: 3, admin: 4 };
const store = new PostgresStore(pool, { compareLimits: limits });
const users = [],
  timelines = [];
try {
  const account = async (admin) => {
    const id = randomUUID();
    await pool.query(
      'INSERT INTO oc_users(id,username,email,email_verified_at,is_admin) VALUES($1,$2,$3,now(),$4)',
      [id, 'limits_' + id.slice(0, 8), id.slice(0, 8) + '@example.test', admin],
    );
    users.push(id);
    return id;
  };
  const owner = await account(false),
    admin = await account(true);
  const timeline = async (userId, title, comparison) => {
    const created = await store.create(userId, {
      format: 'openchronology',
      version: 1,
      title,
      description: '',
      events: comparison ? [] : [{ id: 'm', time: '1/1', metadata: { title: 'Moment' } }],
      ...(comparison ? { comparison } : {}),
    });
    timelines.push(created.id);
    return created.id;
  };
  const sources = [];
  for (let i = 0; i < 4; i++) sources.push(await timeline(owner, 'Source ' + i));
  // Up to the owner's limit, then refused.
  await timeline(owner, 'Three', { sources: sources.slice(0, 3), combined: false });
  await assert.rejects(
    timeline(owner, 'Four', { sources, combined: false }),
    (error) => error.status === 400 && /at most 3 timelines/.test(error.message),
  );
  // Administrators have their own limit; their comparisons need sources they can open.
  for (const id of sources)
    await pool.query('UPDATE oc_timelines SET visibility=$2 WHERE id=$1', [id, 'public']);
  await timeline(admin, 'Four by an administrator', { sources, combined: false });
  // Sessions say how many timelines the visitor may compare.
  const handler = createRequestHandler({ pool, compareLimits: limits });
  const session = await new Promise((resolve) => {
    const res = {
      statusCode: 0,
      headers: {},
      setHeader(k, v) {
        this.headers[k] = v;
      },
      writeHead(status, headers) {
        this.statusCode = status;
        Object.assign(this.headers, headers ?? {});
      },
      end(body) {
        resolve(JSON.parse(String(body)));
      },
    };
    handler({ url: '/api/session', method: 'GET', headers: {}, socket: {} }, res);
  });
  assert.equal(session.compareLimit, 2);
  assert.equal(session.entryLimit, 200000);

  // A server's entry limit: incremental saves (the editor's, log ingestion's) stop at it.
  const settings = { format: 'openchronology', version: 1, title: 'Entries', description: '' };
  const moment = (i) => ({ id: 'e' + i, time: `${i}/1`, metadata: { title: 'Entry ' + i } });
  const sessionOf = (h) =>
    new Promise((resolve) =>
      h(
        { url: '/api/session', method: 'GET', headers: {}, socket: {} },
        {
          setHeader() {},
          writeHead() {},
          end: (body) => resolve(JSON.parse(String(body))),
        },
      ),
    );
  assert.equal((await sessionOf(createRequestHandler({ pool, entryLimit: 5 }))).entryLimit, 5);
  let grown = await store.create(owner, {
    ...settings,
    events: Array.from({ length: 5 }, (_, i) => moment(i)),
  });
  timelines.push(grown.id);
  const add = (i) =>
    store.save(grown.id, owner, grown.revision, undefined, {
      settings: { ...settings, events: [] },
      changes: [{ id: 'e' + i, event: moment(i) }],
    });
  await assert.rejects(
    add(5),
    (error) => error.status === 400 && /at most 5 moments/.test(error.message),
  );
  // Unlimited: sessions say null, and the timeline grows past the default.
  assert.equal(
    (await sessionOf(createRequestHandler({ pool, entryLimit: Infinity }))).entryLimit,
    null,
  );
  grown = await add(5);
  assert.equal(grown.event_count, '6');
  console.log(
    'PASS limits: saved comparisons capped by their owner, administrators apart, timelines grow to the entry limit or without one, sessions report both.',
  );
} finally {
  await pool.query('DELETE FROM oc_timelines WHERE id=ANY($1::uuid[])', [timelines.reverse()]);
  await pool.query('DELETE FROM oc_users WHERE id=ANY($1::uuid[])', [users]);
  await pool.end();
}
