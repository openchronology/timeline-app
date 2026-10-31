// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Unit tests of the landing page's settings and copy (#379): the switch, example timelines'
// addresses, YouTube videos and the frames they need, front matter, the built-in copy, and an
// operator's directory overriding it file by file.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AUDIENCES,
  CONTENT_FILES,
  EXAMPLE_LIMIT,
  browserPath,
  exampleAddresses,
  exampleTimelines,
  frontMatter,
  landingContent,
  landingContentDir,
  landingEnabled,
  landingFramePolicy,
  landingSettings,
  landingVideo,
  safeLink,
  youtubeId,
} from '../server/landing.mjs';
import { SiteError } from '../server/site.mjs';
import { safeReturnTo } from '../platform/lib/navigation.js';

test('LANDING_PAGE is on for 1, true or yes, and off by default', () => {
  for (const value of ['1', 'true', 'TRUE', 'yes', ' Yes '])
    assert.equal(landingEnabled({ LANDING_PAGE: value }), true, value);
  for (const value of [undefined, '', '0', 'false', 'no', 'on', '2'])
    assert.equal(landingEnabled({ LANDING_PAGE: value }), false, String(value));
  assert.equal(browserPath({}), '/');
  assert.equal(browserPath({ LANDING_PAGE: '1' }), '/explore');
});

test('example timelines are owner/slug addresses, each once, at most six', () => {
  assert.deepEqual(exampleAddresses('educators', {}), []);
  assert.deepEqual(
    exampleAddresses('educators', {
      LANDING_EXAMPLES_EDUCATORS:
        ' athan/Halloween, /athan/usmc ,athan/halloween,,not-an-address,a/b,athan/x/y,https://x.org/a/b',
    }),
    [
      { owner: 'athan', slug: 'halloween' },
      { owner: 'athan', slug: 'usmc' },
    ],
  );
  // The landing page's own setting has no suffix; an audience's has its name.
  const env = {
    LANDING_EXAMPLES: 'athan/deep-time',
    LANDING_EXAMPLES_WRITERS: 'athan/middle-earth',
  };
  assert.deepEqual(exampleAddresses('home', env), [{ owner: 'athan', slug: 'deep-time' }]);
  assert.deepEqual(exampleAddresses('writers', env), [{ owner: 'athan', slug: 'middle-earth' }]);
  assert.deepEqual(exampleAddresses('nobody', env), []);
  const many = Array.from({ length: 9 }, (_, i) => `owner/t${i}`).join(',');
  assert.equal(
    exampleAddresses('developers', { LANDING_EXAMPLES_DEVELOPERS: many }).length,
    EXAMPLE_LIMIT,
  );
});

test('a YouTube video is named by its address, and anything else is refused', () => {
  for (const url of [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s',
    'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ?si=abc',
    'https://www.youtube.com/embed/dQw4w9WgXcQ',
    'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
  ])
    assert.equal(youtubeId(url), 'dQw4w9WgXcQ', url);
  for (const url of [
    '',
    'dQw4w9WgXcQ',
    'https://vimeo.com/123',
    'https://www.youtube.com/watch?v=short',
    'https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ',
    'javascript:alert(1)',
  ])
    assert.equal(youtubeId(url), null, url);
  assert.equal(landingVideo('educators', {}), null);
  assert.deepEqual(
    landingVideo('educators', { LANDING_VIDEO_EDUCATORS: 'https://youtu.be/dQw4w9WgXcQ' }),
    {
      id: 'dQw4w9WgXcQ',
      watch: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      embed: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0',
    },
  );
  assert.ok(landingVideo('home', { LANDING_VIDEO: 'https://youtu.be/dQw4w9WgXcQ' }));
  assert.throws(
    () => landingVideo('writers', { LANDING_VIDEO_WRITERS: 'https://vimeo.com/1' }),
    (error) => error instanceof SiteError && /LANDING_VIDEO_WRITERS/.test(error.message),
  );
  assert.throws(() => landingSettings({ LANDING_VIDEO: 'nope' }), SiteError);
});

test("the player's origin is allowed in frames only where a video can play", () => {
  const video = { LANDING_PAGE: '1', LANDING_VIDEO_EDUCATORS: 'https://youtu.be/dQw4w9WgXcQ' };
  assert.equal(landingFramePolicy('/', video), ' https://www.youtube-nocookie.com');
  assert.equal(landingFramePolicy('/for/educators', video), ' https://www.youtube-nocookie.com');
  assert.equal(landingFramePolicy('/explore', video), '');
  assert.equal(landingFramePolicy('/for', video), '');
  assert.equal(landingFramePolicy('/', { LANDING_PAGE: '1' }), '');
  assert.equal(landingFramePolicy('/', { ...video, LANDING_PAGE: '' }), '');
});

