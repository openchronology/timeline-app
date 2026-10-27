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

test('Times are ISO 8601 only on Gregorian timelines, in years schema.org allows', () => {
  assert.equal(sharing.isoTime(timeline(), '86400/1'), '1970-01-02T00:00:00Z');
  assert.equal(sharing.isoTime(timeline(), '1/2'), '1970-01-01T00:00:00.5Z');
  assert.equal(
    sharing.isoTime(timeline({ presentation: gregorian(-300) }), '0/1'),
    '1969-12-31T19:00:00-05:00',
  );
  // Before year 0, an endless fraction, another display, none, or an unreadable time.
  assert.equal(sharing.isoTime(timeline(), '-70000000000/1'), null);
  assert.equal(sharing.isoTime(timeline(), '1/3'), null);
  assert.equal(
    sharing.isoTime(timeline({ presentation: { ...gregorian(), mode: 'rational' } }), '0/1'),
    null,
  );
  assert.equal(sharing.isoTime(timeline({ presentation: null }), '0/1'), null);
  assert.equal(sharing.isoTime(timeline(), 'soon'), null);
});

test('Structured data: an Event on Gregorian timelines, otherwise a CreativeWork', () => {
  const moment = {
    kind: 'moment',
    id: 'leg:2',
    title: 'Storm',
    notes: '<b>Rough</b> seas',
    first: '86400/1',
    last: '86400/1',
    tags: ['weather', 'sea'],
  };
  assert.deepEqual(sharing.entityStructuredData(timeline(), moment), {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: 'Storm',
    url: 'https://chronology.example/ada/voyages/moments/leg%3A2',
    description: 'Rough seas',
    startDate: '1970-01-02T00:00:00Z',
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
    [duration['@type'], duration.startDate, duration.endDate, duration.url],
    [
      'Event',
      '1970-01-01T00:00:00Z',
      '1970-01-03T00:00:00Z',
      'https://chronology.example/ada/voyages/durations/crossing',
    ],
  );
  // Another display: the time as it shows it.
  const ages = sharing.entityStructuredData(timeline({ presentation: null }), moment);
  assert.equal(ages['@type'], 'CreativeWork');
  assert.equal(ages.temporalCoverage, '86400/1');
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

test('Metadata: labelled timelines describe their labels, not the notes, and are not indexed', () => {
  const entity = { kind: 'moment', id: 'leg:2' };
  const shown = sharing.entityMetadata(timeline(), entity, 'Storm', '2 Jan 1970', 'Rough seas');
  assert.equal(shown.title, 'Storm · Voyages · OpenChronology');
  assert.equal(shown.description, '2 Jan 1970. Rough seas');
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
  assert.match(html, /<time datetime="1970-01-02T00:00:00Z">/i);
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
