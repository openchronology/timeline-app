// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The dashboard's and profiles' timeline lists (platform/lib/timeline-lists.js, #337): each
// list's own query parameters, links that keep the other lists' state, and browser drafts
// searched in the browser; and the last list a tab showed, for a timeline's "Timelines" link.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  LISTS,
  changeList,
  lastList,
  rememberList,
  searchBody,
  SORT_LABELS,
  listHref,
  listQuery,
  pageQuery,
  paramNames,
  readList,
  searchDrafts,
  searchTerms,
  statusText,
  librarySearches,
  SHOWN,
} from '../platform/lib/timeline-lists.js';
import { entitySearchInput } from '../server/library-search.mjs';
import { SEARCH_SORTS, searchInput } from '../server/collaboration.mjs';

test('every list has its own query parameters, and offers only sorts the server knows', () => {
  assert.deepEqual(paramNames(LISTS.explore), [
    'search',
    'tag',
    'sort',
    'visibility',
    'page',
    'show',
    'within',
    'starred',
    'entityPage',
  ]);
  assert.deepEqual(paramNames(LISTS.profileFavorites).at(-1), 'favoritePage');
  assert.deepEqual(paramNames(LISTS.drafts)[0], 'draftSearch');
  // Explore covers the account's own timelines and favorites, in its filters.
  assert.equal(LISTS.mine, undefined);
  assert.equal(LISTS.favorites, undefined);
  // The dashboard's lists never share a parameter, nor do a profile's.
  for (const page of [
    ['explore', 'drafts'],
    ['profile', 'profileFavorites'],
  ]) {
    const names = page.flatMap((name) => paramNames(LISTS[name]));
    assert.equal(new Set(names).size, names.length);
  }
  for (const [name, list] of Object.entries(LISTS)) {
    for (const sort of list.sorts) assert(SORT_LABELS[sort], sort);
    assert(list.sorts.includes(list.browse));
    assert(list.sorts.includes('relevance'));
    // Every list the server searches sorts only as the server does, and its state is a
    // search the server accepts.
    if (name !== 'drafts') {
      for (const sort of list.sorts) assert(SEARCH_SORTS.includes(sort), sort);
      const { search, tag, sort, visibility, page } = readList({}, list);
      searchInput({
        scope: list.visibility ? 'visible' : 'public',
        search,
        tag,
        sort,
        visibility,
        page,
      });
    }
  }
  assert.deepEqual(LISTS.explore.sorts.slice().sort(), SEARCH_SORTS.slice().sort());
});

test('a list reads its state from the address, made safe', () => {
  const drafts = LISTS.drafts;
  assert.deepEqual(readList({}, drafts), {
    search: '',
    tag: '',
    sort: 'updated',
    visibility: '',
    page: 1,
  });
  assert.deepEqual(
    readList(
      {
        draftSearch: 'roman',
        draftTag: 'history',
        draftSort: 'alphabetical',
        draftPage: '3',
        search: 'other list',
      },
      drafts,
    ),
    { search: 'roman', tag: 'history', sort: 'alphabetical', visibility: '', page: 3 },
  );
  // A search sorts by relevance unless asked otherwise; relevance needs search text.
  assert.equal(readList({ draftSearch: 'roman' }, drafts).sort, 'relevance');
  assert.equal(readList({ draftSort: 'relevance' }, drafts).sort, 'updated');
  // Unknown or repeated values, and sorts or filters the list doesn't offer, are ignored.
  assert.equal(readList({ draftSort: 'featured' }, drafts).sort, 'updated');
  assert.equal(readList({ draftVisibility: 'private' }, drafts).visibility, '');
  assert.equal(readList({ visibility: 'secret' }, LISTS.explore).visibility, '');
  assert.equal(readList({ visibility: 'private' }, LISTS.explore).visibility, 'private');
  assert.equal(readList({ visibility: 'private' }, LISTS.profile).visibility, '');
  assert.equal(readList({ search: ['a', 'b'] }, LISTS.explore).search, '');
  assert.equal(readList({ page: '0' }, LISTS.explore).page, 1);
  assert.equal(readList({ page: '99999' }, LISTS.explore).page, 10000);
  assert.equal(readList({ search: 'x'.repeat(400) }, LISTS.explore).search.length, 300);
  assert.equal(
    readList(new URLSearchParams('draftSearch=map&draftSort=moments'), LISTS.drafts).sort,
    'moments',
  );
});