test('front matter, safe links and the content directory setting', () => {
  assert.deepEqual(frontMatter('---\ntitle: "A: b"\nlabel: Writers\n---\n\nBody\n'), {
    meta: { title: 'A: b', label: 'Writers' },
    body: '\nBody\n',
  });
  assert.deepEqual(frontMatter('No front matter'), { meta: {}, body: 'No front matter' });
  assert.equal(safeLink('/explore'), '/explore');
  assert.equal(safeLink('https://example.org'), 'https://example.org');
  assert.equal(safeLink('mailto:a@example.org'), 'mailto:a@example.org');
  for (const href of ['javascript:alert(1)', '//evil.example', 'data:text/html,x'])
    assert.equal(safeLink(href), '#', href);
  assert.equal(landingContentDir({}), null);
  assert.throws(
    () => landingSettings({ LANDING_CONTENT_DIR: '/nonexistent/landing-copy' }),
    /LANDING_CONTENT_DIR/,
  );
  landingSettings({ LANDING_CONTENT_DIR: tmpdir() });
});

test('the built-in copy has every page, with what the pages show', async () => {
  const env = { OCH_APP_ROOT: process.cwd() };
  for (const name of CONTENT_FILES) {
    const { meta, html } = await landingContent(name, env);
    for (const key of ['title', 'promise', 'description']) assert.ok(meta[key], `${name}: ${key}`);
    assert.ok(meta.description.length <= 160, `${name}: a description search engines show whole`);
    // A title says what the page offers, in words people search for (#390); the heading may
    // say it in the page's own voice.
    assert.ok(meta.title.length <= 70, `${name}: a title search engines show whole`);
    assert.ok(meta.heading, `${name}: its heading`);
    if (AUDIENCES.includes(name)) {
      assert.ok(meta.label && meta.card, `${name}: its card`);
      assert.match(html, /<h2[^>]*>What you can do<\/h2>/);
      assert.match(html, /<h2[^>]*>What you can count on<\/h2>/);
    }
  }
  const home = await landingContent('home', env);
  assert.equal(home.meta.heading, 'Any span of time, on one exact line');
  assert.equal(home.meta.title, 'OpenChronology: free timeline editor for history and research');
  const educators = await landingContent('educators', env);
  assert.match(educators.html, /Accounts are for people 13 and older/);
  assert.match(educators.html, /No account needed to read/);
  await assert.rejects(landingContent('nobody', env));
});

test("an operator's directory replaces the copy file by file", async () => {
  const dir = await mkdtemp(join(tmpdir(), 'landing-'));
  try {
    await writeFile(
      join(dir, 'educators.md'),
      '---\ntitle: Our own educators page\nlabel: Teachers\n---\n\n## Hello\n\n<script>alert(1)</script> [bad](javascript:alert(1)) [good](/help)\n',
    );
    const env = { OCH_APP_ROOT: process.cwd(), LANDING_CONTENT_DIR: dir };
    const educators = await landingContent('educators', env);
    assert.equal(educators.meta.title, 'Our own educators page');
    assert.equal(educators.source, dir);
    assert.match(educators.html, /<h2 id="hello">Hello<\/h2>/);
    assert.match(educators.html, /&lt;script&gt;/);
    assert.doesNotMatch(educators.html, /<script|javascript:/);
    assert.match(educators.html, /<a href="#">bad<\/a>/);
    assert.match(educators.html, /<a href="\/help">good<\/a>/);
    // What the directory lacks comes from the built-in copy.
    const researchers = await landingContent('researchers', env);
    assert.notEqual(researchers.source, dir);
    assert.equal(researchers.meta.label, 'Researchers');
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('examples are read as guests see them, in the order named', async () => {
  const queries = [];
  const pool = {
    async query(sql, params) {
      queries.push({ sql, params });
      // The examples' query: the database leaves out private, labelled and missing ones.
      if (queries.length === 1)
        return {
          rows: [
            { id: 'b', owner: 'athan', slug: 'usmc' },
            { id: 'a', owner: 'athan', slug: 'halloween' },
          ],
        };
      return { rows: [] };
    },
  };
  const addresses = [
    { owner: 'athan', slug: 'halloween' },
    { owner: 'someone', slug: 'private' },
    { owner: 'athan', slug: 'usmc' },
  ];
  const found = await exampleTimelines(pool, addresses, [], null);
  assert.deepEqual(
    found.map((t) => t.slug),
    ['halloween', 'usmc'],
  );
  const [{ sql, params }] = queries;
  assert.match(sql, /t\.visibility='public'/);
  assert.match(sql, /cardinality\(t\.content_labels\|\|t\.moderator_labels\)=0/);
  assert.match(sql, /NOT u\.is_disabled/);
  assert.deepEqual(params.slice(0, 2), [
    ['athan', 'someone', 'athan'],
    ['halloween', 'private', 'usmc'],
  ]);
  assert.deepEqual(await exampleTimelines(null, addresses), []);
  assert.deepEqual(await exampleTimelines(pool, []), []);
});

test('signing in returns to /explore when the landing page is at /', () => {
  assert.equal(safeReturnTo(undefined), '/');
  assert.equal(safeReturnTo(undefined, '/explore'), '/explore');
  assert.equal(safeReturnTo('/explore'), '/explore');
  assert.equal(safeReturnTo('https://evil.example', '/explore'), '/explore');
});
