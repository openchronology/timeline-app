// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// What a moment's or duration's page tells search engines (#335): its ISO dates, schema.org
// structured data, metadata, facts and text (platform/lib/sharing.js and
// platform/components/entity-summary.jsx), for public, private and labelled timelines.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DATING_CONTEXT, MOMENT_SOURCES } from '../dist/core.mjs';

process.env.APP_ORIGIN = 'https://chronology.example';

/**
 * The sharing helpers and the entity's summary, bundled as Next.js would compile them, with
 * `server-only` (which only refuses to be bundled for a browser) left empty.
 */
async function load() {
  const cache = new URL('../node_modules/.cache', import.meta.url).pathname;
  await mkdir(cache, { recursive: true });
  const dir = await mkdtemp(join(cache, 'entity-pages-'));
  const entry = join(dir, 'entry.mjs'),
    file = join(dir, 'bundle.mjs');
  const root = new URL('..', import.meta.url).pathname;
  await writeFile(
    entry,
    `export * from ${JSON.stringify(root + 'platform/lib/sharing.js')};
    export { default as EntitySummary } from ${JSON.stringify(root + 'platform/components/entity-summary.jsx')};`,
  );
  await build({
    entryPoints: [entry],
    outfile: file,
    bundle: true,
    format: 'esm',
    platform: 'node',
    jsx: 'automatic',
    external: ['react', 'react-dom'],
    logLevel: 'silent',
    plugins: [
      {
        name: 'server-only',
        setup(b) {
          b.onResolve({ filter: /^server-only$/ }, () => ({ path: 'server-only', namespace: 'x' }));
          b.onLoad({ filter: /.*/, namespace: 'x' }, () => ({ contents: '' }));
        },
      },
    ],
  });
  try {
    return await import(pathToFileURL(file).href);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
const sharing = await load();
const gregorian = (offsetMinutes = 0) => ({
  version: 1,
  mode: 'gregorian',
  significantDigits: 6,
  unit: '',
  scale: '1/1',
  origin: '0/1',
  offsetMinutes,
});
const timeline = (extra = {}) => ({
  id: '00000000-0000-4000-8000-000000000001',
  owner: 'ada',
  slug: 'voyages',
  title: 'Voyages',
  visibility: 'public',
  labels: [],
  presentation: gregorian(),
  plugins: [
    { manifest: MOMENT_SOURCES, enabled: true },
    { manifest: DATING_CONTEXT, enabled: false },
  ],
  ...extra,
});

test('Times are ISO 8601 only on Gregorian timelines, at the precision they show (#468)', () => {
  // A day, a month or a year, as the timeline writes the time alone; a time of day in full.
  const at = (text) => {
    const days = Date.parse(text) / 1000;
    return `${days}/1`;
  };
  assert.equal(sharing.isoTime(timeline(), '86400/1'), '1970-01-02');
  assert.equal(sharing.isoTime(timeline(), at('1975-03-01T00:00:00Z')), '1975-03');
  assert.equal(sharing.isoTime(timeline(), at('1975-01-01T00:00:00Z')), '1975');
  assert.equal(sharing.isoTime(timeline(), at('1861-03-04T12:00:00Z')), '1861-03-04T12:00:00Z');
  assert.equal(sharing.isoTime(timeline(), '1/2'), '1970-01-01T00:00:00.5Z');
  assert.equal(
    sharing.isoTime(timeline({ presentation: gregorian(-300) }), '0/1'),
    '1969-12-31T19:00:00-05:00',
  );
  // Years before 1 counted as ISO 8601 does: 539 BCE is -0538, 1 BCE 0000.
  assert.equal(sharing.isoTime(timeline(), at('-000538-01-01T00:00:00Z')), '-0538');
  assert.equal(sharing.isoTime(timeline(), at('0000-01-01T00:00:00Z')), '0000');
  // HTML's datetime takes neither.
  assert.equal(sharing.htmlTime(timeline(), at('-000538-01-01T00:00:00Z')), null);
  assert.equal(sharing.htmlTime(timeline(), at('1975-03-01T00:00:00Z')), '1975-03');
  // Past ISO's four-digit years, an endless fraction, another display, none, or an
  // unreadable time.
  assert.equal(sharing.isoTime(timeline(), '-1000000000000/1'), null);
  assert.equal(sharing.isoTime(timeline(), '1/3'), null);
  assert.equal(
    sharing.isoTime(timeline({ presentation: { ...gregorian(), mode: 'rational' } }), '0/1'),
    null,
  );
  assert.equal(sharing.isoTime(timeline({ presentation: null }), '0/1'), null);
  assert.equal(sharing.isoTime(timeline(), 'soon'), null);
  // Shown alone, at its own precision, not as a full timestamp (#466).
  assert.equal(sharing.presentTime(timeline(), at('-000538-01-01T00:00:00Z')), '539 BCE');
  assert.equal(sharing.presentTime(timeline(), at('1975-01-01T00:00:00Z')), '1975 CE');
});

test('Structured data: a CreativeWork covering its time, in ISO 8601 on Gregorian timelines', () => {
  const moment = {
    kind: 'moment',
    id: 'leg:2',
    title: 'Storm',
    notes: '<b>Rough</b> **seas**',
    first: '86400/1',
    last: '86400/1',
    tags: ['weather', 'sea'],
  };
  assert.deepEqual(sharing.entityStructuredData(timeline(), moment), {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    name: 'Storm',
    url: 'https://chronology.example/ada/voyages/moments/leg%3A2',
    description: 'Rough seas',
    temporalCoverage: '1970-01-02',
    keywords: 'weather, sea',
    isPartOf: {
      '@type': 'CreativeWork',
      name: 'Voyages',
      url: 'https://chronology.example/ada/voyages',
      author: { '@type': 'Person', name: '@ada', url: 'https://chronology.example/ada' },
    },
  });
  const duration = sharing.entityStructuredData(timeline(), {
    kind: 'duration',
    id: 'crossing',
    title: 'Crossing',
    first: '0/1',
    last: '172800/1',
  });
  assert.deepEqual(
    [duration['@type'], duration.temporalCoverage, duration.startDate, duration.url],
    [
      'CreativeWork',
      '1970-01-01/1970-01-03',
      undefined,
      'https://chronology.example/ada/voyages/durations/crossing',
    ],
  );
  // Another display, such as a fictional calendar's years: no temporalCoverage, which
  // schema.org reads only as ISO 8601.
  const ages = sharing.entityStructuredData(timeline({ presentation: null }), moment);
  assert.equal(ages['@type'], 'CreativeWork');
  assert.equal('temporalCoverage' in ages, false);
  assert.equal(ages.startDate, undefined);
  // Nothing for a private timeline, or one with sensitive-content labels.
  assert.equal(sharing.entityStructuredData(timeline({ visibility: 'private' }), moment), null);
  assert.equal(sharing.entityStructuredData(timeline({ labels: ['violence'] }), moment), null);
  // No note can close its script.
  assert.equal(
    sharing.jsonLd({ name: '</script><script>alert(1)</script>' }),
    '{"name":"\\u003c/script>\\u003cscript>alert(1)\\u003c/script>"}',
  );
});

test('Titles fit search results: shorter forms in turn, link previews whole (#469)', () => {
  const site = sharing.siteName();
  const fit = (...parts) => sharing.fitTitle(parts);
  // Short enough: all of it.
  assert.equal(fit('Storm', 'Voyages'), `Storm · Voyages · ${site}`);
  // The timeline by its head, before its subtitle.
  assert.equal(
    fit('Beedle the Bard’s tales', 'Harry Potter: an unofficial chronology of the wizarding world'),
    `Beedle the Bard’s tales · Harry Potter · ${site}`,
  );
  // Without the site's name.
  assert.equal(
    fit('Founding of the Republic', 'Ancient Rome and its neighbours'),
    'Founding of the Republic · Ancient Rome and its neighbours',
  );
  // The timeline cut between words, to the room left.
  const cut = fit(
    'Dennis and Misunas present data-flow',
    'Evolution of computer architecture · CPUs, parallel systems and alternative machines',
  );
  assert.equal(cut, 'Dennis and Misunas present data-flow · Evolution of…');
  // The event alone, cut between words.
  const alone = fit(
    'Dennis and Misunas present a basic data-flow processor architecture',
    'Evolution of computer architecture',
  );
  assert.equal(alone, 'Dennis and Misunas present a basic data-flow processor…');
  for (const title of [cut, alone]) assert(title.length <= sharing.TITLE_LENGTH, title);
  // A short head names nothing alone: the whole title.
  assert.equal(sharing.titleHead('Rome: the city'), 'Rome: the city');
  // A timeline's own page: without the site's name, then cut.
  assert.equal(
    fit('JavaScript and TypeScript · origins, standards, runtimes and security'),
    'JavaScript and TypeScript · origins, standards, runtimes…',
  );
  // Link previews keep the whole form; the page's title fits.
  const long = sharing.entityMetadata(
    timeline({ title: 'Evolution of computer architecture · CPUs and alternative machines' }),
    { kind: 'moment', id: 'dataflow' },
    'Dennis and Misunas present a basic data-flow processor architecture',
    '1975 CE',
  );
  assert.equal(long.title, 'Dennis and Misunas present a basic data-flow processor…');
  assert.equal(
    long.openGraph.title,
    'Dennis and Misunas present a basic data-flow processor architecture · Evolution of computer architecture · CPUs and alternative machines',
  );
  assert.equal(long.twitter.title, long.openGraph.title);
});

test('Explore and profiles say what is there, and how much (#471)', async () => {
  assert.deepEqual([0, 1, 65, 999, 1000, 9533, 123456].map(sharing.roughCount), [
    '0',
    '1',
    '65',
    '999',
    '1,000+',
    '9,500+',
    '120,000+',
  ]);
  // A stand-in database answering each description's query.
  const pool = (row) => ({ query: async () => ({ rows: [row] }) });
  assert.equal(
    await sharing.exploreDescription(pool({ timelines: '65', moments: '9533' })),
    'Search 65 public timelines and their 9,500+ dated events by title and notes, or browse them by tag, stars and popularity.',
  );
  assert.match(await sharing.exploreDescription(null), /^Search public timelines/);
  assert.match(
    await sharing.exploreDescription(pool({ timelines: '0', moments: '0' })),
    /^Search public/,
  );
  const site = sharing.siteName();
  assert.equal(
    await sharing.profileDescription(
      pool({
        total: '65',
        titles: ['Ancient Mesopotamia', 'Rome: the city and its empire', 'Deep time'],
      }),
      'ada',
    ),
    `@ada has 65 public timelines on ${site}, including Ancient Mesopotamia, Rome: the city and its empire, Deep time.`,
  );
  assert.equal(
    await sharing.profileDescription(pool({ total: '1', titles: null }), 'ada'),
    `@ada has 1 public timeline on ${site}.`,
  );
  assert.equal(
    await sharing.profileDescription(pool({ total: '0', titles: null }), 'ada'),
    `Public timelines and favorites of @ada on ${site}.`,
  );
  // A failed read describes it without counts.
  const broken = { query: async () => Promise.reject(new Error('down')) };
  assert.match(await sharing.profileDescription(broken, 'ada'), /^Public timelines and favorites/);
});

test('Metadata: labelled timelines describe their labels, not the notes, and are not indexed', () => {
  const entity = { kind: 'moment', id: 'leg:2' };
  const shown = sharing.entityMetadata(timeline(), entity, 'Storm', '2 Jan 1970', 'Rough seas');
  assert.equal(shown.title, 'Storm · Voyages · OpenChronology');
  assert.equal(shown.description, '2 Jan 1970. Rough seas');
  // Notes as plain text, without their Markdown, cut between words near 155 characters.
  const long = sharing.entityMetadata(
    timeline(),
    entity,
    'Storm',
    '539 BCE',
    '**Rough** seas, [logged](https://example.com) by the crew. ' +
      'Waves rose all night. '.repeat(10),
  );
  assert.match(long.description, /^539 BCE\. Rough seas, logged by the crew\. Waves/);
  assert(long.description.length <= 155, long.description.length);
  assert.match(long.description, /[a-z]…$/);
  assert.doesNotMatch(long.description, /\*|\]\(/);
  // Without notes, the time alone.
  assert.equal(
    sharing.entityMetadata(timeline(), entity, 'Storm', '539 BCE').description,
    '539 BCE',
  );
  assert.equal(
    shown.alternates.canonical,
    'https://chronology.example/ada/voyages/moments/leg%3A2',
  );
  assert.equal(shown.robots, undefined);
  const labelled = sharing.entityMetadata(
    timeline({ labels: ['violence', 'disturbing'] }),
    entity,
    'Storm',
    '2 Jan 1970',
    'Rough seas',
  );
  assert.equal(labelled.description, 'Sensitive content: graphic violence and disturbing content');
  assert.deepEqual(labelled.robots, { index: false, follow: false });
  const hidden = sharing.entityMetadata(timeline({ visibility: 'private' }), entity, 'S', 't');
  assert.deepEqual(hidden.robots, { index: false, follow: false });
  // An event its timeline doesn't list for search engines (#467): not indexed, its links
  // still followed.
  const unlisted = sharing.entityMetadata(timeline(), entity, 'S', 't', '', { listed: false });
  assert.deepEqual(unlisted.robots, { index: false, follow: true });
});

test('Its page as text: tags, notes, enabled plugins’ fields, https sources, related, a link in', () => {
  const html = renderToStaticMarkup(
    createElement(sharing.EntitySummary, {
      timeline: timeline(),
      kind: 'moment',
      id: 'leg:2',
      title: 'Storm',
      first: '86400/1',
      metadata: {
        description: 'Rough seas',
        tags: ['weather'],
        sources: ['https://example.com/log', 'http://example.com/plain', 'javascript:alert(1)'],
        // The dating plugin is off, so its field is not shown.
        datePrecision: 'To the day',
      },
      related: [{ kind: 'duration', id: 'crossing', first: '0/1', last: '1/1', title: '' }],
    }),
  );
  // The day it falls on, as the timeline writes it alone (#466, #468).
  assert.match(html, /<time datetime="1970-01-02">1970-01-02 CE<\/time>/i);
  assert(html.includes('<ul aria-label="Tags"><li>weather</li></ul>'));
  assert(html.includes('<p>Rough seas</p>'));
  assert(html.includes('<h3>Sources</h3>'));
  assert(html.includes('href="https://example.com/log" rel="ugc nofollow noopener noreferrer"'));
  assert(!html.includes('http://example.com/plain'));
  assert(!html.includes('javascript:'));
  assert(!html.includes('To the day'));
  assert(html.includes('<a href="/ada/voyages/durations/crossing">Untitled duration</a>'));
  assert(html.includes('<a href="/ada/voyages#moment/leg%3A2">Open Storm in the timeline</a>'));
  const facts = sharing.entityFacts(
    timeline({ plugins: [{ manifest: DATING_CONTEXT, enabled: true }] }),
    { datePrecision: ' To the day ', coordinateConvention: '' },
  );
  assert.deepEqual(facts, {
    tags: [],
    details: [{ label: 'Date precision', text: 'To the day' }],
    links: [],
  });
});
