// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Ongoing durations against PostgreSQL (#537): saved whole and sparsely, held in the tree as a
// point at their start, and resolved at the server's clock in windows, summaries, lists and
// lookups, matching what the browser's index draws.
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { PostgresStore } from '../server/store.mjs';
import { DEFAULT_PRESENTATION, Q } from '../dist/core.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const user = randomUUID();
let timeline;
try {
  await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
  await pool.query(
    'INSERT INTO oc_users(id,username,email_verified_at,terms_version) VALUES($1,$2,now(),oc_policy_version())',
    [user, 'ongoing_' + user.slice(0, 8)],
  );
  const store = new PostgresStore(pool);
  // Seconds since the epoch, as the Gregorian display stores them (scale 1, origin 0).
  const now = () => Math.floor(Date.now() / 1000);
  const opened = now() - 3600;
  const doc = {
    format: 'openchronology',
    version: 1,
    title: 'Open work',
    description: '',
    presentation: { ...DEFAULT_PRESENTATION, mode: 'gregorian' },
    events: [{ id: 'opened', time: String(opened), metadata: { title: 'Opened' } }],
    durations: [
      {
        id: 'issue',
        start: { moment: 'opened' },
        end: { ongoing: true },
        metadata: { title: 'Fix the login loop' },
      },
      { id: 'done', start: String(opened - 10800), end: String(opened - 3600), metadata: {} },
    ],
  };
  timeline = await store.create(user, doc);
  // The definition keeps the ongoing end; its band ends now.
  const looked = await store.query(timeline.id, user, { kind: 'duration', id: 'issue' });
  assert.deepEqual(looked.duration.end, { ongoing: true });
  assert.equal(looked.band.first, opened + '/1');
  const lastOf = (band) => Number(Q.parse(band.last).floor().numerator);
  assert.ok(Math.abs(lastOf(looked.band) - now()) <= 5, 'The band ends at the server’s clock.');

  // A window around it draws it to now, longest first, with the counts the browser gives.
  const window = {
    kind: 'overview',
    lower: String(opened - 10000),
    upper: String(now() + 10000),
    threshold: '0/1',
  };
  let frame = await store.query(timeline.id, user, window);
  const issue = frame.durations.find((b) => b.id === 'issue');
  assert.ok(issue, 'The ongoing duration is drawn.');
  assert.ok(Math.abs(lastOf(issue) - now()) <= 5);
  assert.equal(frame.durations.length, 2);
  assert.equal(frame.durationsTruncated, false);
  // Its placeholder is not summarized as well.
  assert.equal(
    frame.groups.reduce((n, g) => n + Number(g.durationCount ?? 0), 0),
    0,
  );
  // A window after now does not reach it.
  frame = await store.query(timeline.id, user, {
    ...window,
    lower: String(now() + 1000),
    upper: String(now() + 2000),
  });
  assert.equal(frame.durations.length, 0);
  assert.equal(frame.groups.length, 0);
  // Zoomed far out it collapses: counted once among the summaries, never twice.
  frame = await store.query(timeline.id, user, {
    ...window,
    lower: String(opened - 1e9),
    upper: String(now() + 1e9),
  });
  assert.equal(frame.durations.length, 0);
  assert.equal(
    frame.groups.reduce((n, g) => n + Number(g.durationCount ?? 0), 0),
    2,
  );

  // The list of a window's durations includes it, in each order, and pages across it.
  const listed = await store.query(timeline.id, user, {
    kind: 'durations',
    overlapping: true,
    lower: window.lower,
    upper: window.upper,
    limit: 1,
  });
  assert.equal(listed.total, 2);
  assert.deepEqual(
    listed.durations.map((b) => b.id),
    ['done'],
    'Longest first: the finished duration (2 hours) before the open one (1 hour).',
  );
  const second = await store.query(timeline.id, user, {
    kind: 'durations',
    overlapping: true,
    lower: window.lower,
    upper: window.upper,
    limit: 1,
    offset: 1,
  });
  assert.deepEqual(
    second.durations.map((b) => b.id),
    ['issue'],
  );
  assert.equal(second.next, null);
  const titled = await store.query(timeline.id, user, {
    kind: 'durations',
    overlapping: true,
    lower: window.lower,
    upper: window.upper,
    limit: 10,
    text: 'login',
  });
  assert.deepEqual(
    titled.durations.map((b) => b.id),
    ['issue'],
  );
  // Wholly inside a summary's span: the resolved band, not the placeholder.
  const inside = await store.query(timeline.id, user, {
    kind: 'durations',
    lower: String(opened),
    upper: String(now() + 100),
    limit: 10,
  });
  assert.deepEqual(
    inside.durations.map((b) => b.id),
    ['issue'],
  );
  const before = await store.query(timeline.id, user, {
    kind: 'durations',
    lower: String(opened),
    upper: String(opened + 10),
    limit: 10,
  });
  assert.equal(before.durations.length, 0, 'It reaches past that span, to now.');

  // A sparse save closes it, and another opens it again.
  const settings = { ...doc, events: [], durations: undefined };
  const closedAt = String(opened + 60);
  timeline = await store.save(timeline.id, user, timeline.revision, undefined, {
    settings,
    changes: [],
    durationChanges: [{ id: 'issue', duration: { ...doc.durations[0], end: closedAt } }],
  });
  frame = await store.query(timeline.id, user, window);
  assert.equal(frame.durations.find((b) => b.id === 'issue').last, closedAt + '/1');
  timeline = await store.save(timeline.id, user, timeline.revision, undefined, {
    settings,
    changes: [],
    durationChanges: [{ id: 'issue', duration: doc.durations[0] }],
  });
  frame = await store.query(timeline.id, user, window);
  assert.ok(Math.abs(lastOf(frame.durations.find((b) => b.id === 'issue')) - now()) <= 5);

  // Timelines without a calendar refuse them.
  await assert.rejects(
    store.create(user, { ...doc, presentation: undefined }),
    /Gregorian time display/,
  );
  console.log('Ongoing durations: PostgreSQL storage and queries passed.');
} finally {
  if (timeline) await pool.query('DELETE FROM oc_timelines WHERE id=$1', [timeline.id]);
  await pool.query('DELETE FROM oc_users WHERE id=$1', [user]);
  await pool.end();
}
