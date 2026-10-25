// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The Next.js platform against PostgreSQL (npm run test:platform:postgres): accounts, private
// pages, search, stars, profiles, sharing, proposals, merging, saved history and addresses.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { passwordHash } from '../server/auth.mjs';
import { demo, PLUGIN_EXAMPLE } from '../dist/core.mjs';
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
  if (
    key.startsWith('OAUTH_') ||
    [
      'PLUGIN_LIBRARY',
      'FEATURED_TIMELINES',
      'PLATFORM_NAME',
      'SUPPORT_URL',
      'GOOGLE_ANALYTICS_ID',
    ].includes(key)
  )
    delete env[key];
// GitHub cannot be reached: the download page links to the latest release by name.
env.RELEASES_API_URL = 'http://127.0.0.1:9/latest';
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
    async request(path, { method = 'GET', data, status = 200, headers = false, send = {} } = {}) {
      const res = await fetch(origin + path, {
        method,
        redirect: 'manual',
        headers: {
          Origin: origin,
          'X-Forwarded-For': ip,
          ...(cookies.size ? { Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
          ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
          ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...send,
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
      return headers ? { value, headers: res.headers } : value;
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
  // Unnamed and without analytics: OpenChronology's name, and no Google hosts allowed.
  const home = await fetch(origin + '/'),
    homeHtml = await home.text();
  assert.match(homeHtml, /src="\/logo-mark\.svg"[^>]*\/>(<!-- -->)?openchronology<\/a>/);
  assert.match(homeHtml, /<title>OpenChronology<\/title>/);
  assert.doesNotMatch(homeHtml, /Powered by OpenChronology|Analytics settings|Support this site/);
  assert.doesNotMatch(home.headers.get('content-security-policy'), /google/);
  const download = await (
    await fetch(origin + '/download', { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh)' } })
  ).text();
  assert.match(download, /The latest release/);
  assert.match(download, /Desktop app for macOS/);
  assert.match(
    download,
    /href="https:\/\/github\.com\/openchronology\/timeline-app\/releases\/latest\/download\/openchronology-desktop-macos-arm64\.dmg"/,
  );
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
  // The Next server compiles a new plugin script in its sandbox worker (#157): one that
  // compiles is accepted, one that doesn't is refused.
  const custom = { ...PLUGIN_EXAMPLE, id: 'next-custom' };
  const withPlugin = (source) => ({
    ...demo(),
    title: 'Plugin sandbox',
    plugins: [{ manifest: { ...custom, source }, enabled: true }],
  });
  const compiled = await owner.request('/api/timelines', {
    method: 'POST',
    data: withPlugin(PLUGIN_EXAMPLE.source + '\n'),
    status: 201,
  });
  timelines.push(compiled.id);
  const refused = await owner.request('/api/timelines', {
    method: 'POST',
    data: withPlugin('function render(m,api) { return fetch(1); }'),
    status: 400,
  });
  assert.match(refused.error, /does not compile/);
  let timeline = await owner.request('/api/timelines', {
    method: 'POST',
    status: 201,
    data: document,
  });
  timelines.push(timeline.id);
  // Its page is at its owner's name and its ID until it has a slug (#148).
  const ownerName = 'nextowner_' + suffix,
    legacy = '/timelines/' + timeline.id,
    base = '/' + ownerName + '/' + timeline.id,
    api = '/api' + legacy;
  // Behind an HTTPS proxy that says so (X-Forwarded-Proto), the address still opens the
  // timeline's page, rather than Next.js proxying the rewrite to https on itself (#255).
  assert.match(
    await owner.request(base, { send: { 'X-Forwarded-Proto': 'https' } }),
    new RegExp(term),
  );
  const ownDashboard = await owner.request('/');
  // The header's end: a signed-in account's menu, and a guest's Sign in (no Sign up, as
  // this server takes no registrations without email).
  assert.match(ownDashboard, new RegExp('class="account-menu-name">' + ownerName + '<'));
  const guestHome = await guest.request('/');
  assert.match(guestHome, /<a href="\/login" class="button">Sign in<\/a>/);
  assert.doesNotMatch(guestHome, /account-menu-button/);
  assert.match(ownDashboard, /id="dashboard-mine"/);
  assert(ownDashboard.includes(`href="${base}"`));
  assert.doesNotMatch(await guest.request('/'), /id="dashboard-mine"/);
  assert(
    !(await guest.request('/?search=' + term)).includes(`href="${base}"`),
    'private timeline leaked into public search',
  );
  await owner.request(api + '/star', { method: 'POST', data: { starred: true } });
  assert.match(await owner.request('/'), /id="dashboard-favorites"/);
  const profileUrl = '/' + ownerName;
  assert(
    !(await guest.request(profileUrl)).includes(`href="${base}"`),
    'Private favorites leaked into public profile',
  );
  // A private timeline is not found for a guest, whose page offers to sign in and return.
  const hidden = await guest.request(base, { status: 404 });
  assert.match(hidden, /it’s a private timeline you can’t open/);
  assert(hidden.includes('/login?returnTo=' + encodeURIComponent(base)));
  await guest.request(legacy, { status: 404 });
  await guest.request(api + '/document', { status: 404 });
  await contributor.request(base + '/settings', { status: 404 });
  // Owners see data retention, which needs a calendar display (this timeline has none).
  assert.match(await owner.request(base + '/settings'), /Data retention[\s\S]*shown as a calendar/);
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
  // An account has one fork of a timeline (#259): forking again opens it, copying nothing.
  const again = await contributor.request(api + '/fork', {
    method: 'POST',
    data: { revision: timeline.revision },
  });
  assert.equal(again.id, privateFork.id);
  assert.equal(again.existing, true);
  // An owner duplicates their own timeline rather than forking it; others fork, not duplicate.
  await owner.request(api + '/fork', {
    method: 'POST',
    status: 403,
    data: { revision: timeline.revision },
  });
  await contributor.request(api + '/duplicate', {
    method: 'POST',
    status: 403,
    data: { revision: timeline.revision },
  });
  const duplicate = await owner.request(api + '/duplicate', {
    method: 'POST',
    status: 201,
    data: { revision: timeline.revision },
  });
  timelines.push(duplicate.id);
  assert.equal(duplicate.upstream_id, null);
  // The private fork goes, so that the public timeline's fork below is a new one.
  await contributor.request('/api/timelines/' + privateFork.id, { method: 'DELETE' });
  timeline = await owner.request(api + '/settings', {
    method: 'PATCH',
    data: { visibility: 'public' },
  });
  const profile = await guest.request(profileUrl);
  assert.match(profile, /Public favorites/);
  // Profiles were at /users/<username>, and names the site's pages use are not profiles.
  const movedProfile = await guest.request('/users/' + ownerName + '?page=2', {
    status: 308,
    headers: true,
  });
  assert.equal(movedProfile.headers.get('location'), profileUrl + '?page=2');
  await guest.request('/users', { status: 404 });
  await guest.request('/' + ownerName.toUpperCase(), { status: 308 });
  assert(profile.includes(`href="${base}"`));
  for (const sort of ['stars', 'popularity', 'alphabetical', 'age', 'relevance'])
    assert((await guest.request('/?search=' + term + '&sort=' + sort)).includes(`href="${base}"`));
  const publicPage = await guest.request(base);
  assert.match(publicPage, /title="Timeline editor"/);
  // Its older address leads to its page, keeping the rest of the address.
  const moved = await guest.request(legacy + '/pulls?page=1', { status: 307, headers: true });
  assert.equal(moved.headers.get('location'), base + '/pulls?page=1');
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
  const forkApi = '/api/timelines/' + fork.id,
    forkBase = '/' + contributorName + '/' + fork.id;
  // Timeline actions are mounted into the editor frame after hydration.
  const forkPage = await contributor.request(forkBase);
  assert(forkPage.includes('/editor/frame#timeline/' + fork.id));
  assert(forkPage.includes(timeline.id));
  // While a large copy's index is still being copied, its page waits for it, its other pages
  // lead there, and the API refuses its index but shows it as preparing.
  await pool.query('UPDATE oc_timelines SET preparing_revision_id=head_revision_id WHERE id=$1', [
    fork.id,
  ]);
  // A request refused for a copy being prepared starts preparing it again (store.access), which
  // would finish and clear this mark partway through the checks (#280). Its row held locked
  // here makes that retry skip it (FOR UPDATE SKIP LOCKED) until the mark is cleared below.
  const held = await pool.connect();
  await held.query('BEGIN');
  try {
    await held.query('SELECT 1 FROM oc_timelines WHERE id=$1 FOR UPDATE', [fork.id]);
    const waiting = await contributor.request(forkBase);
    assert.match(waiting, /Preparing your copy/);
    assert(!waiting.includes('/editor/frame#timeline/' + fork.id));
    await contributor.request(forkBase + '/history', { status: 307 });
    assert.equal((await contributor.request(forkApi)).preparing, true);
    await contributor.request(forkApi + '/document', { status: 409 });
    await held.query('UPDATE oc_timelines SET preparing_revision_id=NULL WHERE id=$1', [fork.id]);
  } finally {
    // Released even when a check fails, so the pool can end.
    await held.query('COMMIT');
    held.release();
  }
  assert((await contributor.request(forkBase)).includes('/editor/frame#timeline/'));
  assert.match(await contributor.request(forkBase + '/pulls/new'), /Open pull request/);
  assert.match(await contributor.request(forkBase + '/sync'), /Sync saved fork/);
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
    await contributor.request(forkBase + '/history/' + firstCheckpoint),
    /Export this checkpoint/,
  );
  assert.equal(
    (await contributor.request(forkApi + '/history/' + firstCheckpoint)).document.title,
    merged.document.title,
  );
  // Documents and checkpoints stream (#135), and download as .ochx files.
  const streamed = await contributor.request(forkApi + '/document');
  assert.equal(streamed.timeline.id, fork.id);
  assert.equal(streamed.document.title, 'Fork title');
  const file = await contributor.request(forkApi + '/document?download=1', { headers: true });
  assert.match(file.headers.get('content-disposition'), /attachment; filename="fork-title\.ochx"/);
  assert.equal(file.value.format, 'openchronology');
  assert.deepEqual(
    file.value.events.map((e) => e.id).sort(),
    streamed.document.events.map((e) => e.id).sort(),
  );
  // The editor's export of a large timeline, named by its address; signed in only.
  const named = await contributor.request(forkApi + '/export/fork-title.ochx', { headers: true });
  assert.match(named.headers.get('content-disposition'), /filename="fork-title\.ochx"/);
  assert.deepEqual(
    named.value.events.map((e) => e.id).sort(),
    streamed.document.events.map((e) => e.id).sort(),
  );
  await guest.request(forkApi + '/export/fork-title.ochx', { status: 401 });
  const checkpoint = await contributor.request(
    forkApi + '/history/' + firstCheckpoint + '?download=1',
    { headers: true },
  );
  assert.match(checkpoint.headers.get('content-disposition'), /\.ochx"/);
  assert.equal(checkpoint.value.title, merged.document.title);
  assert.match(
    await contributor.request(forkBase + '/history/' + firstCheckpoint),
    /href="\/api\/timelines\/[0-9a-f-]+\/history\/[0-9a-f-]+\?download=1"/,
  );
  await guest.request(forkApi + '/document?download=1', { status: 404 });
  await guest.request(forkApi + '/history', { status: 404 });
  await guest.request(api + '/history/' + saved.head_revision_id, { status: 404 });
  await owner.request(api + '/proposals/' + forkPull.id + '/resolve', {
    method: 'POST',
    data: { action: 'merge', revision: forkPull.revision },
  });
  // Its owner can stop keeping its saved history (#136): its settings say what that frees,
  // its past checkpoints are listed but say they are not kept, and it proposes nothing.
  assert.match(
    await contributor.request(forkBase + '/settings'),
    /Saved history[\s\S]*Stop keeping saved history[\s\S]*freeing about/,
  );
  await contributor.request(forkApi + '/settings', {
    method: 'PATCH',
    status: 400,
    data: { keepHistory: 'no' },
  });
  const quiet = await contributor.request(forkApi + '/settings', {
    method: 'PATCH',
    data: { keepHistory: false },
  });
  assert.equal(quiet.keep_history, false);
  assert.equal(quiet.history_bytes, 0);
  assert.match(await contributor.request(forkBase + '/settings'), /Keep saved history from now on/);
  assert.match(
    await contributor.request(forkBase + '/history'),
    /doesn.{1,8}t keep saved history[\s\S]*not kept/,
  );
  await contributor.request(forkApi + '/history/' + firstCheckpoint, { status: 409 });
  assert.match(
    await contributor.request(forkBase + '/history/' + firstCheckpoint),
    /Revision not kept/,
  );
  assert.match(
    await contributor.request(forkBase + '/pulls/new'),
    /does not keep saved history, so it cannot propose/,
  );
  const kept = await contributor.request(forkApi + '/settings', {
    method: 'PATCH',
    data: { keepHistory: true },
  });
  assert.equal(kept.keep_history, true);
  assert.equal((await contributor.request(forkApi + '/history')).revisions[0].kind, 'baseline');
  // A slug of its own (#148): /<owner>/<slug>, which its other addresses lead to. Setting it
  // leaves the timeline's revision as it is.
  const revision = (await owner.request(api)).revision;
  for (const slug of ['Not a slug!', '-dash', 'a'.repeat(65), randomUUID()])
    await owner.request(api + '/settings', { method: 'PATCH', status: 400, data: { slug } });
  timeline = await owner.request(api + '/settings', { method: 'PATCH', data: { slug: term } });
  assert.equal(timeline.slug, term);
  assert.equal(timeline.revision, revision);
  const address = '/' + ownerName + '/' + term;
  assert.match(await guest.request(address), /title="Timeline editor"/);
  for (const [from, to] of [
    [base, address],
    [legacy + '/history', address + '/history'],
    ['/' + ownerName.toUpperCase() + '/' + term.toUpperCase(), address],
  ])
    assert.equal(
      (await guest.request(from, { status: 307, headers: true })).headers.get('location'),
      to,
    );
  assert((await guest.request(profileUrl)).includes(`href="${address}"`));
  const settings = await owner.request(address + '/settings');
  assert(settings.includes('name="slug"') && settings.includes(`value="${term}"`));
  const momentId = merged.document.events[0].id;
  assert.match(
    await guest.request(address + '/moments/' + encodeURIComponent(momentId)),
    new RegExp(`rel="canonical" href="${origin}${address}/moments/`),
  );
  const embedded = await guest.request(
    '/api/oembed?url=' + encodeURIComponent(origin + address + '/moments/' + momentId),
  );
  assert.equal(embedded.author_url, origin + profileUrl);
  assert(embedded.html.includes('/embed/' + timeline.id));
  // The sitemap index names its pages (#287); one of them lists the address.
  const sitemapPages = [
    ...(await guest.request('/sitemap.xml')).matchAll(/<sitemap><loc>([^<]*)<\/loc>/g),
  ].map((m) => m[1].slice(origin.length));
  let listed = false;
  for (const page of sitemapPages)
    if ((await guest.request(page)).includes(`<loc>${origin}${address}</loc>`)) listed = true;
  assert(listed, 'The sitemap lists its address.');
  // Another slug: the old one still leads to it, until another of its owner's timelines
  // takes it; a slug its owner already uses is refused.
  timeline = await owner.request(api + '/settings', {
    method: 'PATCH',
    data: { slug: term + '-readdress' },
  });
  assert.equal(
    (await guest.request(address, { status: 307, headers: true })).headers.get('location'),
    address + '-readdress',
  );
  const other = '/api/timelines/' + compiled.id + '/settings';
  const taken = await owner.request(other, {
    method: 'PATCH',
    status: 409,
    data: { slug: term + '-readdress' },
  });
  assert.equal(taken.error, `Another timeline of @${ownerName} is at ${address}-readdress.`);
  await owner.request(other, { method: 'PATCH', data: { slug: term } });
  assert.match(await owner.request(address), /title="Timeline editor"/);
  assert(!(await owner.request(address)).includes('/editor/frame#timeline/' + timeline.id));
  await guest.request(address, { status: 404 });
  // Without a slug, it is at its ID again.
  timeline = await owner.request(api + '/settings', { method: 'PATCH', data: { slug: null } });
  assert.equal(timeline.slug, null);
  assert.match(await guest.request(base), /title="Timeline editor"/);
  await guest.request('/' + ownerName + '/no-such-slug', { status: 404 });
  await owner.request('/api/auth/logout', { method: 'POST', data: {} });
  assert.doesNotMatch(await owner.request('/'), /id="dashboard-mine"/);
  console.log(
    'PASS Next.js/PostgreSQL accounts, private SSR access, public full-text search, stars, private favorites, public profiles, sorting, sharing, proposal discussion, writer-only merge, optional saved history and addresses.',
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
