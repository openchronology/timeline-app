// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { createApplication } from '../server/http.mjs';
import { flushMail } from '../server/mail.mjs';
import { tokenHash } from '../server/auth.mjs';
import assert from 'node:assert/strict';
import {
  demo,
  validateDocument,
  DEFAULT_PRESENTATION,
  CUSTOM_EXAMPLE,
  PLUGIN_EXAMPLE,
  MOMENT_SHAPES,
  TimelineIndex,
} from '../dist/core.mjs';
if (!process.env.DATABASE_URL)
  throw new Error('DATABASE_URL must refer to a dedicated test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
let providerSubject = 42001;
const providers = { github: { clientId: 'test-client', clientSecret: 'test-secret' } };
const delivered = [],
  securityKey = Buffer.alloc(32, 7),
  mailer = {
    async send(message) {
      delivered.push(message);
    },
  };
const app = createApplication({
  mailer,
  securityKey,
  passwordCheck: async () => {},
  pool,
  providers,
  trustProxy: true,
  fetcher: async (url, options) => {
    if (String(url).endsWith('/access_token')) {
      assert.equal(new URLSearchParams(options.body).get('client_secret'), 'test-secret');
      return new Response(JSON.stringify({ access_token: 'test-provider-token' }));
    }
    assert.equal(String(url), 'https://api.github.com/user');
    assert.equal(options.headers.Authorization, 'Bearer test-provider-token');
    return new Response(JSON.stringify({ id: providerSubject, email: 'same@example.com' }));
  },
});
await new Promise((resolve, reject) => {
  app.once('error', reject);
  app.listen(0, '127.0.0.1', resolve);
});
const origin = `http://127.0.0.1:${app.address().port}`,
  suffix = Date.now().toString(36),
  accounts = [],
  timelines = [];
let clientNumber = 0;
const clientAddresses = [];
function client(bearer) {
  const cookies = new Map(),
    ip = `192.0.2.${++clientNumber}`;
  clientAddresses.push(ip);
  let csrf = '';
  return {
    async request(path, method = 'GET', data, expected = 200, withCsrf = true, binary = false) {
      const res = await fetch(origin + '/api/' + path, {
        method,
        redirect: 'manual',
        headers: {
          'X-Forwarded-For': ip,
          ...(cookies.size ? { Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
          ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
          ...(data !== undefined
            ? {
                'Content-Type': binary
                  ? 'application/vnd.openchronology.sqlite'
                  : 'application/json',
              }
            : {}),
          ...(csrf && withCsrf ? { 'X-CSRF-Token': csrf } : {}),
        },
        ...(data !== undefined ? { body: binary ? data : JSON.stringify(data) } : {}),
      });
      for (const cookie of res.headers.getSetCookie()) {
        const part = cookie.split(';')[0],
          at = part.indexOf('=');
        if (part.slice(at + 1)) cookies.set(part.slice(0, at), part.slice(at + 1));
        else cookies.delete(part.slice(0, at));
      }
      const value =
        res.status === 303
          ? { location: res.headers.get('location') }
          : res.headers.get('content-type')?.startsWith('application/vnd.openchronology.sqlite')
            ? Buffer.from(await res.arrayBuffer())
            : await res.json();
      assert.equal(
        res.status,
        expected,
        Buffer.isBuffer(value) ? 'SQLite response' : JSON.stringify(value),
      );
      if (value.csrf) csrf = value.csrf;
      return value;
    },
  };
}
async function confirmEmail(c, email) {
  await flushMail(pool, mailer, securityKey);
  const message = delivered.findLast((m) => m.to === email && m.text.includes('#verify='));
  assert(message, 'confirmation email queued');
  const token = message.text.match(/#verify=([a-f0-9]{64})/)[1];
  await c.request('auth/email/verify', 'POST', { token });
}
async function completeSocial(c, email) {
  const pending = await c.request('session');
  if (!pending.user) {
    assert.equal(pending.challenge, 'email');
    await c.request('auth/email/enroll', 'POST', { email });
    await confirmEmail(c, email);
    await c.request('session');
    const url = new URL((await c.request('auth/github/start', 'POST', {})).url);
    await c.request(
      `auth/github/callback?state=${url.searchParams.get('state')}&code=mock`,
      'GET',
      undefined,
      303,
    );
  }
}
const owner = client(),
  viewer = client(),
  editor = client(),
  anonymous = client();
try {
  for (const [c, prefix] of [
    [owner, 'owner'],
    [viewer, 'viewer'],
    [editor, 'editor'],
  ]) {
    await c.request('session');
    await c.request(
      'auth/register',
      'POST',
      { username: `${prefix}_${suffix}`, password: 'testing exact rational timelines' },
      403,
      false,
    );
    const email = `${prefix}_${suffix}@example.test`,
      password = 'testing exact rational timelines';
    const pending = await c.request('auth/register', 'POST', {
      username: `${prefix}_${suffix}`,
      email,
      password,
      passwordConfirmation: password,
    });
    assert.equal(pending.verificationRequired, true);
    assert.equal((await c.request('session')).user, null);
    await confirmEmail(c, email);
    const r = await c.request('auth/login', 'POST', { username: `${prefix}_${suffix}`, password });
    accounts.push(r.user.id);
  }
  // Community definitions use the same account/session protections as timeline writes.
  await anonymous.request('plugins/publish', 'POST', PLUGIN_EXAMPLE, 401);
  await owner.request('plugins/publish', 'POST', PLUGIN_EXAMPLE, 403, false);
  const published = await owner.request('plugins/publish', 'POST', PLUGIN_EXAMPLE, 201);
  assert.equal(published.id, 'u-' + accounts[0].replaceAll('-', '') + '-status-symbols');
  await owner.request('plugins/publish', 'POST', published, 409);
  await viewer.request('plugins/publish', 'POST', published, 400);
  const updatedPlugin = await owner.request(
    'plugins/publish',
    'POST',
    { ...published, version: 2 },
    201,
  );
  assert.equal(updatedPlugin.version, 2);
  assert.equal(
    (await anonymous.request('plugins/' + published.id + '/1')).source,
    published.source,
  );
  assert.equal(
    (await anonymous.request('plugins/search', 'POST', { search: published.id, page: 1, limit: 1 }))
      .plugins[0].version,
    2,
  );
  const combined = await anonymous.request('plugins/search', 'POST', {
    search: '',
    page: 1,
    limit: 50,
  });
  assert(combined.plugins.some((p) => p.id === 'moment-shapes'));
  assert(combined.plugins.some((p) => p.id === published.id));
  const document = demo(true);
  document.plugins = [
    { manifest: published, enabled: true },
    { manifest: MOMENT_SHAPES, enabled: true },
  ];
  document.events[0].metadata.status = 'blocked';
  document.presentation = {
    ...DEFAULT_PRESENTATION,
    mode: 'custom',
    source: CUSTOM_EXAMPLE,
  };
  const t = await owner.request('timelines', 'POST', document, 201);
  timelines.push(t.id);
  assert.equal(t.visibility, 'private');
  await anonymous.request(`timelines/${t.id}`, 'GET', undefined, 404);
  await viewer.request(`timelines/${t.id}`, 'GET', undefined, 404);
  await owner.request(`timelines/${t.id}/members`, 'POST', {
    username: `viewer_${suffix}`,
    role: 'viewer',
  });
  await owner.request(`timelines/${t.id}/members`, 'POST', {
    username: `editor_${suffix}`,
    role: 'editor',
  });
  const viewed = await viewer.request(`timelines/${t.id}`);
  assert.equal(viewed.canEdit, false);
  assert.deepEqual(viewed.presentation, document.presentation);
  const editing = await editor.request(`timelines/${t.id}`);
  assert.equal(editing.canEdit, true);
  const frame = await viewer.request(`timelines/${t.id}/query`, 'POST', {
    kind: 'overview',
    lower: '10',
    upper: '11',
    threshold: '1',
  });
  assert.equal(frame.groups[0].count, '20001');
  assert(frame.visitedNodes < 50);
  const bounded = await owner.request(`timelines/${t.id}/query`, 'POST', {
    kind: 'overview',
    lower: '0',
    upper: '30',
    threshold: '0',
    revision: t.revision,
  });
  assert(bounded.groups.length <= 1025);
  assert(bounded.threshold !== '0');
  assert.equal(
    bounded.groups.reduce((n, g) => n + BigInt(g.count), 0n),
    20010n,
  );
  assert(bounded.visitedNodes < 200);
  const sparseTimeline = await owner.request(
    'timelines',
    'POST',
    {
      ...document,
      events: document.events.slice(0, 10),
    },
    201,
  );
  timelines.push(sparseTimeline.id);
  const changed = {
    ...document.events[0],
    metadata: { ...document.events[0].metadata, title: 'Sparse edit' },
  };
  const settings = { ...document, title: 'Sparse save', events: undefined };
  const patch = {
    revision: sparseTimeline.revision,
    settings,
    changes: [
      { id: changed.id, event: changed },
      { id: document.events[1].id, event: null },
      { id: 'new-sparse', event: { id: 'new-sparse', time: '99/1', metadata: { title: 'New' } } },
    ],
  };
  await viewer.request(`timelines/${sparseTimeline.id}/changes`, 'PUT', patch, 404);
  await owner.request(`timelines/${sparseTimeline.id}/changes`, 'PUT', patch, 403, false);
  const patched = await owner.request(`timelines/${sparseTimeline.id}/changes`, 'PUT', patch);
  assert.equal(patched.revision, '2');
  const afterPatch = await owner.request(`timelines/${sparseTimeline.id}/document`);
  assert.equal(afterPatch.document.events.length, 10);
  assert.equal(afterPatch.document.title, 'Sparse save');
  assert.equal(
    afterPatch.document.events.find((e) => e.id === changed.id).metadata.title,
    'Sparse edit',
  );
  assert(!afterPatch.document.events.some((e) => e.id === document.events[1].id));
  assert.deepEqual(
    afterPatch.document.events.find((e) => e.id === document.events[3].id),
    document.events[3],
  );
  assert.deepEqual(afterPatch.document.plugins, document.plugins);
  await owner.request(`timelines/${sparseTimeline.id}/changes`, 'PUT', patch, 409);
  await owner.request(
    `timelines/${sparseTimeline.id}/query`,
    'POST',
    { kind: 'overview', lower: '0', upper: '100', threshold: '1', revision: '1' },
    409,
  );
  const oldSnapshot = await owner.request(
    `timelines/${sparseTimeline.id}/history/${sparseTimeline.head_revision_id}`,
  );
  assert.equal(oldSnapshot.document.events.length, 10);
  assert.equal(oldSnapshot.document.events[0].metadata.title, document.events[0].metadata.title);

  await viewer.request(`timelines/${t.id}`, 'PUT', { revision: t.revision, document }, 403);
  await owner.request(`timelines/${t.id}`, 'PUT', { revision: t.revision, document }, 403, false);
  const updated = await editor.request(`timelines/${t.id}`, 'PUT', {
    revision: t.revision,
    document: { ...document, title: 'An editor changed this' },
  });
  assert.equal(updated.revision, '2');
  await owner.request(`timelines/${t.id}`, 'PUT', { revision: t.revision, document }, 409);
  const snapshot = await viewer.request(`timelines/${t.id}/document`);
  assert.equal(validateDocument(snapshot.document).events.length, 20010);
  assert.deepEqual(snapshot.document.presentation, document.presentation);
  const page = await viewer.request(`timelines/${t.id}/query`, 'POST', {
    kind: 'events',
    lower: '10',
    upper: '11',
    limit: 5,
  });
  assert.equal(page.events.length, 5);
  assert(page.next);
  const next = await viewer.request(`timelines/${t.id}/query`, 'POST', {
    kind: 'events',
    lower: '10',
    upper: '11',
    limit: 5,
    after: page.next,
  });
  assert(!next.events.some((e) => page.events.some((p) => p.id === e.id)));
  await editor.request(`timelines/${t.id}/settings`, 'PATCH', { visibility: 'public' }, 403);
  await owner.request(`timelines/${t.id}/settings`, 'PATCH', { visibility: 'public' });
  const publicView = await anonymous.request(`timelines/${t.id}`);
  assert.equal(publicView.canEdit, false);
  assert.deepEqual(publicView.presentation, document.presentation);
  await anonymous.request(
    `timelines/${t.id}`,
    'PUT',
    { revision: publicView.revision, document },
    401,
  );
  await owner.request(`timelines/${t.id}/members`, 'DELETE', { username: `editor_${suffix}` });
  await editor.request(
    `timelines/${t.id}`,
    'PUT',
    { revision: publicView.revision, document },
    403,
  );
  // Browser-bound state, one-use callbacks and provider subject identity.
  const social = client();
  await social.request('session');
  const started = await social.request('auth/github/start', 'POST', {});
  const state = new URL(started.url).searchParams.get('state');
  await client().request(`auth/github/callback?state=${state}&code=mock`, 'GET', undefined, 400);
  await social.request(`auth/github/callback?state=${state}&code=mock`, 'GET', undefined, 303);
  await social.request(`auth/github/callback?state=${state}&code=mock`, 'GET', undefined, 400);
  await completeSocial(social, `social_${suffix}@example.test`);
  const socialUser = (await social.request('session')).user;
  accounts.push(socialUser.id);
  assert.deepEqual((await social.request('auth/account')).identities, ['github']);
  for (const differentSubject of [false, true]) {
    if (differentSubject) providerSubject++;
    const other = client();
    await other.request('session');
    const url = new URL((await other.request('auth/github/start', 'POST', {})).url);
    await other.request(
      `auth/github/callback?state=${url.searchParams.get('state')}&code=mock`,
      'GET',
      undefined,
      303,
    );
    await completeSocial(other, `social_${providerSubject}_${suffix}@example.test`);
    const user = (await other.request('session')).user;
    if (differentSubject) {
      assert.notEqual(user.id, socialUser.id);
      accounts.push(user.id);
    } else assert.equal(user.id, socialUser.id);
  }
  providerSubject++;
  const link = new URL((await owner.request('auth/github/start', 'POST', { link: true })).url);
  await owner.request(
    `auth/github/callback?state=${link.searchParams.get('state')}&code=mock`,
    'GET',
    undefined,
    303,
  );
  assert.deepEqual((await owner.request('auth/account')).identities, ['github']);
  providerSubject = 42001;
  const conflict = new URL((await owner.request('auth/github/start', 'POST', { link: true })).url);
  await owner.request(
    `auth/github/callback?state=${conflict.searchParams.get('state')}&code=mock`,
    'GET',
    undefined,
    409,
  );
  const staleLink = new URL((await owner.request('auth/github/start', 'POST', { link: true })).url);
  await owner.request('auth/login', 'POST', {
    username: `owner_${suffix}`,
    password: 'testing exact rational timelines',
  });
  await owner.request(
    `auth/github/callback?state=${staleLink.searchParams.get('state')}&code=mock`,
    'GET',
    undefined,
    403,
  );

  // Native approval requires an authenticated browser and cannot be replayed.
  const deviceClient = client(),
    challenge = await deviceClient.request('auth/device/start', 'POST', {});
  assert.match(challenge.verificationUri, /\/connect\/desktop\/[A-Z2-9]{10}$/);
  assert.deepEqual(
    await deviceClient.request('auth/device/poll', 'POST', { deviceCode: challenge.deviceCode }),
    { pending: true },
  );
  await anonymous.request('auth/device/approve', 'POST', { userCode: challenge.userCode }, 401);
  await owner.request('auth/device/approve', 'POST', { userCode: challenge.userCode }, 403, false);
  await owner.request('auth/device/approve', 'POST', { userCode: challenge.userCode });
  await owner.request('auth/device/approve', 'POST', { userCode: challenge.userCode }, 400);
  await pool.query(
    "UPDATE oc_device_logins SET last_poll_at=now()-interval '4 seconds' WHERE user_code=$1",
    [challenge.userCode],
  );
  const nativeSession = await deviceClient.request('auth/device/poll', 'POST', {
    deviceCode: challenge.deviceCode,
  });
  await deviceClient.request('auth/device/poll', 'POST', { deviceCode: challenge.deviceCode }, 400);
  const nativeClient = client(nativeSession.token);
  assert.equal((await nativeClient.request('session')).user.id, accounts[0]);
  assert((await owner.request('auth/account')).sessions.some((s) => s.kind === 'desktop'));
  const hash = tokenHash(nativeSession.token);
  assert.equal(
    (await pool.query('SELECT token_hash FROM oc_sessions WHERE token_hash=$1', [hash])).rows
      .length,
    1,
  );
  await pool.query(
    "UPDATE oc_sessions SET last_seen_at=now()-interval '2 days' WHERE token_hash=$1",
    [hash],
  );
  assert.equal((await nativeClient.request('session')).user, null);
  await pool.query(
    'UPDATE oc_sessions SET last_seen_at=now(),expires_at=now() WHERE token_hash=$1',
    [hash],
  );
  assert.equal((await nativeClient.request('session')).user, null);
  await pool.query("UPDATE oc_sessions SET expires_at=now()+interval '1 day' WHERE token_hash=$1", [
    hash,
  ]);
  assert((await nativeClient.request('session')).user);
  await owner.request('auth/revoke-others', 'POST', {});
  await nativeClient.request('timelines', 'GET', undefined, 401);
  const expired = await deviceClient.request('auth/device/start', 'POST', {});
  await pool.query('UPDATE oc_device_logins SET expires_at=now() WHERE user_code=$1', [
    expired.userCode,
  ]);
  await deviceClient.request('auth/device/poll', 'POST', { deviceCode: expired.deviceCode }, 400);
  await owner.request('auth/device/approve', 'POST', { userCode: expired.userCode }, 400);
  await pool.query('DELETE FROM oc_device_logins WHERE user_code=$1', [expired.userCode]);

  // Private contribution branches, write access, discussion, rebase and atomic merge.
  const upstreamDocument = validateDocument({
    ...demo(),
    title: 'Observatory ' + suffix,
    description: 'A star map of early navigation',
    tags: ['astronomy', 'science'],
    events: demo().events.slice(0, 3),
    plugins: document.plugins,
  });
  const custody = await owner.request('timelines', 'POST', upstreamDocument, 201);
  timelines.push(custody.id);
  assert(custody.canWrite && custody.canShare);
  await owner.request(`timelines/${custody.id}/members`, 'POST', {
    username: `editor_${suffix}`,
    role: 'contributor',
  });
  await owner.request(`timelines/${custody.id}/members`, 'POST', {
    username: `viewer_${suffix}`,
    role: 'writer',
  });
  const contributorAccess = await editor.request(`timelines/${custody.id}`);
  assert(
    contributorAccess.canEdit &&
      contributorAccess.canPropose &&
      !contributorAccess.canWrite &&
      !contributorAccess.canShare,
  );
  await editor.request(
    `timelines/${custody.id}`,
    'PUT',
    { revision: custody.revision, document: upstreamDocument },
    403,
  );
  await viewer.request(`timelines/${custody.id}/settings`, 'PATCH', { visibility: 'public' }, 403);
  const proposedDocument = validateDocument({
    ...upstreamDocument,
    title: 'Proposed observatory ' + suffix,
    events: [
      ...upstreamDocument.events,
      {
        id: 'recommended',
        time: '1/7',
        metadata: { title: 'Recommended observation', description: 'Telescope calibration' },
      },
    ],
  });
  const proposalInput = {
    title: 'Add an observation',
    body: 'Please review this change.',
    baseRevision: custody.revision,
    document: proposedDocument,
  };
  await anonymous.request(`timelines/${custody.id}/proposals`, 'POST', proposalInput, 401);
  await editor.request(`timelines/${custody.id}/proposals`, 'POST', proposalInput, 403, false);
  const proposal = await editor.request(
    `timelines/${custody.id}/proposals`,
    'POST',
    proposalInput,
    201,
  );
  assert.equal(proposal.author, `editor_${suffix}`);
  assert(proposal.canUpdate && !proposal.canMerge);
  assert.deepEqual(
    (await owner.request(`timelines/${custody.id}/document`)).document,
    upstreamDocument,
  );
  await anonymous.request(
    `timelines/${custody.id}/proposals/${proposal.id}`,
    'GET',
    undefined,
    404,
  );
  await editor.request(
    `timelines/${custody.id}/proposals/${proposal.id}/comments`,
    'POST',
    { body: '<script>plain text</script>' },
    201,
  );
  await viewer.request(
    `timelines/${custody.id}/proposals/${proposal.id}/comments`,
    'POST',
    { body: 'Reviewed; keeping upstream unchanged for now.' },
    201,
  );
  assert.equal(
    (await owner.request(`timelines/${custody.id}/proposals/${proposal.id}/comments`)).comments
      .length,
    2,
  );
  await editor.request(
    `timelines/${custody.id}/proposals/${proposal.id}/resolve`,
    'POST',
    { action: 'merge', revision: proposal.revision },
    403,
  );
  const changedUpstream = validateDocument({
    ...upstreamDocument,
    description: 'Updated upstream context: star map navigation.',
  });
  await viewer.request(`timelines/${custody.id}`, 'PUT', {
    revision: custody.revision,
    document: changedUpstream,
  });
  await viewer.request(
    `timelines/${custody.id}/proposals/${proposal.id}/resolve`,
    'POST',
    { action: 'merge', revision: proposal.revision },
    409,
  );
  const rebased = await editor.request(
    `timelines/${custody.id}/proposals/${proposal.id}/resolve`,
    'POST',
    { action: 'rebase', revision: proposal.revision },
  );
  assert.equal(rebased.document.description, changedUpstream.description);
  assert.equal(rebased.document.title, proposedDocument.title);
  const merged = await viewer.request(
    `timelines/${custody.id}/proposals/${proposal.id}/resolve`,
    'POST',
    { action: 'merge', revision: rebased.revision },
  );
  assert.equal(merged.status, 'merged');
  assert.equal(merged.merged_revision, '3');
  assert.deepEqual(
    new TimelineIndex(
      (await owner.request(`timelines/${custody.id}/document`)).document,
    ).document(),
    new TimelineIndex(rebased.document).document(),
  );
  await viewer.request(
    `timelines/${custody.id}/proposals/${proposal.id}/resolve`,
    'POST',
    { action: 'merge', revision: merged.revision },
    409,
  );
  const another = await editor.request(
    `timelines/${custody.id}/proposals`,
    'POST',
    { ...proposalInput, baseRevision: '3' },
    201,
  );
  await editor.request(
    `timelines/${custody.id}/proposals/${another.id}/resolve`,
    'POST',
    { action: 'reject', revision: another.revision },
    403,
  );
  assert.equal(
    (
      await viewer.request(`timelines/${custody.id}/proposals/${another.id}/resolve`, 'POST', {
        action: 'reject',
        revision: another.revision,
      })
    ).status,
    'rejected',
  );
  const withdraw = await editor.request(
    `timelines/${custody.id}/proposals`,
    'POST',
    { ...proposalInput, baseRevision: '3' },
    201,
  );
  assert.equal(
    (
      await editor.request(`timelines/${custody.id}/proposals/${withdraw.id}/resolve`, 'POST', {
        action: 'close',
        revision: withdraw.revision,
      })
    ).status,
    'closed',
  );
  assert.equal(
    (await owner.request(`timelines/${custody.id}/proposals/search`, 'POST', { page: 1, limit: 1 }))
      .total,
    3,
  );
  const privateSearch = await anonymous.request('timelines/search', 'POST', { search: suffix });
  assert(!privateSearch.timelines.some((t) => t.id === custody.id));
  const mine = await owner.request('timelines/search', 'POST', { scope: 'mine' });
  assert(mine.timelines.some((t) => t.id === custody.id));
  const writerMine = await viewer.request('timelines/search', 'POST', { scope: 'mine' });
  assert(!writerMine.timelines.some((t) => t.id === custody.id));
  await owner.request(`timelines/${custody.id}/settings`, 'PATCH', { visibility: 'public' });
  const publicSearch = await anonymous.request('timelines/search', 'POST', {
    search: '"star map"',
    tag: 'astronomy',
  });
  assert(publicSearch.timelines.some((t) => t.id === custody.id));
  const noteSearch = await anonymous.request('timelines/search', 'POST', { search: 'calibration' });
  assert(noteSearch.timelines.some((t) => t.id === custody.id));
  await anonymous.request('timelines/search', 'POST', { scope: 'mine' }, 401);
  await viewer.request(`timelines/${custody.id}`, 'DELETE', {}, 403);
  await owner.request(`timelines/${custody.id}`, 'DELETE', {});
  await anonymous.request(
    `timelines/${custody.id}/proposals/${proposal.id}`,
    'GET',
    undefined,
    404,
  );
  // Real server-mediated SQLite exchange, with access and CSRF checks.
  assert.equal((await owner.request('session')).fileExchange, true);
  const small = validateDocument({ ...document, events: document.events.slice(0, 10) });
  await anonymous.request('files/export', 'POST', small, 401);
  await owner.request('files/export', 'POST', small, 403, false);
  const sqlite = await owner.request('files/export', 'POST', small);
  assert.equal(sqlite.subarray(0, 16).toString(), 'SQLite format 3\0');
  assert.deepEqual(
    (await owner.request('files/import', 'POST', sqlite, 200, true, true)).document,
    small,
  );
  await owner.request('files/import', 'POST', Buffer.from('not sqlite'), 400, true, true);
  const fileTimeline = await owner.request('timelines', 'POST', small, 201);
  timelines.push(fileTimeline.id);
  await viewer.request(`timelines/${fileTimeline.id}/file`, 'GET', undefined, 404);
  assert(Buffer.isBuffer(await owner.request(`timelines/${fileTimeline.id}/file`)));
  await owner.request(`timelines/${fileTimeline.id}/settings`, 'PATCH', { visibility: 'public' });
  assert(Buffer.isBuffer(await anonymous.request(`timelines/${fileTimeline.id}/file`)));
  await owner.request('auth/logout', 'POST', {});
  await owner.request('timelines', 'GET', undefined, 401);
  console.log(
    'PASS PostgreSQL HTTP: accounts, private/public access, viewer/editor roles, CSRF, atomic revision conflicts, bounded pages, cached overviews, OAuth replay/identity/linking, native approval, expiry/revocation and real SQLite file exchange.',
  );
} finally {
  const throttleKeys = [
    ...clientAddresses.flatMap((ip) => [ip, 'file-download:' + ip]),
    ...accounts.flatMap((id) => ['files:' + id, 'plugin-publish:' + id, 'proposals:' + id]),
  ].map(tokenHash);
  await pool.query('DELETE FROM oc_auth_attempts WHERE key=ANY($1::text[])', [throttleKeys]);
  await pool.query('DELETE FROM oc_timelines WHERE id=ANY($1::uuid[])', [timelines]);
  await pool.query('DELETE FROM oc_users WHERE id=ANY($1::uuid[])', [accounts]);
  await new Promise((resolve) => app.close(resolve));
  await pool.end();
}
