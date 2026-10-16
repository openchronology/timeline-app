// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Sharing a timeline and what is in it (issues 60, 61, 95 and 97): page metadata and link
// previews, preview images, entity pages, links into a timeline, embeds, oEmbed, robots and
// the sitemap; private timelines show none of it.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import pg from 'pg';
import { chromium } from 'playwright';
import { passwordHash } from '../server/auth.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
const port = Number(process.env.PLATFORM_TEST_PORT ?? 5198),
  origin = `http://127.0.0.1:${port}`;
const env = {
  ...process.env,
  NODE_ENV: 'production',
  APP_ORIGIN: origin,
  OCH_APP_ROOT: process.cwd(),
  TRUST_PROXY: '1',
  NEXT_TELEMETRY_DISABLED: '1',
  PORT: String(port),
  HOSTNAME: '127.0.0.1',
};
for (const key of Object.keys(env))
  if (key.startsWith('OAUTH_') || ['PLUGIN_LIBRARY', 'FEATURED_TIMELINES'].includes(key))
    delete env[key];
const child = spawn(
  process.execPath,
  [resolve(process.env.PLATFORM_TEST_SERVER ?? 'platform/.next/standalone/platform/server.cjs')],
  { env, stdio: ['ignore', 'pipe', 'pipe'] },
);
let logs = '',
  exited = false;
for (const s of [child.stdout, child.stderr])
  s.on('data', (c) => (logs = (logs + c).slice(-12000)));
child.on('exit', () => (exited = true));