test('links change one list and keep the others', () => {
  const states = {
    explore: readList({ search: 'rome', sort: 'stars', page: '2' }, LISTS.explore),
    drafts: readList({ draftSearch: 'notes', draftPage: '4' }, LISTS.drafts),
  };
  const query = pageQuery(states, { owner: 'seed' });
  // Only what differs from each list's defaults.
  assert.deepEqual(query, {
    owner: 'seed',
    search: 'rome',
    sort: 'stars',
    page: '2',
    draftSearch: 'notes',
    draftPage: '4',
  });
  // The next page of drafts keeps the library's search and its page.
  assert.equal(
    listHref('/', query, LISTS.drafts, states.drafts, { page: 5 }),
    '/?owner=seed&search=rome&sort=stars&page=2&draftSearch=notes&draftPage=5#drafts',
  );
  // A tag filters its own list, from page one.
  assert.equal(
    listHref('/', query, LISTS.explore, states.explore, { tag: 'empire', page: 1 }),
    '/?owner=seed&draftSearch=notes&draftPage=4&search=rome&tag=empire&sort=stars#explore',
  );
  // Only starred, and private: in the address as `starred=1` and `visibility`.
  assert.equal(
    listHref('/', {}, LISTS.explore, readList({}, LISTS.explore), {
      starred: true,
      visibility: 'private',
    }),
    '/?visibility=private&starred=1#explore',
  );
  // The default order is left out: relevance with search text, the list's own without.
  assert.deepEqual(listQuery(LISTS.explore, { search: 'rome', sort: 'relevance', page: 1 }), {
    search: 'rome',
  });
  assert.deepEqual(listQuery(LISTS.explore, { search: '', sort: 'relevance', page: 1 }), {
    sort: 'relevance',
  });
  assert.deepEqual(listQuery(LISTS.profileFavorites, { search: '', sort: 'age', page: 1 }), {});
  assert.equal(listHref('/ada', {}, LISTS.profile, readList({}, LISTS.profile)), '/ada#timelines');
});

test('search text reads as the server reads it: words, phrases and exclusions', () => {
  assert.deepEqual(searchTerms('Roman  "civil WAR" -draft -"old notes"'), [
    { value: 'roman', exclude: false },
    { value: 'civil war', exclude: false },
    { value: 'draft', exclude: true },
    { value: 'old notes', exclude: true },
  ]);
  assert.deepEqual(searchTerms('  - "" '), []);
});

test('browser drafts are searched, sorted and paged in the browser', () => {
  // Most recently edited first, as the list of drafts gives them.
  const drafts = [
    { id: 'a', title: 'Roman roads', description: 'Notes', tags: ['history'], moments: 4 },
    { id: 'b', title: 'Kitchen', description: 'Roman recipes', tags: ['food'], moments: 9 },
    { id: 'c', title: 'Apollo', moments: 2, updated: '' },
    ...Array.from({ length: 14 }, (_, i) => ({ id: 'n' + i, title: 'Note ' + i, moments: i })),
  ];
  const search = (state) =>
    searchDrafts(drafts, { search: '', tag: '', sort: 'updated', page: 1, ...state });
  const ids = (result) => result.timelines.map((d) => d.id);
  const all = search({});
  assert.equal(all.total, 17);
  assert.equal(all.pages, 2);
  assert.deepEqual(ids(all).slice(0, 3), ['a', 'b', 'c']);
  assert.equal(ids(search({ page: 2 })).length, 5);
  // A page past the last shows the last.
  assert.equal(search({ page: 9 }).page, 2);
  // A title match ranks above a description's.
  assert.deepEqual(ids(search({ search: 'roman', sort: 'relevance' })), ['a', 'b']);
  assert.deepEqual(ids(search({ search: 'roman', sort: 'alphabetical' })), ['b', 'a']);
  assert.deepEqual(ids(search({ search: 'roman -recipes' })), ['a']);
  assert.deepEqual(ids(search({ search: '"roman roads"' })), ['a']);
  assert.deepEqual(ids(search({ tag: 'FOOD' })), ['b']);
  assert.deepEqual(ids(search({ search: 'history' })), ['a']);
  assert.equal(search({ search: 'nothing here' }).total, 0);
  assert.equal(search({ search: 'nothing here' }).page, 1);
  assert.deepEqual(ids(search({ sort: 'moments' })).slice(0, 2), ['n13', 'n12']);
});

