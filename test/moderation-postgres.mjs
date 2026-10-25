// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Reports and moderation decisions (#115): reporting what one can see, signed in or not; the
// review queue; restricting a timeline, comment, plugin and account with a statement of
// reasons; the owner's one request for review; lifting; and who is told what.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { Auth, passwordHash } from '../server/auth.mjs';
import { createApplication } from '../server/http.mjs';
import { validateDocument, PLUGIN_EXAMPLE } from '../dist/core.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
const suffix = randomUUID().slice(0, 8),
  password = 'unique moderation testing passphrase';
const ids = [],
  sent = [];
const app = createApplication({
  pool,
  mailer: {
    async send(message) {
      sent.push(message);
    },
  },
  securityKey: Buffer.alloc(32, 23),
  passwordCheck: async () => {},
});
await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${app.address().port}`,
  auth = new Auth(pool, origin);
async function request(path, method = 'GET', data, credentials = {}, expected = 200) {
  const response = await fetch(origin + '/api/' + path, {
    method,
    headers: { ...credentials, ...(data ? { 'Content-Type': 'application/json' } : {}) },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  const value = await response.json();
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(value)}`);
  return value;
}
async function user(name, { admin = false } = {}) {
  const id = randomUUID(),
    username = name + '_' + suffix;
  ids.push(id);
  await pool.query(
    'INSERT INTO oc_users(id,username,email,password_hash,email_verified_at,is_admin,quota_bypass,terms_version) VALUES($1,$2,$3,$4,now(),$5,true,oc_policy_version())',
    [id, username, username + '@example.test', await passwordHash(password), admin],
  );
  const u = (await pool.query('SELECT * FROM oc_users WHERE id=$1', [id])).rows[0];
  const issued = await auth.issue(u);
  return {
    id,
    username,
    email: username + '@example.test',
    headers: { Cookie: issued.cookie.split(';')[0], 'X-CSRF-Token': issued.csrf },
  };
}
/** A signed-out reader: the sign-in nonce cookie and its CSRF token. */
async function anonymous() {
  const response = await fetch(origin + '/api/session');
  const { csrf } = await response.json();
  const cookie = response.headers.getSetCookie().find((c) => c.includes('oc_login'));
  return { Cookie: cookie.split(';')[0], 'X-CSRF-Token': csrf };
}
/** Mail delivery runs after the decision commits. */
async function mail(to, subject) {
  for (let i = 0; i < 50; i++) {
    const found = sent.findLast((m) => m.to === to && m.subject === subject);
    if (found) return found;
    await delay(50);
  }
  assert.fail(
    `No “${subject}” email to ${to}: ${JSON.stringify(sent.map((m) => [m.to, m.subject]))}`,
  );
}
const cases = async (kind, id) =>
  (
    await pool.query(
      'SELECT * FROM oc_moderation_cases WHERE target_kind=$1 AND target_id=$2 ORDER BY created_at',
      [kind, id],
    )
  ).rows;
