// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Search terms, and ranking a complete timeline’s matches (titles first) a page at a time.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TimelineIndex,
  validateDocument,
  searchTerms,
  searchIndex,
  matchRanges,
  matchSnippet,
} from '../dist/core.mjs';

const doc = () => {
  const events = [
    { id: 'late', time: '5/1', metadata: { title: 'Harbor survey', description: 'Later notes' } },
    { id: 'early', time: '1/1', metadata: { title: 'Notes', description: 'A harbor visit' } },
    {
      id: 'stack',
      time: '2/1',
      metadata: {
        title: 'Parent',
        stack: [{ id: 'c', metadata: { title: 'Nested HARBOR entry' } }],
      },
    },
    { id: 'accent', time: '7/1', metadata: { title: 'Ünterkunft am Hafen' } },
  ];
  for (let i = 0; i < 30; i++)
    events.push({
      id: 'm' + String(i).padStart(2, '0'),
      time: 10 + i + '/1',
      metadata: { title: 'Filler ' + i, description: 'routine' },
    });
  return validateDocument({
    format: 'openchronology',
    version: 1,
    title: 'Search',
    description: '',
    events,
    durations: [
      { id: 'span', start: '3/1', end: { moment: 'late' }, metadata: { title: 'Harbor works' } },
    ],
  });
};
test('search terms are lowercased words of letters and digits, deduplicated and bounded', () => {
  assert.deepEqual(searchTerms('  Harbor, harbor; SURVEY-2026! '), ['harbor', 'survey', '2026']);
  assert.deepEqual(searchTerms('Ünterkunft'), ['ünterkunft']);
  assert.deepEqual(searchTerms(' ,.; '), []);
  assert.equal(searchTerms('a b c d e f g h i j').length, 8);
  assert.equal(searchTerms('x'.repeat(100))[0].length, 64);
});
test('complete timelines rank title matches first, then earlier entities, with pages', () => {
  const index = new TimelineIndex(doc());
  const found = searchIndex(index, 'harbor');
  assert.equal(found.total, '4');
  assert.deepEqual(
    found.results.map((r) => r.id),
    ['span', 'late', 'early', 'stack'],
  );
  assert.deepEqual(found.results[0], {
    kind: 'duration',
    id: 'span',
    first: '3/1',
    last: '5/1',
    title: 'Harbor works',
    snippet: '',
  });
  assert.equal(found.results[2].snippet, 'A harbor visit');
  assert.equal(searchIndex(index, 'HARBOR survey').total, '1');
  assert.equal(searchIndex(index, 'ünterkunft').results[0].id, 'accent');
  assert.equal(searchIndex(index, 'routine').results.length, 25);
  const second = searchIndex(index, 'routine', 2);
  assert.equal(second.results.length, 5);
  assert.equal(second.total, '30');
  assert.equal(searchIndex(index, 'absent').total, '0');
  // The duration endpoint selector searches moments only.
  assert.deepEqual(
    searchIndex(index, 'harbor', 1, 25, 'moment').results.map((r) => r.id),
    ['late', 'early', 'stack'],
  );
  // Anchored durations report their current extent after a moment moves.
  index.put({ ...index.byId.get('late'), time: '9/1' });
  assert.equal(searchIndex(index, 'works').results[0].last, '9/1');
});

test('a search’s words are found where they begin words, to highlight them (#459)', () => {
  const text = 'Romulus founded Rome; the ROMANS, not aromatic Romé.';
  const marked = (t, words) => matchRanges(t, searchTerms(words)).map(([a, b]) => t.slice(a, b));
  assert.deepEqual(marked(text, 'rom'), ['Romulus', 'Rome', 'ROMANS', 'Romé']);
  assert.deepEqual(marked(text, 'founded romé'), ['founded', 'Romé']);
  assert.deepEqual(marked(text, ''), []);
  // A snippet starts at the notes' start when the match is near it, otherwise just before it.
  const long = 'Lorem ipsum dolor sit amet. '.repeat(20) + 'The harbour was built.';
  assert.equal(matchSnippet('Near the harbour.', ['harbour']), 'Near the harbour.');
  const around = matchSnippet(long, ['harbour']);
  assert(around.startsWith('…') && around.includes('The harbour was built.'), around);
  assert(around.length <= 240);
  assert.equal(matchSnippet(long, ['absent']), long.slice(0, 239) + '…');
  const middle = matchSnippet(long + ' More.'.repeat(80), ['harbour']);
  assert(middle.startsWith('…') && middle.endsWith('…') && middle.length === 240, middle);
});