test('a list says how many it has, or why it has none', () => {
  const state = readList({}, LISTS.explore);
  assert.equal(
    statusText(LISTS.explore, state, { total: 1, page: 1, pages: 1 }),
    '1 timeline · Page 1 of 1',
  );
  assert.equal(
    statusText(LISTS.profileFavorites, state, { total: 1200, page: 2, pages: 100 }),
    '1,200 public favorites · Page 2 of 100',
  );
  assert.equal(statusText(LISTS.explore, state, { total: 0 }), 'No public timelines yet.');
  for (const filter of [{ visibility: 'private' }, { starred: true }, { within: 'mine' }])
    assert.equal(
      statusText(LISTS.explore, { ...state, ...filter }, { total: 0 }),
      'No timelines match this search.',
    );
});

test('changing a list starts from page one, and a search sorts by relevance (#338)', () => {
  const browse = readList({ page: '3' }, LISTS.explore);
  assert.deepEqual(changeList(LISTS.explore, browse, { search: 'rome' }), {
    ...browse,
    search: 'rome',
    sort: 'relevance',
    page: 1,
  });
  assert.equal(changeList(LISTS.explore, browse, { page: 4 }).page, 4);
  // Another order chosen stays; clearing the text goes back to browsing's order.
  const stars = readList({ sort: 'stars' }, LISTS.explore);
  assert.equal(changeList(LISTS.explore, stars, { search: 'rome' }).sort, 'stars');
  const found = readList({ search: 'rome' }, LISTS.explore);
  assert.equal(changeList(LISTS.explore, found, { search: '' }).sort, 'featured');
  assert.equal(
    changeList(LISTS.drafts, readList({}, LISTS.drafts), { search: 'x' }).sort,
    'relevance',
  );
  // Every list's links open at its section, and no two sections on a page share an id.
  for (const page of [
    ['explore', 'drafts'],
    ['profile', 'profileFavorites'],
  ])
    assert.equal(new Set(page.map((name) => LISTS[name].id)).size, page.length);
  // The search a list sends the API.
  assert.deepEqual(
    searchBody(LISTS.explore, readList({ visibility: 'private' }, LISTS.explore), {
      scope: 'visible',
    }),
    { scope: 'visible', search: '', tag: '', sort: 'featured', page: 1, visibility: 'private' },
  );
  assert.equal('visibility' in searchBody(LISTS.profile, browse, { scope: 'public' }), false);
});

test('a timeline leads back to the last list its tab showed, on this site only', () => {
  const stored = new Map();
  globalThis.sessionStorage = {
    getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value),
  };
  try {
    assert.equal(lastList(), null);
    rememberList('/explore?q=apollo&page=2');
    assert.equal(lastList(), '/explore?q=apollo&page=2');
    rememberList('//elsewhere.example/');
    assert.equal(lastList(), null);
    globalThis.sessionStorage = {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('blocked');
      },
    };
    rememberList('/athan');
    assert.equal(lastList(), null);
  } finally {
    delete globalThis.sessionStorage;
  }
  // The platform points the editor's link at its timeline browser by this markup
  // (platform/lib/editor-html.js).
  assert.match(readFileSync('src/index.html', 'utf8'), /<a id="timelines-link" href="\/"/);
});

