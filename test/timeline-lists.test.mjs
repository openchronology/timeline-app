// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The dashboard's and profiles' timeline lists (platform/lib/timeline-lists.js, #337): each
// list's own query parameters, links that keep the other lists' state, and browser drafts
// searched in the browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LISTS,
  changeList,
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
} from '../platform/lib/timeline-lists.js';
import { SEARCH_SORTS, searchInput } from '../server/collaboration.mjs';

test('every list has its own query parameters, and offers only sorts the server knows', () => {
  assert.deepEqual(paramNames(LISTS.explore), ['search', 'tag', 'sort', 'visibility', 'page']);
  assert.deepEqual(paramNames(LISTS.mine), [
    'mineSearch',
    'mineTag',
    'mineSort',
    'mineVisibility',
    'minePage',
  ]);
  assert.deepEqual(paramNames(LISTS.favorites).at(-1), 'favoritePage');
  assert.deepEqual(paramNames(LISTS.drafts)[0], 'draftSearch');
  // The dashboard's lists never share a parameter, nor do a profile's.
  for (const page of [
    ['explore', 'mine', 'favorites', 'drafts'],
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
        scope: list.visibility ? 'mine' : 'public',
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
  const mine = LISTS.mine;
  assert.deepEqual(readList({}, mine), {
    search: '',
    tag: '',
    sort: 'updated',
    visibility: '',
    page: 1,
  });
  assert.deepEqual(
    readList(
      {
        mineSearch: 'roman',
        mineTag: 'history',
        mineSort: 'alphabetical',
        mineVisibility: 'private',
        minePage: '3',
        search: 'other list',
      },
      mine,
    ),
    { search: 'roman', tag: 'history', sort: 'alphabetical', visibility: 'private', page: 3 },
  );
  // A search sorts by relevance unless asked otherwise; relevance needs search text.
  assert.equal(readList({ mineSearch: 'roman' }, mine).sort, 'relevance');
  assert.equal(readList({ mineSort: 'relevance' }, mine).sort, 'updated');
  // Unknown or repeated values, and sorts or filters the list doesn't offer, are ignored.
  assert.equal(readList({ mineSort: 'featured' }, mine).sort, 'updated');
  assert.equal(readList({ mineVisibility: 'secret' }, mine).visibility, '');
  assert.equal(readList({ visibility: 'private' }, LISTS.explore).visibility, '');
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
    mine: readList({ mineTag: 'war', minePage: '4' }, LISTS.mine),
    favorites: readList({}, LISTS.favorites),
    drafts: readList({ draftSearch: 'notes' }, LISTS.drafts),
  };
  const query = pageQuery(states, { owner: 'seed' });
  // Only what differs from each list's defaults.
  assert.deepEqual(query, {
    owner: 'seed',
    search: 'rome',
    sort: 'stars',
    page: '2',
    mineTag: 'war',
    minePage: '4',
    draftSearch: 'notes',
  });
  // The next page of the account's timelines keeps the public search, its page and the drafts.
  assert.equal(
    listHref('/', query, LISTS.mine, states.mine, { page: 5 }),
    '/?owner=seed&search=rome&sort=stars&page=2&draftSearch=notes&mineTag=war&minePage=5#mine',
  );
  // A tag filters its own list, from page one.
  assert.equal(
    listHref('/', query, LISTS.explore, states.explore, { tag: 'empire', page: 1 }),
    '/?owner=seed&mineTag=war&minePage=4&draftSearch=notes&search=rome&tag=empire&sort=stars#explore',
  );
  // The default order is left out: relevance with search text, the list's own without.
  assert.deepEqual(listQuery(LISTS.explore, { search: 'rome', sort: 'relevance', page: 1 }), {
    search: 'rome',
  });
  assert.deepEqual(listQuery(LISTS.explore, { search: '', sort: 'relevance', page: 1 }), {
    sort: 'relevance',
  });
  assert.deepEqual(listQuery(LISTS.favorites, { search: '', sort: 'age', page: 1 }), {});
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
  const state = readList({}, LISTS.mine);
  assert.equal(
    statusText(LISTS.mine, state, { total: 1, page: 1, pages: 1 }),
    '1 timeline · Page 1 of 1',
  );
  assert.equal(
    statusText(LISTS.favorites, state, { total: 1200, page: 2, pages: 100 }),
    '1,200 favorites · Page 2 of 100',
  );
  assert.equal(statusText(LISTS.mine, state, { total: 0 }), 'You have no server timelines yet.');
  assert.equal(
    statusText(LISTS.mine, { ...state, visibility: 'private' }, { total: 0 }),
    'None of your timelines match this search.',
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
  assert.equal(changeList(LISTS.mine, readList({}, LISTS.mine), { search: 'x' }).sort, 'relevance');
  // Every list's links open at its section, and no two sections on a page share an id.
  for (const page of [
    ['explore', 'mine', 'favorites', 'drafts'],
    ['profile', 'profileFavorites'],
  ])
    assert.equal(new Set(page.map((name) => LISTS[name].id)).size, page.length);
  // The search a list sends the API.
  assert.deepEqual(
    searchBody(LISTS.mine, readList({ mineVisibility: 'private' }, LISTS.mine), { scope: 'mine' }),
    { scope: 'mine', search: '', tag: '', sort: 'updated', page: 1, visibility: 'private' },
  );
  assert.equal('visibility' in searchBody(LISTS.explore, browse, { scope: 'public' }), false);
});
