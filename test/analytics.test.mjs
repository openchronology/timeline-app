// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// What Google Analytics is told of a page (platform/lib/analytics.js): public pages as they are;
// nothing naming a timeline that isn't public, a comparison, a sign-in code or a search.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SHOWN_PATH, SHOWN_TITLE, analyticsPage, publicPage } from '../platform/lib/analytics.js';

const origin = 'https://timescale.info',
  site = 'timescale.info',
  id = '0f8fad5b-d9cb-469f-a165-70867728950e';
const page = (pathname, shown = null) => analyticsPage({ origin, pathname, site, shown });

test('only a public timeline marks its page for analytics', () => {
  const title = 'Voyages · timescale.info';
  assert.deepEqual(publicPage({ visibility: 'public' }, '/ada/voyages', title), {
    [SHOWN_PATH]: '/ada/voyages',
    [SHOWN_TITLE]: title,
  });
  for (const timeline of [
    { visibility: 'private' },
    { visibility: 'unlisted' },
    {},
    null,
    { visibility: 'public', comparison: { sources: [] } },
  ])
    assert.deepEqual(publicPage(timeline, '/ada/voyages', title), {});
});

test("a timeline's pages are named only when they marked themselves public", () => {
  const shown = { path: '/ada/voyages', title: 'Voyages · timescale.info' };
  assert.deepEqual(page('/ada/voyages', shown), {
    page_location: origin + '/ada/voyages',
    page_title: 'Voyages · timescale.info',
  });
  // A moment's page, at the address its page gave.
  assert.deepEqual(
    page('/ada/voyages/moments/storm', {
      path: '/ada/voyages/moments/storm',
      title: 'Storm · Voyages · timescale.info',
    }),
    {
      page_location: origin + '/ada/voyages/moments/storm',
      page_title: 'Storm · Voyages · timescale.info',
    },
  );
  // Unmarked (private, unlisted, a settings page, a 404 at a timeline's address): a timeline.
  const hidden = { page_location: origin + '/timelines', page_title: 'Timeline · timescale.info' };
  for (const path of [
    '/ada/secret-plans',
    '/Ada/Secret-Plans/moments/m1',
    '/ada/secret-plans/settings',
    '/timelines/' + id,
    '/timelines/' + id + '/history',
    '/ada/' + id,
  ])
    assert.deepEqual(page(path), hidden, path);
  // A mark that is not an address on the site is not believed.
  assert.deepEqual(page('/ada/secret-plans', { path: 'https://x.example/', title: 'x' }), hidden);
  assert.deepEqual(page('/ada/secret-plans', { path: '/ada/secret-plans', title: '' }), hidden);
});

test('comparisons, the editor and desktop sign-in keep only their first part', () => {
  assert.deepEqual(page('/compare'), {
    page_location: origin + '/compare',
    page_title: 'Compare timelines · timescale.info',
  });
  assert.deepEqual(page('/connect/desktop/ABCDEFGH23'), {
    page_location: origin + '/connect',
    page_title: 'Connect the desktop app · timescale.info',
  });
  assert.deepEqual(page('/editor'), {
    page_location: origin + '/editor',
    page_title: 'Editor · timescale.info',
  });
});

test("the site's other pages keep their path, with ids hidden and named for their section", () => {
  assert.deepEqual(page('/'), { page_location: origin + '/', page_title: site });
  assert.deepEqual(page('/help/tags'), {
    page_location: origin + '/help/tags',
    page_title: 'Help · timescale.info',
  });
  assert.deepEqual(page('/privacy'), {
    page_location: origin + '/privacy',
    page_title: 'Privacy policy · timescale.info',
  });
  assert.deepEqual(page('/ada'), {
    page_location: origin + '/ada',
    page_title: 'Profile · timescale.info',
  });
  assert.deepEqual(page('/users/admin'), {
    page_location: origin + '/users/admin',
    page_title: 'Profile · timescale.info',
  });
  assert.deepEqual(page('/explore'), {
    page_location: origin + '/explore',
    page_title: 'Explore timelines · timescale.info',
  });
  // Ids anywhere else, and pages of no known section.
  assert.deepEqual(page(`/admin/${id}/x`), {
    page_location: origin + '/admin/(id)/x',
    page_title: 'Administration · timescale.info',
  });
  assert.deepEqual(page('/no/such/page/here'), {
    page_location: origin + '/no/such/page/here',
    page_title: site,
  });
  assert.deepEqual(page('/constructor'), {
    page_location: origin + '/constructor',
    page_title: 'Profile · timescale.info',
  });
  assert.deepEqual(page('/__proto__'), {
    page_location: origin + '/__proto__',
    page_title: site,
  });
});
