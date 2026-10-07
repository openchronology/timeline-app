// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { passwordHash } from '../server/auth.mjs';
import { demo } from '../dist/core.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
const port = Number(process.env.PLATFORM_TEST_PORT ?? 5199),
  origin = `http://127.0.0.1:${port}`,
  users = [],
  timelines = [];
const env = {
  ...process.env,
  NODE_ENV: 'production',
  APP_ORIGIN: origin,
  OCH_APP_ROOT: process.cwd(),
  TRUST_PROXY: '1',
  NEXT_TELEMETRY_DISABLED: '1',
};
for (const key of Object.keys(env))
  if (key.startsWith('OAUTH_') || ['PLUGIN_LIBRARY', 'FEATURED_TIMELINES'].includes(key))
    delete env[key];
env.PORT = String(port);
env.HOSTNAME = '127.0.0.1';
const child = spawn(
  process.execPath,
  [resolve(process.env.PLATFORM_TEST_SERVER ?? 'platform/.next/standalone/platform/server.cjs')],
  {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
let logs = '',
  exited = false;
for (const s of [child.stdout, child.stderr])
  s.on('data', (c) => {
    logs = (logs + c).slice(-12000);
  });
child.on('exit', () => {
  exited = true;
});
function client(ip) {
  const cookies = new Map();
  let csrf;
  return {
    async request(path, { method = 'GET', data, status = 200 } = {}) {
      const res = await fetch(origin + path, {
        method,
        redirect: 'manual',
        headers: {
          Origin: origin,
          'X-Forwarded-For': ip,
          ...(cookies.size ? { Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
          ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
          ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
      });
      for (const header of res.headers.getSetCookie()) {
        const [pair] = header.split(';'),
          [key, value] = pair.split('=');
        if (value) cookies.set(key, value);
        else cookies.delete(key);
      }
      const text = await res.text();
      assert.equal(res.status, status, `${method} ${path}: ${text.slice(0, 400)}`);
      const value = res.headers.get('content-type')?.includes('application/json')
        ? JSON.parse(text)
        : text;
      if (value?.csrf) csrf = value.csrf;
      return value;
    },
  };
}
const owner = client('192.0.2.101'),
  contributor = client('192.0.2.102'),
  guest = client('192.0.2.103');
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (exited) throw new Error(logs);
    try {
      const r = await fetch(origin + '/healthz', { signal: AbortSignal.timeout(500) });
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    await delay(200);
  }
  assert(ready, logs);
  const suffix = Date.now().toString(36),
    term = 'next' + suffix;
  for (const [client, username] of [
    [owner, 'nextowner_' + suffix],
    [contributor, 'nextcontrib_' + suffix],
  ]) {
    await client.request('/api/session');
    const id = randomUUID();
    await pool.query(
      'INSERT INTO oc_users(id,username,email,email_verified_at,password_hash) VALUES($1,$2,$3,now(),$4)',
      [
        id,
        username,
        username + '@example.test',
        await passwordHash('next-ci-test-password-unique-2026'),
      ],
    );
    users.push(id);
    await client.request('/api/auth/login', {
      method: 'POST',
      data: { username, password: 'next-ci-test-password-unique-2026' },
    });
  }
  const document = {
    ...demo(),
    title: term,
    description: 'A searchable exact timeline',
    tags: ['framework-ci'],
  };
  let timeline = await owner.request('/api/timelines', {
    method: 'POST',
    status: 201,
    data: document,
  });
  timelines.push(timeline.id);
  const base = '/timelines/' + timeline.id,
    api = '/api' + base;
  const ownDashboard = await owner.request('/');
  assert.match(ownDashboard, /id="dashboard-mine"/);
  assert(ownDashboard.includes(`href="${base}"`));
  assert.doesNotMatch(await guest.request('/'), /id="dashboard-mine"/);
  assert(
    !(await guest.request('/?search=' + term)).includes(`href="${base}"`),
    'private timeline leaked into public search',
  );
  await owner.request(api + '/star', { method: 'POST', data: { starred: true } });
  assert.match(await owner.request('/'), /id="dashboard-favorites"/);
  const profileUrl = '/users/nextowner_' + suffix;
  assert(
    !(await guest.request(profileUrl)).includes(`href="${base}"`),
    'Private favorites leaked into public profile',
  );
  await guest.request(base, { status: 404 });
  await guest.request(api + '/document', { status: 404 });
  await contributor.request(base + '/settings', { status: 404 });
  // Private forking is explicitly owner-authorized; a copied timeline remains private.
  const contributorName = 'nextcontrib_' + suffix;
  await owner.request(api + '/members', {
    method: 'POST',
    data: { username: contributorName, role: 'contributor' },
  });
  await contributor.request(api + '/fork', {
    method: 'POST',
    status: 403,
    data: { revision: timeline.revision },
  });
  timeline = await owner.request(api + '/settings', {
    method: 'PATCH',
    data: { allowPrivateForks: true },
  });
  const privateFork = await contributor.request(api + '/fork', {
    method: 'POST',
    status: 201,
    data: { revision: timeline.revision },
  });
  timelines.push(privateFork.id);
  await contributor.request('/api/timelines/' + privateFork.id + '/settings', {
    method: 'PATCH',
    status: 403,
    data: { visibility: 'public' },
  });
  await guest.request('/timelines/' + privateFork.id, { status: 404 });
  timeline = await owner.request(api + '/settings', {
    method: 'PATCH',
    data: { visibility: 'public' },
  });
  const profile = await guest.request(profileUrl);
  assert.match(profile, /Public favorites/);
  assert(profile.includes(`href="${base}"`));
  for (const sort of ['stars', 'popularity', 'alphabetical', 'age', 'relevance'])
    assert((await guest.request('/?search=' + term + '&sort=' + sort)).includes(`href="${base}"`));
  const publicPage = await guest.request(base);
  assert.match(publicPage, /title="Timeline editor"/);
  assert(publicPage.includes('/editor/frame#timeline/' + timeline.id));
  assert(
    (await guest.request('/?search=' + term + '&tag=framework-ci')).includes(`href="${base}"`),
  );
  await contributor.request(base + '/settings', { status: 404 });
  const proposal = await contributor.request(api + '/proposals', {
    method: 'POST',
    status: 201,
    data: {
      title: 'Next route proposal',
      body: 'Recommend this exact change.',
      baseRevision: timeline.revision,
      document: { ...document, description: 'Contributor update' },
    },
  });
  await contributor.request(api + '/proposals/' + proposal.id + '/comments', {
    method: 'POST',
    status: 201,
    data: { body: 'Comment through the Next.js API.' },
  });
  const review = await owner.request(base + '/pulls/' + proposal.id);
  assert.match(review, /Next route proposal/);
  assert.match(review, /Comment through the Next.js API/);
  await contributor.request(api + '/proposals/' + proposal.id + '/resolve', {
    method: 'POST',
    status: 403,
    data: { action: 'merge', revision: proposal.revision },
  });
  await owner.request(api + '/proposals/' + proposal.id + '/resolve', {
    method: 'POST',
    data: { action: 'merge', revision: proposal.revision },
  });
  const merged = await guest.request(api + '/document');
  assert.equal(merged.document.description, 'Contributor update');
  timeline = merged.timeline;
  const fork = await contributor.request(api + '/fork', {
    method: 'POST',
    status: 201,
    data: { revision: timeline.revision },
  });
  timelines.push(fork.id);
  const forkApi = '/api/timelines/' + fork.id;
  // Timeline actions are mounted into the editor frame after hydration.
  const forkPage = await contributor.request('/timelines/' + fork.id);
  assert(forkPage.includes('/editor/frame#timeline/' + fork.id));
  assert(forkPage.includes(timeline.id));
  assert.match(
    await contributor.request('/timelines/' + fork.id + '/pulls/new'),
    /Open pull request/,
  );
  assert.match(await contributor.request('/timelines/' + fork.id + '/sync'), /Sync saved fork/);
  const saved = await contributor.request(forkApi, {
    method: 'PUT',
    data: { revision: fork.revision, document: { ...merged.document, title: 'Fork title' } },
  });
  const forkPull = await contributor.request(api + '/proposals', {
    method: 'POST',
    status: 201,
    data: {
      title: 'Pinned fork change',
      body: '',
      sourceTimelineId: fork.id,
      sourceRevisionId: saved.head_revision_id,
    },
  });
  assert.match(await owner.request(base + '/pulls/' + forkPull.id), /Pinned fork checkpoint/);
  const history = await contributor.request(forkApi + '/history');
  assert.equal(history.revisions.length, 2);
  const firstCheckpoint = history.revisions[1].id;
  assert.match(
    await contributor.request('/timelines/' + fork.id + '/history/' + firstCheckpoint),
    /Export this checkpoint/,
  );
  assert.equal(
    (await contributor.request(forkApi + '/history/' + firstCheckpoint)).document.title,
    merged.document.title,
  );
  await guest.request(forkApi + '/history', { status: 404 });
  await guest.request(api + '/history/' + saved.head_revision_id, { status: 404 });
  await owner.request(api + '/proposals/' + forkPull.id + '/resolve', {
    method: 'POST',
    data: { action: 'merge', revision: forkPull.revision },
  });
  await owner.request('/api/auth/logout', { method: 'POST', data: {} });
  assert.doesNotMatch(await owner.request('/'), /id="dashboard-mine"/);
  console.log(
    'PASS Next.js/PostgreSQL accounts, private SSR access, public full-text search, stars, private favorites, public profiles, sorting, sharing, proposal discussion and writer-only merge.',
  );
} catch (e) {
  console.error(logs);
  throw e;
} finally {
  if (!exited) {
    const closed = new Promise((done) => child.once('exit', done));
    child.kill('SIGTERM');
    await Promise.race([closed, delay(5000)]);
    if (!exited) child.kill('SIGKILL');
  }
  for (const id of timelines) await pool.query('DELETE FROM oc_timelines WHERE id=$1', [id]);
  for (const id of users) await pool.query('DELETE FROM oc_users WHERE id=$1', [id]);
  await pool.end();
}
