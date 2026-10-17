// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Links into a timeline: fragments naming moments, durations, searches and views, and pages of
// their own for shared moments and durations.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Q, parseLink, linkFragment, sharePath } from '../dist/core.mjs';

const id = '6f1c4e2a-9b3d-4c5e-8f70-112233445566';
test('link fragments name moments, durations, searches and views', () => {
  assert.deepEqual(parseLink('#moment/leg%3A2'), { kind: 'moment', id: 'leg:2' });
  assert.deepEqual(parseLink('moment/leg:2'), { kind: 'moment', id: 'leg:2' });
  assert.deepEqual(parseLink('#duration/crossing'), { kind: 'duration', id: 'crossing' });
  assert.deepEqual(parseLink('#search/storm%20at%20sea'), { kind: 'search', text: 'storm at sea' });
  const view = parseLink('#view/-5/2..1.5');
  assert.equal(view.kind, 'view');
  assert.equal(view.left.toString(), '-5/2');
  assert.equal(view.right.toString(), '3/2');
  for (const fragment of [
    '',
    '#',
    '#moment',
    '#moment/',
    '#moment/<script>',
    '#moment/' + 'x'.repeat(129),
    '#duration/a b',
    '#search/',
    '#search/%20',
    '#search/' + 'x'.repeat(201),
    '#search/%E0%A4%A',
    '#view/1..1',
    '#view/2..1',
    '#view/a..b',
    '#view/1',
    '#timeline/' + id,
    '#elsewhere/x',
  ])
    assert.equal(parseLink(fragment), null, fragment);
});
test('fragments read back as the same links', () => {
  for (const link of [
    { kind: 'moment', id: 'leg:2' },
    { kind: 'duration', id: 'a.b-c_d' },
    { kind: 'search', text: 'storm & sea / #1' },
    { kind: 'view', left: Q.parse('-1/3'), right: Q.parse('7/2') },
  ]) {
    const back = parseLink('#' + linkFragment(link));
    assert.equal(linkFragment(back), linkFragment(link));
  }
  assert.equal(linkFragment({ kind: 'moment', id: 'leg:2' }), 'moment/leg%3A2');
});
test('shared addresses give moments and durations pages of their own', () => {
  assert.equal(sharePath({ id }, null), '/timelines/' + id);
  assert.equal(
    sharePath({ id }, { kind: 'moment', id: 'leg:2' }),
    `/timelines/${id}/moments/leg%3A2`,
  );
  assert.equal(sharePath({ id }, { kind: 'duration', id: 'x' }), `/timelines/${id}/durations/x`);
  assert.equal(
    sharePath({ id }, { kind: 'search', text: 'storm' }),
    `/timelines/${id}#search/storm`,
  );
  // At its owner's name and slug, or ID (#148).
  assert.equal(sharePath({ id, owner: 'ada', slug: null }, null), `/ada/${id}`);
  assert.equal(
    sharePath({ id, owner: 'ada', slug: 'voyages' }, { kind: 'moment', id: 'leg:2' }),
    '/ada/voyages/moments/leg%3A2',
  );
  assert.equal(sharePath({ id, owner: 'admin', slug: 'voyages' }, null), '/timelines/' + id);
});
