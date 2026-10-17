// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Page addresses (#148): profiles and timelines at their owner’s name, the rules for slugs and
// usernames, and naming a timeline by owner and slug or by ID.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  availableUsername,
  profilePath,
  slugFromTitle,
  timelineAddress,
  timelinePath,
  validSlug,
} from '../dist/core.mjs';

const id = '6f1c4e2a-9b3d-4c5e-8f70-112233445566';
test('profiles and timelines are at their owner’s name (#148)', () => {
  assert.equal(profilePath('ada'), '/ada');
  assert.equal(timelinePath({ id, owner: 'ada', slug: 'voyages' }), '/ada/voyages');
  assert.equal(timelinePath({ id, owner: 'ada', slug: null }), '/ada/' + id);
  // Without an owner, and for names the site's own pages use, the older addresses.
  assert.equal(timelinePath({ id }), '/timelines/' + id);
  assert.equal(profilePath('admin'), '/users/admin');
  assert.equal(timelinePath({ id, owner: 'admin', slug: 'voyages' }), '/timelines/' + id);
});
test('slugs and usernames: their rules, and the names the site keeps', () => {
  for (const slug of ['a', 'fall-of-rome', 'ww_2', 'x'.repeat(64)]) assert(validSlug(slug), slug);
  for (const slug of ['', '-a', 'A', 'a b', 'a.b', 'x'.repeat(65), id])
    assert(!validSlug(slug), slug);
  assert(availableUsername('ada'));
  for (const name of ['login', 'timelines', 'users', 'settings', 'ab', 'Ada'])
    assert(!availableUsername(name), name);
  // Names that would pass for the site or its staff (#184), as written or spelled around.
  for (const name of [
    'api',
    'admin',
    'root',
    'moderator',
    'staff',
    'noreply',
    'ad_min',
    'time-lines',
    'sign-in',
    'admin1',
    'admin-2',
    'root_99',
    'mod1',
    'openchronology-support',
    'openchronology2',
    'open_chronology',
  ])
    assert(!availableUsername(name), name);
  // Names that only contain one, or put a number before it, stay free.
  for (const name of [
    'ada',
    'rootbeer',
    'staffordshire',
    'admiral',
    'team-rocket',
    '2admin',
    'ada_2',
  ])
    assert(availableUsername(name), name);
  // An existing account with an official-looking name keeps its addresses: only the site's
  // pages change them.
  assert.equal(profilePath('root'), '/root');
  assert.deepEqual(timelineAddress('/root/voyages'), { owner: 'root', name: 'voyages', rest: '' });
  assert.equal(slugFromTitle('The Fall of Rome (476)'), 'the-fall-of-rome-476');
  assert.equal(slugFromTitle('  Écoles — d’été  '), 'ecoles-d-ete');
  assert.equal(slugFromTitle('東京'), '');
  assert(validSlug(slugFromTitle('a'.repeat(63) + ' b')));
});
test('page addresses name a timeline by its owner and slug or ID, or by its ID alone', () => {
  assert.deepEqual(timelineAddress('/ada/voyages'), { owner: 'ada', name: 'voyages', rest: '' });
  assert.deepEqual(timelineAddress('/Ada/Voyages/moments/leg%3A2'), {
    owner: 'ada',
    name: 'voyages',
    rest: '/moments/leg%3A2',
  });
  assert.deepEqual(timelineAddress('/ada/' + id + '/history'), {
    owner: 'ada',
    name: id,
    rest: '/history',
  });
  assert.deepEqual(timelineAddress('/timelines/' + id + '/settings'), { id, rest: '/settings' });
  // The site's own pages, profiles and what could be neither.
  for (const path of [
    '/',
    '/ada',
    '/login/x',
    '/users/ada',
    '/timelines/voyages',
    '/ada/not.a.slug',
    '/_next/static',
    '/api/timelines',
  ])
    assert.equal(timelineAddress(path), null, path);
});