test('Explore’s search finds timelines and events, as its filters say (#459)', () => {
  const explore = LISTS.explore,
    fixed = { scope: 'public' };
  // All three kinds unless the address names some; several boxes or a list.
  assert.deepEqual(readList({}, explore).show, SHOWN);
  assert.deepEqual(readList({ show: 'moments' }, explore).show, ['moments']);
  assert.deepEqual(readList({ show: ['durations', 'timelines'] }, explore).show, [
    'timelines',
    'durations',
  ]);
  assert.deepEqual(readList({ show: 'durations,moments' }, explore).show, ['moments', 'durations']);
  assert.deepEqual(readList({ show: 'nothing' }, explore).show, SHOWN);
  assert.deepEqual(readList(new URLSearchParams('show=moments&show=timelines'), explore).show, [
    'timelines',
    'moments',
  ]);
  assert.equal(readList({ within: 'everyone' }, explore).within, '');
  // Addresses keep only what isn't the default.
  const state = readList(
    { search: 'rome', show: 'moments', within: 'mine', entityPage: '2' },
    explore,
  );
  assert.deepEqual(listQuery(explore, state), {
    search: 'rome',
    show: 'moments',
    within: 'mine',
    entityPage: '2',
  });
  assert.deepEqual(listQuery(explore, { ...state, starred: true }).starred, '1');
  assert.deepEqual(listQuery(explore, readList({}, explore)), {});
  // Paging one list keeps the other's page; anything else starts both again.
  const both = readList({ search: 'rome', page: '3', entityPage: '2' }, explore);
  assert.deepEqual(
    [
      changeList(explore, both, { page: 4 }).entityPage,
      changeList(explore, both, { entityPage: 5 }).page,
    ],
    [2, 3],
  );
  const changed = changeList(explore, both, { tag: 'war' });
  assert.deepEqual([changed.page, changed.entityPage], [1, 1]);

  // Without words: timelines only, public. A guest's words search public timelines and events.
  assert.deepEqual(librarySearches(explore, readList({}, explore), fixed).entities, null);
  assert.equal(librarySearches(explore, readList({}, explore), fixed).timelines.scope, 'public');
  const guest = librarySearches(explore, readList({ search: 'rome', tag: 'war' }, explore), fixed);
  assert.deepEqual(guest.entities, {
    search: 'rome',
    kinds: ['moment', 'duration'],
    tag: 'war',
    scope: 'public',
    page: 1,
  });
  // Signed in, words search what the account may read, or its own; browsing stays public.
  const signedIn = { signedIn: true };
  const visible = librarySearches(explore, readList({ search: 'rome' }, explore), fixed, signedIn);
  assert.deepEqual([visible.timelines.scope, visible.entities.scope], ['visible', 'visible']);
  assert.equal(
    librarySearches(explore, readList({}, explore), fixed, signedIn).timelines.scope,
    'public',
  );
  const own = librarySearches(
    explore,
    readList({ search: 'rome', within: 'mine' }, explore),
    fixed,
    signedIn,
  );
  assert.deepEqual([own.timelines.scope, own.entities.scope], ['mine', 'mine']);
  assert.equal(
    librarySearches(explore, readList({ within: 'mine' }, explore), fixed).timelines.scope,
    'public',
    'not for a guest',
  );
  // What it shows; one account's timelines on its own Explore.
  const durations = librarySearches(
    explore,
    readList({ search: 'rome', show: 'durations' }, explore),
    { scope: 'public', owner: 'ada' },
  );
  assert.equal(durations.timelines, null);
  assert.deepEqual([durations.entities.kinds, durations.entities.owner], [['duration'], 'ada']);
  // Each is a search the server accepts.
  searchInput(visible.timelines);
  entitySearchInput(visible.entities);

  // Only starred, and public or private (in place of the dashboard's own lists): signed in,
  // they search what the account may read, or its own; a guest's are ignored.
  assert.equal(readList({ starred: 'yes' }, explore).starred, false);
  const starred = librarySearches(
    explore,
    readList({ search: 'rome', starred: '1', visibility: 'private' }, explore),
    fixed,
    signedIn,
  );
  assert.deepEqual(
    [starred.timelines.scope, starred.timelines.starred, starred.timelines.visibility],
    ['visible', true, 'private'],
  );
  assert.deepEqual(
    [starred.entities.scope, starred.entities.starred, starred.entities.visibility],
    ['visible', true, 'private'],
  );
  searchInput(starred.timelines);
  entitySearchInput(starred.entities);
  // Browsing starred ones, or by visibility, looks past the public library.
  for (const filter of [{ starred: '1' }, { visibility: 'private' }])
    assert.equal(
      librarySearches(explore, readList(filter, explore), fixed, signedIn).timelines.scope,
      'visible',
    );
  const ownStarred = librarySearches(
    explore,
    readList({ within: 'mine', starred: '1' }, explore),
    fixed,
    signedIn,
  ).timelines;
  assert.deepEqual([ownStarred.scope, ownStarred.starred], ['mine', true]);
  const guestStarred = librarySearches(
    explore,
    readList({ starred: '1', visibility: 'private' }, explore),
    fixed,
  ).timelines;
  assert.deepEqual(
    [guestStarred.scope, 'starred' in guestStarred, 'visibility' in guestStarred],
    ['public', false, false],
  );
});
