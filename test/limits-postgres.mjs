// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Comparison limits (#86): a saved comparison holds at most as many sources as its owner's
// kind of account may compare, and sessions report each account's limit.
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
  console.log(
    'PASS comparison limits: saved comparisons capped by their owner, administrators apart, sessions report the limit.',
  );
} finally {
  await pool.query('DELETE FROM oc_timelines WHERE id=ANY($1::uuid[])', [timelines.reverse()]);
  await pool.query('DELETE FROM oc_users WHERE id=ANY($1::uuid[])', [users]);
  await pool.end();
}
