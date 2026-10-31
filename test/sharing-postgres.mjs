// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Sharing a timeline and what is in it (issues 60, 61, 95, 97, 335 and 339): page metadata
// and link previews, preview images, a timeline's own image, entity pages and their
// structured data, links into a timeline, embeds, oEmbed, robots and the sitemap; private
// timelines show none of it.
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
import { DATING_CONTEXT, MOMENT_SOURCES } from '../dist/core.mjs';
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
  // One timeline or profile to a sitemap page, so the sitemap's paging is exercised.
  SITEMAP_PAGE_SIZE: '1',
  // At most four moments and durations of a timeline in the entity sitemap (#335).
  SITEMAP_TIMELINE_ENTITIES: '4',
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
/** A 2 × 1 PNG, standing in for a timeline's image hosted elsewhere. */
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAD0lEQVR4nGPQCHc6kWINAAcNAilk1XzNAAAAAElFTkSuQmCC',
  'base64',
);
/** A screenshot of `page` as `name`.png, when SCREENSHOT_DIR names where to keep them. */
const shot = (page, name) =>
  process.env.SCREENSHOT_DIR
    ? page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/${name}.png`, fullPage: true })
    : null;
/** A page's schema.org JSON-LD, parsed; null when it has none. */
function structuredData(html) {
  const script = /<script type="application\/ld\+json">([^<]*)<\/script>/.exec(html);
  return script ? JSON.parse(script[1]) : null;
}
/**
 * Every address the sitemap lists, read from its index and then each page it names (#287),
 * checking that no page holds more than SITEMAP_PAGE_SIZE timelines or profiles, or more
 * than one timeline's SITEMAP_TIMELINE_ENTITIES moments and durations (#335).
 */
async function sitemapAddresses(visitor) {
  const index = await visitor.request('/sitemap.xml');
  assert.match(index, /^<\?xml [^>]*>\n<sitemapindex /);
  const pages = [...index.matchAll(/<sitemap><loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
  assert.equal(pages[0], origin + '/sitemap/pages.xml');
  const addresses = [];
  for (const page of pages) {
    assert(page.startsWith(origin + '/sitemap/'), page);
    const xml = await visitor.request(page.slice(origin.length));
    const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
    const most = page.includes('/sitemap/entities-') ? 4 : 1;
    if (page !== pages[0]) assert(locs.length <= most, `${page} holds ${locs.length}`);
    addresses.push(...locs);
  }
  return addresses;
}

const owner = client('192.0.2.111'),
  guest = client('192.0.2.112');
let userId, timelineId, otherTimelineId, browser, embedder;
const extraTimelines = [];
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
    'INSERT INTO oc_users(id,username,email,email_verified_at,password_hash,terms_version) VALUES($1,$2,$3,now(),$4,oc_policy_version())',
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
  // Moment IDs with characters that addresses escape (`:`), on Gregorian dates, with tags,
  // sources, a dating note and a relationship for their pages to show (#335).
  const document = {
    format: 'openchronology',
    version: 1,
    title: 'Voyages of ' + suffix,
    description: 'Ships & the sea, from departure to return.',
    presentation: {
      version: 1,
      mode: 'gregorian',
      significantDigits: 6,
      unit: '',
      scale: '1/1',
      origin: '0/1',
      offsetMinutes: 0,
    },
    plugins: [
      { manifest: MOMENT_SOURCES, enabled: true },
      { manifest: DATING_CONTEXT, enabled: true },
    ],
    events: [
      { id: 'leg:1', time: '0/1', metadata: { title: 'Departure', description: 'Left port.' } },
      {
        id: 'leg:2',
        time: '86400/1',
        metadata: {
          title: 'Storm ' + suffix,
          tags: ['weather'],
          sources: ['https://example.com/logbook', 'javascript:alert(1)'],
          datePrecision: 'To the day',
        },
      },
      // A note that would close a script, were it not escaped (with no `>`, so it is not
      // dropped as a tag).
      {
        id: 'leg:3',
        time: '172800/1',
        metadata: { title: 'Return', description: 'In </script x' },
      },
    ],
    relationships: [{ a: { moment: 'leg:2' }, b: { duration: 'crossing' } }],
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
  assert(!(await sitemapAddresses(guest)).some((a) => a.includes(timelineId)));
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
  // Its drawn image alone, not the site's (#390).
  assert.equal(page.match(/property="og:image"/g).length, 1);
  assert.doesNotMatch(page, /social-preview/);
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
  assert.equal(meta(moment, 'robots'), null);
  assert(moment.includes(`<link rel="canonical" href="${origin + momentPath}"/>`));
  // As text (#335): its date, tags, sources (https only), dating note, what it is related
  // to, and a link into the timeline at it.
  assert.match(moment, /<time datetime="1970-01-02T00:00:00Z">/i, 'Its date, for machines.');
  assert.match(moment, /<ul aria-label="Tags"><li>weather<\/li><\/ul>/);
  assert(moment.includes('href="https://example.com/logbook"'));
  assert(!moment.includes('javascript:alert'));
  assert.match(moment, /<dt>Date precision<\/dt><dd>To the day<\/dd>/);
  assert(moment.includes(`<a href="${durationPath}">The crossing</a>`));
  assert(
    moment.includes(`<a href="${base}#moment/leg%3A2">Open Storm ${suffix} in the timeline</a>`),
  );
  // And as structured data: an event on its date, in its timeline, by its owner.
  assert.deepEqual(structuredData(moment), {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: 'Storm ' + suffix,
    url: origin + momentPath,
    startDate: '1970-01-02T00:00:00Z',
    keywords: 'weather',
    isPartOf: {
      '@type': 'CreativeWork',
      name: 'Voyages of ' + suffix,
      url: origin + base,
      author: { '@type': 'Person', name: '@' + username, url: `${origin}/${username}` },
    },
  });
  // A note can't end the script early.
  const ret = await guest.request(base + '/moments/leg%3A3');
  assert(ret.includes('"description":"In \\u003c/script x"'));
  assert.equal(structuredData(ret).description, 'In </script x');
  const momentImage = await guest.request(meta(moment, 'og:image').slice(origin.length), {
    raw: true,
  });
  assert.equal(momentImage.headers.get('content-type'), 'image/png');
  await guest.request(base + '/moments/absent', { status: 404 });
  await guest.request(base + '/moments/%3Cscript%3E', { status: 404 });
  const duration = await guest.request(durationPath);
  assert.equal(meta(duration, 'og:title'), `The crossing · Voyages of ${suffix}`);
  assert(duration.includes(`#timeline/${timelineId}/duration/crossing`));
  const during = structuredData(duration);
  assert.equal(during['@type'], 'Event');
  assert.deepEqual(
    [during.startDate, during.endDate, during.description],
    ['1970-01-01T00:00:00Z', '1970-01-03T00:00:00Z', 'Two days at sea.'],
  );
  assert(duration.includes(`<a href="${momentPath}">Storm ${suffix}</a>`));
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
  const sitemap = await sitemapAddresses(guest);
  assert(sitemap.includes(origin + base));
  assert(sitemap.includes(`${origin}/${username}`));
  assert(sitemap.includes(origin + '/privacy'));
  assert.equal(new Set(sitemap).size, sitemap.length, 'No address is listed twice.');
  // Its moments' and durations' pages too (#335).
  for (const path of [
    momentPath,
    durationPath,
    base + '/moments/leg%3A1',
    base + '/moments/leg%3A3',
  ])
    assert(sitemap.includes(origin + path), path);
  // Not those of a timeline with sensitive-content labels, whose pages are not indexed, nor
  // of one with more moments than the sitemap lists of a timeline; their own pages are.
  const publish = async (data) => {
    const { id } = await owner.request('/api/timelines', { method: 'POST', status: 201, data });
    extraTimelines.push(id);
    await owner.request(`/api/timelines/${id}/settings`, {
      method: 'PATCH',
      data: { visibility: 'public' },
    });
    return id;
  };
  const labelled = await publish({ ...document, title: 'Labelled ' + suffix });
  await owner.request(`/api/timelines/${labelled}/settings`, {
    method: 'PATCH',
    data: { labels: ['violence'] },
  });
  const large = await publish({
    format: 'openchronology',
    version: 1,
    title: 'Large ' + suffix,
    description: 'More moments than the sitemap lists of one timeline.',
    events: Array.from({ length: 5 }, (_, i) => ({ id: 'm' + i, time: `${i}/1`, metadata: {} })),
  });
  const labelledMoment = await guest.request(`/${username}/${labelled}/moments/leg%3A2`);
  assert.equal(meta(labelledMoment, 'robots'), 'noindex, nofollow');
  assert.equal(meta(labelledMoment, 'description'), 'Sensitive content: graphic violence');
  assert.equal(structuredData(labelledMoment), null);
  const crawled = await sitemapAddresses(guest);
  assert(crawled.includes(`${origin}/${username}/${labelled}`));
  assert(crawled.includes(`${origin}/${username}/${large}`));
  for (const id of [labelled, large])
    assert(!crawled.some((a) => a.startsWith(`${origin}/${username}/${id}/`)), id);
  // A page that isn't one of the sitemap's is not found.
  await guest.request('/sitemap/timelines-not-an-id.xml', { status: 404 });
  await guest.request('/sitemap/other.xml', { status: 404 });
  const profile = await guest.request('/' + username);
  assert.equal(meta(profile, 'og:title'), '@' + username);
  // A profile previews with the site's image (#390).
  assert.equal(meta(profile, 'og:image'), origin + '/social-preview.jpg');
  assert.equal(meta(profile, 'twitter:card'), 'summary_large_image');

  // In a browser: links open what they name, the address follows what is open, and the
  // share dialog offers links, social sites and embed code.
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const tab = await context.newPage();
  const editor = () => tab.frameLocator('iframe.editor-frame');
  await tab.goto(origin + base + '#moment/leg%3A2');
  // A guest reads it in the reader (#233), with nothing to edit.
  await editor().locator('#reader-panel').waitFor({ state: 'visible' });
  assert.equal(await editor().locator('#reader-title').textContent(), 'Storm ' + suffix);
  assert(!(await editor().locator('#moment-panel').isVisible()));
  await editor().locator('#reader-close').click();
  await tab.waitForFunction((path) => location.hash === '' && location.pathname === path, base);
  // Opening a moment puts it in the address.
  await tab.goto(origin + momentPath);
  await editor().locator('#reader-panel').waitFor({ state: 'visible' });
  assert.equal(await editor().locator('#reader-title').textContent(), 'Storm ' + suffix);
  await tab.waitForFunction(
    (path) => location.pathname + location.hash === path,
    base + '#moment/leg%3A2',
  );
  // Its share button offers the moment's own page.
  await editor().locator('#reader-share').click();
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
  // It takes the moment's place in the reader.
  await editor().locator('#reader-title', { hasText: 'The crossing' }).waitFor();
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
  await embedded.locator('#reader-panel').waitFor({ state: 'visible' });
  assert.equal(await embedded.locator('#reader-title').textContent(), 'Storm ' + suffix);
  assert(!(await embedded.locator('#view-mode-control').isVisible()));
  assert(!(await embedded.locator('#add-button').isVisible()));
  assert(!(await embedded.locator('#reader-share').isVisible()));
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

  // Its own image (#339), set in its settings: above its title, on its card, as its link
  // preview and oEmbed thumbnail. Hosted elsewhere; the browser is answered for that host.
  const picture = 'https://images.example.test/voyage-' + suffix + '.png';
  await signedIn.route('https://images.example.test/**', (route) =>
    route.fulfill({ contentType: 'image/png', body: PIXEL }),
  );
  const imaging = await signedIn.newPage();
  await imaging.goto(origin + named + '/settings');
  await imaging.getByRole('textbox', { name: 'Link to the image' }).fill(picture);
  await imaging.getByRole('textbox', { name: 'Alt text' }).fill('A ship under sail');
  // Its preview loads, so its size is sent with it.
  await imaging.waitForFunction(() => document.querySelector('.image-preview img')?.naturalWidth);
  await shot(imaging, 'timeline-image-settings');
  await imaging.getByRole('button', { name: 'Set image' }).click();
  await imaging.getByRole('button', { name: 'Replace image' }).waitFor();
  const pictured = { url: picture, alt: 'A ship under sail', width: 2, height: 1 };
  assert.deepEqual((await owner.request(`/api/timelines/${timelineId}`)).image, pictured);
  const previewed = await guest.request(named);
  assert.equal(meta(previewed, 'og:image'), picture);
  assert.equal(meta(previewed, 'og:image:alt'), 'A ship under sail');
  assert.equal(meta(previewed, 'og:image:width'), '2');
  assert.equal(meta(previewed, 'twitter:image'), picture);
  const thumbnail = await oembed(origin + named);
  assert.deepEqual(
    [thumbnail.thumbnail_url, thumbnail.thumbnail_width, thumbnail.thumbnail_height],
    [picture, 2, 1],
  );
  // A moment's page still previews the moment.
  assert.notEqual(meta(await guest.request(named + '/moments/leg%3A2'), 'og:image'), picture);
  // On its card, lazily, with its alt text; and above its title in the editor.
  const card = new RegExp(`<img src="${picture}" alt="A ship under sail" loading="lazy"`);
  assert.match(await guest.request('/' + username), card);
  await imaging.goto(origin + '/' + username);
  await imaging.waitForFunction(() => document.querySelector('.timeline-card-image img')?.complete);
  await shot(imaging, 'timeline-image-card');
  await imaging.goto(origin + named);
  const heading = imaging.frameLocator('iframe.editor-frame').locator('#timeline-image');
  await heading.waitFor({ state: 'visible' });
  assert.equal(await heading.getAttribute('src'), picture);
  assert.equal(await heading.getAttribute('alt'), 'A ship under sail');
  await shot(imaging, 'timeline-image-heading');
  // Labelled, it previews and lists without it (#115).
  await owner.request(`/api/timelines/${timelineId}/settings`, {
    method: 'PATCH',
    data: { labels: ['violence'] },
  });
  assert.notEqual(meta(await guest.request(named), 'og:image'), picture);
  assert.equal((await oembed(origin + named)).thumbnail_url, undefined);
  const labelledProfile = await owner.request('/' + username);
  assert.doesNotMatch(labelledProfile, card);
  assert.match(labelledProfile, /timeline-card-placeholder/);
  await owner.request(`/api/timelines/${timelineId}/settings`, {
    method: 'PATCH',
    data: { labels: [] },
  });
  // Without its size, oEmbed keeps the drawn thumbnail.
  await owner.request(`/api/timelines/${timelineId}/settings`, {
    method: 'PATCH',
    data: { image: { url: picture, alt: 'A ship under sail' } },
  });
  assert.equal(
    (await oembed(origin + named)).thumbnail_url,
    `${origin}/timelines/${timelineId}/opengraph-image`,
  );
  // Removed in its settings: the drawn preview and the placeholder again.
  await imaging.goto(origin + named + '/settings');
  await imaging.getByRole('button', { name: 'Remove image' }).click();
  await imaging.getByRole('button', { name: 'Set image' }).waitFor();
  assert.equal((await owner.request(`/api/timelines/${timelineId}`)).image, null);
  assert(meta(await guest.request(named), 'og:image').includes('/opengraph-image'));
  assert.doesNotMatch(await guest.request('/' + username), card);
  await imaging.close();

  // A timeline started in the browser is a draft, listed on the dashboard to open (#188).
  const drafting = await signedIn.newPage();
  await drafting.goto(origin + '/editor?new=1');
  const draftEditor = drafting.frameLocator('iframe.editor-frame');
  await draftEditor.locator('#timeline-title').fill('Browser draft ' + suffix);
  await draftEditor.locator('#timeline-title').press('Tab');
  await draftEditor.getByText('Saved in this browser').waitFor();
  await drafting.goto(origin + '/');
  const listed = drafting.locator('#drafts').getByRole('link', {
    name: 'Browser draft ' + suffix,
  });
  await listed.waitFor();
  assert.match(await listed.getAttribute('href'), /^\/editor\?draft=[0-9a-f-]{36}$/);
  await listed.click();
  await drafting.waitForURL(/\/editor\?draft=/);
  await drafting.waitForFunction(
    (title) =>
      document.querySelector('iframe.editor-frame').contentDocument.getElementById('timeline-title')
        ?.value === title,
    'Browser draft ' + suffix,
  );
  await drafting.close();
  await signedIn.close();
  await context.close();
  console.log(
    'PASS sharing: addresses, page metadata and previews, preview images, its own image, moment and duration pages and their structured data, links, the share dialog, embeds, oEmbed, robots and sitemap with entity pages; private and labelled timelines show none.',
  );
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  await browser?.close();
  embedder?.close();
  child.kill();
  for (const id of [timelineId, otherTimelineId, ...extraTimelines])
    if (id) await pool.query('DELETE FROM oc_timelines WHERE id=$1', [id]);
  if (userId) await pool.query('DELETE FROM oc_users WHERE id=$1', [userId]);
  await pool.end();
}