function client(ip) {
  const cookies = new Map();
  let csrf;
  return {
    cookies,
    async request(path, { method = 'GET', data, status = 200, raw = false } = {}) {
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
      if (raw) {
        assert.equal(res.status, status, `${method} ${path}`);
        return res;
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
/** A meta tag's content, by property or name. */
const meta = (html, key) =>
  new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`).exec(html)?.[1] ?? null;
const unescape = (text) => text.replaceAll('&amp;', '&').replaceAll('&quot;', '"');

const owner = client('192.0.2.111'),
  guest = client('192.0.2.112');
let userId, timelineId, otherTimelineId, browser, embedder;
try {
  for (let i = 0; i < 100 && !exited; i++) {
    try {
      if ((await fetch(origin + '/healthz', { signal: AbortSignal.timeout(500) })).ok) break;
    } catch {}
    await delay(200);
  }
  assert(!exited, logs);
  const suffix = Date.now().toString(36),
    username = 'sharer_' + suffix;
  await owner.request('/api/session');
  userId = randomUUID();
  await pool.query(
    'INSERT INTO oc_users(id,username,email,email_verified_at,password_hash) VALUES($1,$2,$3,now(),$4)',
    [
      userId,
      username,
      username + '@example.test',
      await passwordHash('sharing-test-password-2026'),
    ],
  );
  await owner.request('/api/auth/login', {
    method: 'POST',
    data: { username, password: 'sharing-test-password-2026' },
  });
  // Moment IDs with characters that addresses escape (`:`).
  const document = {
    format: 'openchronology',
    version: 1,
    title: 'Voyages of ' + suffix,
    description: 'Ships & the sea, from departure to return.',
    events: [
      { id: 'leg:1', time: '0/1', metadata: { title: 'Departure', description: 'Left port.' } },
      { id: 'leg:2', time: '86400/1', metadata: { title: 'Storm ' + suffix } },
      { id: 'leg:3', time: '172800/1', metadata: { title: 'Return' } },
    ],
    durations: [
      {
        id: 'crossing',
        start: { moment: 'leg:1' },
        end: { moment: 'leg:3' },
        metadata: { title: 'The crossing', description: 'Two days at sea.' },
      },
    ],
  };
  const created = await owner.request('/api/timelines', {
    method: 'POST',
    status: 201,
    data: document,
  });
  timelineId = created.id;
  // Its pages are at its owner's name and its ID (#148).
  const base = '/' + username + '/' + timelineId,
    momentPath = base + '/moments/leg%3A2',
    durationPath = base + '/durations/crossing';

  // Private: members see the page, but nothing announces or previews it.
  const privatePage = await owner.request(base);
  assert.equal(meta(privatePage, 'robots'), 'noindex, nofollow');
  assert(!privatePage.includes('application/json+oembed'));
  await guest.request(base, { status: 404 });
  await guest.request('/timelines/' + timelineId, { status: 404 });
  await guest.request(momentPath, { status: 404 });
  const privateEmbed = await guest.request('/embed/' + timelineId, { status: 404, raw: true });
  assert.match(privateEmbed.headers.get('content-security-policy'), /frame-ancestors \*/);
  await owner.request('/embed/' + timelineId, { status: 404 });
  await guest.request('/api/oembed?url=' + encodeURIComponent(origin + base), { status: 404 });
  assert(!(await guest.request('/sitemap.xml')).includes(timelineId));
  const privateImage = await guest.request(base + '/opengraph-image', { raw: true });
  assert.equal(privateImage.headers.get('content-type'), 'image/png');
  // An ID-only moment lookup, as links use.
  const looked = await owner.request(`/api/timelines/${timelineId}/query`, {
    method: 'POST',
    data: { kind: 'moment', id: 'leg:2' },
  });
  assert.equal(looked.event.metadata.title, 'Storm ' + suffix);
  assert.equal(
    (
      await owner.request(`/api/timelines/${timelineId}/query`, {
        method: 'POST',
        data: { kind: 'moment', id: 'none' },
      })
    ).event,
    null,
  );

  await owner.request(`/api/timelines/${timelineId}/settings`, {
    method: 'PATCH',
    data: { visibility: 'public' },
  });

  // The timeline's page: title, description, canonical address, link previews and oEmbed.
  const page = await guest.request(base);
  assert.match(page, new RegExp(`<title>Voyages of ${suffix} · OpenChronology</title>`));
  assert.equal(meta(page, 'og:title'), 'Voyages of ' + suffix);
  assert.equal(
    unescape(meta(page, 'og:description')),
    'Ships & the sea, from departure to return.',
  );
  assert.equal(meta(page, 'og:url'), origin + base);
  assert.equal(meta(page, 'og:site_name'), 'OpenChronology');
  assert.equal(meta(page, 'twitter:card'), 'summary_large_image');
  assert.equal(meta(page, 'robots'), null);
  assert(page.includes(`<link rel="canonical" href="${origin + base}"/>`));
  const image = meta(page, 'og:image');
  // Next names preview images by the route they are in, at the timeline's ID.
  assert(image.startsWith(`${origin}/timelines/${timelineId}/opengraph-image`), image);
  assert.equal(meta(page, 'og:image:width'), '1200');
  assert.match(page, /type="application\/json\+oembed"/);
  // Its moments, in text and linked to their own pages.
  assert(page.includes(`href="${momentPath}"`));
  assert(page.includes('Storm ' + suffix));

  const png = Buffer.from(
    await (await guest.request(image.slice(origin.length), { raw: true })).arrayBuffer(),
  );
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1200, 630]);

  // A moment's and a duration's own pages open the timeline at them.
  const moment = await guest.request(momentPath);
  assert.equal(meta(moment, 'og:title'), `Storm ${suffix} · Voyages of ${suffix}`);
  assert.equal(meta(moment, 'og:url'), origin + momentPath);
  assert(
    meta(moment, 'og:image').startsWith(
      `${origin}/timelines/${timelineId}/moments/leg%3A2/opengraph-image`,
    ),
  );
  assert(moment.includes(`#timeline/${timelineId}/moment/leg%3A2`));
  const momentImage = await guest.request(meta(moment, 'og:image').slice(origin.length), {
    raw: true,
  });
  assert.equal(momentImage.headers.get('content-type'), 'image/png');
  await guest.request(base + '/moments/absent', { status: 404 });
  await guest.request(base + '/moments/%3Cscript%3E', { status: 404 });
  const duration = await guest.request(durationPath);
  assert.equal(meta(duration, 'og:title'), `The crossing · Voyages of ${suffix}`);
  assert(duration.includes(`#timeline/${timelineId}/duration/crossing`));
  await guest.request(base + '/durations/absent', { status: 404 });

  // Embeds: any site may frame a public timeline; it names its canonical page.
  const embed = await guest.request('/embed/' + timelineId, { raw: true });
  assert.match(embed.headers.get('content-security-policy'), /frame-ancestors \*/);
  const embedHtml = await embed.text();
  assert(embedHtml.includes(`<link rel="canonical" href="${origin + base}"`));
  assert(embedHtml.includes(`<title>Voyages of ${suffix} · OpenChronology</title>`));
  const frame = await guest.request('/editor/frame', { raw: true });
  assert.match(frame.headers.get('content-security-policy'), /frame-ancestors 'self'/);

  // oEmbed for the timeline, a moment page and a link fragment.
  const oembed = (url, extra = '', status = 200) =>
    guest.request(`/api/oembed?url=${encodeURIComponent(url)}${extra}`, { status });
  const answer = await oembed(origin + base);
  assert.equal(answer.type, 'rich');
  assert.equal(answer.title, 'Voyages of ' + suffix);
  assert.equal(answer.author_name, username);
  assert(answer.html.includes(`src="${origin}/embed/${timelineId}"`));
  assert.equal(answer.width, 800);
  assert(answer.html.includes(`src="${origin}/embed/${timelineId}#moment/leg%3A2"`) === false);
  assert(
    (await oembed(origin + momentPath)).html.includes(
      `src="${origin}/embed/${timelineId}#moment/leg%3A2"`,
    ),
  );
  assert(
    (await oembed(origin + base + '#search/storm')).html.includes(
      `/embed/${timelineId}#search/storm`,
    ),
  );
  const narrow = await oembed(origin + base, '&maxwidth=400');
  assert.deepEqual([narrow.width, narrow.height], [400, 240]);
  await oembed(origin + base, '&format=xml', 501);
  await oembed('https://example.com' + base, '', 404);
  await oembed(origin + '/' + username, '', 404);
  assert.equal((await oembed(origin + '/timelines/' + timelineId)).title, answer.title);

  // Search engines: what to crawl, and where the public timelines are.
  const robots = await guest.request('/robots.txt');
  assert.match(robots, /Disallow: \/api\//);
  assert.match(robots, /Allow: \/api\/oembed/);
  assert(robots.includes(`Sitemap: ${origin}/sitemap.xml`));
  const sitemap = await guest.request('/sitemap.xml');
  assert(sitemap.includes(`<loc>${origin + base}</loc>`));
  assert(sitemap.includes(`<loc>${origin}/${username}</loc>`));
  const profile = await guest.request('/' + username);
  assert.equal(meta(profile, 'og:title'), '@' + username);

  // In a browser: links open what they name, the address follows what is open, and the
  // share dialog offers links, social sites and embed code.
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const tab = await context.newPage();
  const editor = () => tab.frameLocator('iframe.editor-frame');
  await tab.goto(origin + base + '#moment/leg%3A2');
  await editor().locator('#inspector').waitFor({ state: 'visible' });
  assert.equal(await editor().locator('#event-title').inputValue(), 'Storm ' + suffix);
  assert(await editor().locator('#event-title').isDisabled());
  await editor().locator('#close-inspector').click();
  await tab.waitForFunction((path) => location.hash === '' && location.pathname === path, base);
  // Opening a moment puts it in the address.
  await tab.goto(origin + momentPath);
  await editor().locator('#inspector').waitFor({ state: 'visible' });
  assert.equal(await editor().locator('#event-title').inputValue(), 'Storm ' + suffix);
  await tab.waitForFunction(
    (path) => location.pathname + location.hash === path,
    base + '#moment/leg%3A2',
  );
  // Its share button offers the moment's own page.
  await editor().locator('#moment-share').click();
  const dialog = tab.locator('.share-dialog');
  await dialog.waitFor({ state: 'visible' });
  assert.equal(
    await dialog.getByRole('textbox', { name: 'Link' }).inputValue(),
    origin + momentPath,
  );
  assert.equal(
    await dialog.getByRole('link', { name: 'Facebook' }).getAttribute('href'),
    'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(origin + momentPath),
  );
  await dialog.getByText('Embed on a website').click();
  assert(
    (await dialog.getByRole('textbox', { name: 'HTML' }).inputValue()).includes(
      `src="${origin}/embed/${timelineId}#moment/leg%3A2"`,
    ),
  );
  await dialog.getByRole('button', { name: 'Close' }).click();
  await dialog.waitFor({ state: 'hidden' });
  // A duration link, which guests open as the server keeps it.
  await tab.goto(origin + base + '#duration/crossing');
  await editor().locator('#duration-dialog').waitFor({ state: 'visible' });
  assert.equal(await editor().locator('#duration-title').inputValue(), 'The crossing');
  // A search link, and sharing its results.
  await tab.goto(origin + base + '#search/storm');
  await editor().locator('#search-dialog').waitFor({ state: 'visible' });
  await editor()
    .locator('#search-results')
    .getByRole('button', { name: new RegExp('Storm ' + suffix) })
    .waitFor();
  assert.equal(await editor().locator('#search-text').inputValue(), 'storm');
  await editor().locator('#search-share').click();
  await dialog.waitFor({ state: 'visible' });
  assert.equal(
    await dialog.getByRole('textbox', { name: 'Link' }).inputValue(),
    origin + base + '#search/storm',
  );
  await dialog.getByRole('button', { name: 'Close' }).click();
  // The timeline's own Share button.
  await tab.goto(origin + base);
  await editor().getByRole('button', { name: 'Share', exact: true }).click();
  await dialog.waitFor({ state: 'visible' });
  assert.equal(await dialog.getByRole('textbox', { name: 'Link' }).inputValue(), origin + base);

  // An embed on another site, for a signed-in owner too: read-only, anonymous, at the moment.
  const signedIn = await browser.newContext();
  await signedIn.addCookies(
    [...owner.cookies].map(([name, value]) => ({ name, value, url: origin })),
  );
  const host = await signedIn.newPage();
  const requests = [];
  host.on('request', (request) => {
    if (request.url().startsWith(origin + '/api/')) requests.push(request);
  });
  // A page of another site, served from another local address: frame-ancestors * admits
  // http and https pages (not about:blank), and browsers keep public pages from framing
  // local addresses.
  embedder = createServer((request, response) => {
    response.setHeader('Content-Type', 'text/html');
    response.end(
      `<iframe src="${origin}/embed/${timelineId}#moment/leg%3A2" width="900" height="600"></iframe>`,
    );
  });
  await new Promise((done) => embedder.listen(0, 'localhost', done));
  await host.goto(`http://localhost:${embedder.address().port}/`);
  const embedded = host.frameLocator('iframe');
  await embedded.locator('#inspector').waitFor({ state: 'visible' });
  assert.equal(await embedded.locator('#event-title').inputValue(), 'Storm ' + suffix);
  assert(await embedded.locator('#event-title').isDisabled());
  assert(!(await embedded.locator('#add-button').isVisible()));
  assert(!(await embedded.locator('#moment-share').isVisible()));
  assert.equal(await embedded.locator('#embed-open').getAttribute('href'), momentPath);
  assert(!requests.some((r) => r.url().endsWith('/api/session')));
  for (const request of requests) assert.equal(await request.headerValue('cookie'), null);

  // Its owner gives it an address of its own in its settings (#148), which suggest one from
  // its title: the settings page moves there, and its page is there.
  const taken = await owner.request('/api/timelines', {
    method: 'POST',
    status: 201,
    data: { ...document, title: 'Taken' },
  });
  otherTimelineId = taken.id;
  await owner.request(`/api/timelines/${taken.id}/settings`, {
    method: 'PATCH',
    data: { slug: 'taken-' + suffix },
  });
  const settings = await signedIn.newPage();
  await settings.goto(origin + base + '/settings');
  const address = settings.getByRole('textbox', { name: 'Address' });
  assert.equal(await address.inputValue(), 'voyages-of-' + suffix);
  // A slug another of its owner's timelines has is refused beside the field.
  await address.fill('taken-' + suffix);
  await settings.getByRole('button', { name: 'Save address' }).click();
  await settings
    .locator('.address-form [role=alert]')
    .getByText(`Another timeline of @${username} is at /${username}/taken-${suffix}.`)
    .waitFor();
  await address.fill('voyages-' + suffix);
  await settings.getByRole('button', { name: 'Save address' }).click();
  const named = `/${username}/voyages-${suffix}`;
  await settings.waitForURL(origin + named + '/settings');
  await settings.getByRole('link', { name: origin + named, exact: true }).waitFor();
  await settings.goto(origin + momentPath);
  await settings.waitForURL(origin + named + '/moments/leg%3A2');
  await settings.frameLocator('iframe.editor-frame').locator('#inspector').waitFor();
  await settings.close();
  await signedIn.close();
  await context.close();
  console.log(
    'PASS sharing: addresses, page metadata and previews, preview images, moment and duration pages, links, the share dialog, embeds, oEmbed, robots and sitemap; private timelines show none.',
  );
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  await browser?.close();
  embedder?.close();
  child.kill();
  for (const id of [timelineId, otherTimelineId])
    if (id) await pool.query('DELETE FROM oc_timelines WHERE id=$1', [id]);
  if (userId) await pool.query('DELETE FROM oc_users WHERE id=$1', [userId]);
  await pool.end();
}