let timeline;
try {
  const owner = await user('owner'),
    member = await user('member'),
    reporter = await user('reporter'),
    other = await user('other'),
    admin = await user('moderator', { admin: true }),
    // Decisions and reports are rate-limited per account: later sections use these.
    admin2 = await user('moderator2', { admin: true }),
    reporter2 = await user('reporter2');
  const document = validateDocument({
    format: 'openchronology',
    version: 1,
    title: 'Reported ' + suffix,
    description: '',
    events: [{ id: 'm1', time: '1/3', metadata: { title: 'A moment' } }],
  });
  timeline = await request('timelines', 'POST', document, owner.headers, 201);
  await request(
    `timelines/${timeline.id}/settings`,
    'PATCH',
    { visibility: 'public' },
    owner.headers,
  );
  await pool.query("INSERT INTO oc_members(timeline_id,user_id,role) VALUES($1,$2,'viewer')", [
    timeline.id,
    member.id,
  ]);

  // Reporting: signed out (a moment) and signed in (the timeline); a second report by the
  // same reader replaces their first.
  const reader = await anonymous();
  const momentReport = {
    target: { kind: 'moment', timeline: timeline.id, id: 'm1' },
    category: 'violence',
    details: 'Graphic and unlabelled.',
  };
  await request('reports', 'POST', momentReport, reader, 201);
  await request('reports', 'POST', momentReport, {}, 403);
  await request(
    'reports',
    'POST',
    { target: { kind: 'timeline', timeline: timeline.id }, category: 'spam' },
    reporter.headers,
    201,
  );
  await request(
    'reports',
    'POST',
    {
      target: { kind: 'timeline', timeline: timeline.id },
      category: 'sexual',
      details: 'Explicit.',
    },
    reporter.headers,
    201,
  );
  // What cannot be reported: one's own, nothing, the unknown, the unseen.
  await request(
    'reports',
    'POST',
    { target: { kind: 'timeline', timeline: timeline.id }, category: 'spam' },
    owner.headers,
    400,
  );
  await request(
    'reports',
    'POST',
    { target: { kind: 'timeline', timeline: timeline.id }, category: 'rude' },
    reporter.headers,
    400,
  );
  await request(
    'reports',
    'POST',
    { target: { kind: 'timeline', timeline: randomUUID() }, category: 'spam' },
    reporter.headers,
    404,
  );
  await request(
    'reports',
    'POST',
    { target: { kind: 'user', id: 'nobody_' + suffix }, category: 'spam' },
    reporter.headers,
    404,
  );
  await request(
    'reports',
    'POST',
    {
      target: { kind: 'timeline', timeline: timeline.id },
      category: 'spam',
      details: 'x'.repeat(2001),
    },
    reporter.headers,
    400,
  );
  const [timelineCase] = await cases('timeline', timeline.id);
  assert.equal(timelineCase.status, 'open');
  assert.equal(timelineCase.owner_id, owner.id);
  const reports = (
    await pool.query('SELECT * FROM oc_reports WHERE case_id=$1 ORDER BY created_at', [
      timelineCase.id,
    ])
  ).rows;
  assert.deepEqual(
    reports.map((r) => [r.category, r.entity_kind, r.entity_id, r.reporter_id]),
    [
      ['violence', 'moment', 'm1', null],
      ['sexual', null, null, reporter.id],
    ],
  );

  // The queue is for administrators.
  await request('admin/reports', 'GET', undefined, reporter.headers, 403);
  let queue = await request('admin/reports', 'GET', undefined, admin.headers);
  const item = queue.items.find((i) => i.id === timelineCase.id);
  assert.equal(item.report_count, 2);
  assert.equal(item.owner, owner.username);
  assert.equal(item.target.title, 'Reported ' + suffix);
  assert.equal(item.path, `/timelines/${timeline.id}`);
  assert.deepEqual(item.reports.map((r) => r.reporter).sort(), [null, reporter.username].sort());

  // Restricting: a reason and the administrator's password are required.
  const decide = (id, value, expected = 200) =>
    request(`admin/reports/${id}`, 'PATCH', value, admin.headers, expected);
  await decide(timelineCase.id, { action: 'restrict', password }, 400);
  await decide(timelineCase.id, { action: 'restrict', reason: 'Explicit images.' }, 401);
  await request(
    `admin/reports/${timelineCase.id}`,
    'PATCH',
    { action: 'restrict', reason: 'x', password },
    reporter.headers,
    403,
  );
  await decide(timelineCase.id, { action: 'restrict', reason: 'Explicit images.', password });
  await decide(timelineCase.id, { action: 'dismiss', password }, 409);
  // Only the owner and administrators see it now; it stays private.
  await request(`timelines/${timeline.id}`, 'GET', undefined, await anonymous(), 404);
  await request(`timelines/${timeline.id}`, 'GET', undefined, member.headers, 404);
  const seen = await request(`timelines/${timeline.id}`, 'GET', undefined, owner.headers);
  assert.equal(seen.visibility, 'private');
  assert.equal(seen.moderation.case, timelineCase.id);
  assert.equal(seen.moderation.reason, 'Explicit images.');
  await request(`timelines/${timeline.id}`, 'GET', undefined, admin.headers);
  await request(
    `timelines/${timeline.id}/settings`,
    'PATCH',
    { visibility: 'public' },
    owner.headers,
    403,
  );
  await request(
    `admin/timelines/${timeline.id}`,
    'PATCH',
    { visibility: 'public', password },
    admin.headers,
    409,
  );
  assert(
    !(await request('timelines', 'GET', undefined, member.headers)).timelines.some(
      (t) => t.id === timeline.id,
    ),
  );
  // The owner is told why and how to ask for a review; the signed-in reporter, the outcome.
  assert.match(
    (await mail(owner.email, 'A moderation decision about your content')).text,
    /restricted your timeline “Reported .*”[\s\S]*Reason: Explicit images\.[\s\S]*\/account#moderation/,
  );
  assert.match((await mail(reporter.email, 'Your report was reviewed')).text, /restricted it/);
  assert(!sent.some((m) => m.text.includes(reporter.username)), 'Reporters stay anonymous.');
  // Further reports join the restriction in force.
  await request(
    'reports',
    'POST',
    { target: { kind: 'timeline', timeline: timeline.id }, category: 'other' },
    admin.headers,
    201,
  );
  assert.equal((await cases('timeline', timeline.id)).length, 1);

  // A review: once, by the owner, then decided.
  const decisions = await request('moderation', 'GET', undefined, owner.headers);
  assert.deepEqual(
    decisions.decisions.map((d) => [d.id, d.status, d.reason]),
    [[timelineCase.id, 'restricted', 'Explicit images.']],
  );
  await request(
    `moderation/${timelineCase.id}/appeal`,
    'POST',
    { appeal: 'They are paintings.' },
    reporter.headers,
    404,
  );
  await request(`moderation/${timelineCase.id}/appeal`, 'POST', { appeal: '' }, owner.headers, 400);
  await request(
    `moderation/${timelineCase.id}/appeal`,
    'POST',
    { appeal: 'They are paintings.' },
    owner.headers,
  );
  await request(
    `moderation/${timelineCase.id}/appeal`,
    'POST',
    { appeal: 'Again.' },
    owner.headers,
    409,
  );
  queue = await request('admin/reports', 'GET', undefined, admin.headers);
  assert.equal(queue.items.find((i) => i.id === timelineCase.id)?.appeal, 'They are paintings.');
  await decide(timelineCase.id, { action: 'lift', password });
  const lifted = (await cases('timeline', timelineCase.target_id))[0];
  assert.deepEqual([lifted.status, lifted.appeal_outcome], ['lifted', 'lifted']);
  assert.equal(
    (await request(`timelines/${timeline.id}`, 'GET', undefined, await anonymous())).visibility,
    'public',
  );
  await request(`timelines/${timeline.id}`, 'GET', undefined, member.headers);
  await mail(owner.email, 'A moderation decision was reversed');
  // Reported again later: a new case.
  await request(
    'reports',
    'POST',
    { target: { kind: 'timeline', timeline: timeline.id }, category: 'spam' },
    reporter.headers,
    201,
  );
  const [, again] = await cases('timeline', timeline.id);
  assert.equal(again.status, 'open');
  sent.length = 0;
  await decide(again.id, { action: 'dismiss', password });
  assert.match(
    (await mail(reporter.email, 'Your report was reviewed')).text,
    /does not break the rules/,
  );
  assert(!sent.some((m) => m.to === owner.email), 'A dismissed report is not news to the owner.');

  const decide2 = (id, value, expected = 200) =>
    request(`admin/reports/${id}`, 'PATCH', value, admin2.headers, expected);
  // A comment keeps its place without its text.
  const proposal = await request(
    `timelines/${timeline.id}/proposals`,
    'POST',
    {
      title: 'A change',
      body: '',
      baseRevision: (await request(`timelines/${timeline.id}`, 'GET', undefined, other.headers))
        .revision,
      document,
    },
    other.headers,
    201,
  );
  const comment = await request(
    `timelines/${timeline.id}/proposals/${proposal.id}/comments`,
    'POST',
    { body: 'An abusive comment.' },
    other.headers,
    201,
  );
  await request(
    'reports',
    'POST',
    { target: { kind: 'comment', id: String(comment.id) }, category: 'harassment' },
    reporter2.headers,
    201,
  );
  const [commentCase] = await cases('comment', String(comment.id));
  assert.equal(commentCase.owner_id, other.id);
  queue = await request('admin/reports', 'GET', undefined, admin.headers);
  assert.equal(
    queue.items.find((i) => i.id === commentCase.id).path,
    `/timelines/${timeline.id}/pulls/${proposal.id}`,
  );
  await decide2(commentCase.id, { action: 'restrict', reason: 'Harassment.', password });
  const comments = (
    await request(
      `timelines/${timeline.id}/proposals/${proposal.id}/comments`,
      'GET',
      undefined,
      owner.headers,
    )
  ).comments;
  const removed = comments.find((c) => String(c.id) === String(comment.id));
  assert.deepEqual([removed.body, removed.removed], ['', true]);
  // Its author's review request; upheld.
  await request(
    `moderation/${commentCase.id}/appeal`,
    'POST',
    { appeal: 'It was a joke.' },
    other.headers,
  );
  await decide2(commentCase.id, { action: 'uphold', password });
  await decide2(commentCase.id, { action: 'uphold', password }, 409);
  await mail(other.email, 'The review of a moderation decision');

  // A plugin leaves the library and takes no new versions.
  const pluginId = 'u-' + owner.id.replaceAll('-', '') + '-reported';
  await pool.query('INSERT INTO oc_plugins(id,version,owner_id,manifest) VALUES($1,1,$2,$3)', [
    pluginId,
    owner.id,
    { ...PLUGIN_EXAMPLE, id: pluginId, name: 'Reported plugin ' + suffix },
  ]);
  await request(`plugins/${pluginId}/1`);
  await request(
    'reports',
    'POST',
    { target: { kind: 'plugin', id: pluginId }, category: 'spam' },
    reporter2.headers,
    201,
  );
  await request(
    'reports',
    'POST',
    { target: { kind: 'plugin', id: 'status-symbols' }, category: 'spam' },
    reporter2.headers,
    404,
  );
  const [pluginCase] = await cases('plugin', pluginId);
  await decide2(pluginCase.id, { action: 'restrict', reason: 'Spam.', password });
  await request(`plugins/${pluginId}/1`, 'GET', undefined, {}, 404);
  assert.equal(
    (await request(`plugins?search=${encodeURIComponent('reported plugin ' + suffix)}`)).total,
    0,
  );
  await request(
    'plugins/publish',
    'POST',
    { ...PLUGIN_EXAMPLE, id: pluginId, version: 2 },
    owner.headers,
    403,
  );

  // An account is suspended, then reinstated.
  sent.length = 0;
  await request(
    'reports',
    'POST',
    { target: { kind: 'user', id: other.username }, category: 'harassment' },
    reporter2.headers,
    201,
  );
  const [userCase] = await cases('user', other.id);
  await decide2(userCase.id, { action: 'restrict', reason: 'Repeated harassment.', password });
  assert(
    (await pool.query('SELECT is_disabled FROM oc_users WHERE id=$1', [other.id])).rows[0]
      .is_disabled,
  );
  assert.equal(
    (await pool.query('SELECT count(*) FROM oc_sessions WHERE user_id=$1', [other.id])).rows[0]
      .count,
    '0',
  );
  assert.match(
    (await mail(other.email, 'A moderation decision about your content')).text,
    /suspended[\s\S]*contact the operator/,
  );
  await decide2(userCase.id, { action: 'lift', password });
  assert(
    !(await pool.query('SELECT is_disabled FROM oc_users WHERE id=$1', [other.id])).rows[0]
      .is_disabled,
  );

  // Every decision is audited, without the password.
  const audit = (
    await pool.query(
      "SELECT changes FROM oc_admin_audit WHERE actor_id=ANY($1::uuid[]) AND action='reports'",
      [[admin.id, admin2.id]],
    )
  ).rows;
  assert.equal(audit.length, 8);
  assert(!JSON.stringify(audit).includes(password));
  console.log('PASS moderation: reports, the review queue, restrictions, reviews and notices.');
} finally {
  await pool.query(
    'DELETE FROM oc_moderation_cases WHERE owner_id=ANY($1::uuid[]) OR target_id=ANY($2::text[])',
    [ids, ids],
  );
  await pool.query('DELETE FROM oc_admin_audit WHERE actor_id=ANY($1::uuid[])', [ids]);
  await pool.query('DELETE FROM oc_plugins WHERE owner_id=ANY($1::uuid[])', [ids]);
  if (timeline) {
    await pool.query(
      'DELETE FROM oc_proposal_comments WHERE proposal_id IN (SELECT id FROM oc_proposals WHERE timeline_id=$1)',
      [timeline.id],
    );
    await pool.query('DELETE FROM oc_timelines WHERE id=$1', [timeline.id]);
  }
  await pool.query('DELETE FROM oc_users WHERE id=ANY($1::uuid[])', [ids]);
  app.close();
  await pool.end();
}
