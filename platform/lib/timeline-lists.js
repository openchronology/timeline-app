// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The dashboard's and profiles' timeline lists (#337): each list's own query parameters, read
// from the address and written back into links, so every list searches, sorts and pages on
// its own while keeping the others' state; and the search of browser drafts, done here.
/** What each sort order is called in the lists' Sort menus. */
export const SORT_LABELS = {
  featured: 'Featured first',
  relevance: 'Relevance',
  updated: 'Recently changed',
  age: 'Newest first',
  stars: 'By stars',
  popularity: 'By popularity',
  trending: 'Trending this month',
  alphabetical: 'Alphabetical',
  moments: 'Most moments',
};
/** The orders of public timelines: the server's search sorts (collaboration.mjs SEARCH_SORTS). */
const PUBLIC_SORTS = [
  'featured',
  'stars',
  'popularity',
  'trending',
  'alphabetical',
  'age',
  'updated',
  'relevance',
];
/** The orders of the account's own lists: nothing in them is featured for its owner. */
const OWN_SORTS = [
  'updated',
  'age',
  'alphabetical',
  'stars',
  'popularity',
  'trending',
  'relevance',
];
/**
 * The lists. Each has:
 * - `id`: its section's id on the page, which its links end with (`#mine`), so a page loaded
 *   without JavaScript opens at the list that was used (#338);
 * - `prefix`: what its query parameters begin with (`mineSearch`, `mineTag`, `mineSort`,
 *   `mineVisibility`, `minePage`); none for the page's main list (`search`, `tag`, …);
 * - `sorts`: the orders it offers, and `browse`: its order without search text (a search
 *   sorts by relevance unless asked otherwise);
 * - `visibility`: whether it filters by public or private (the account's own lists);
 * - `noun`: what its controls and messages call what it lists, `count` how it counts one and
 *   many of them, and `empty`: what it says
 *   when it has nothing at all, before any search, and `none` when a search finds nothing.
 */
export const LISTS = {
  explore: {
    id: 'explore',
    prefix: '',
    sorts: PUBLIC_SORTS,
    browse: 'featured',
    noun: 'timelines',
    count: ['timeline', 'timelines'],
    empty: 'No public timelines yet.',
    none: 'No public timelines match this search.',
  },
  mine: {
    id: 'mine',
    prefix: 'mine',
    sorts: OWN_SORTS,
    browse: 'updated',
    visibility: true,
    noun: 'your timelines',
    count: ['timeline', 'timelines'],
    empty: 'You have no server timelines yet.',
    none: 'None of your timelines match this search.',
  },
  favorites: {
    id: 'favorites',
    prefix: 'favorite',
    sorts: OWN_SORTS,
    browse: 'age',
    visibility: true,
    noun: 'your favorites',
    count: ['favorite', 'favorites'],
    empty: 'No favorites yet.',
    none: 'None of your favorites match this search.',
  },
  // Searched in the browser (searchDrafts below), by what the list of drafts records.
  drafts: {
    id: 'drafts',
    prefix: 'draft',
    sorts: ['updated', 'alphabetical', 'moments', 'relevance'],
    browse: 'updated',
    noun: 'drafts',
    count: ['draft', 'drafts'],
    empty: 'No drafts in this browser.',
    none: 'No drafts match this search.',
  },
  profile: {
    id: 'timelines',
    prefix: '',
    sorts: PUBLIC_SORTS,
    browse: 'featured',
    noun: 'public timelines',
    count: ['public timeline', 'public timelines'],
    empty: 'No public timelines yet.',
    none: 'No public timelines match this search.',
  },
  profileFavorites: {
    id: 'favorites',
    prefix: 'favorite',
    sorts: OWN_SORTS,
    browse: 'age',
    noun: 'public favorites',
    count: ['public favorite', 'public favorites'],
    empty: 'No public favorites yet.',
    none: 'No public favorites match this search.',
  },
};
/** The fields of a list's state, which each have a query parameter. */
const FIELDS = ['search', 'tag', 'sort', 'visibility', 'page'];
/** The query parameter of `field` (search, tag, sort, visibility or page) for `list`. */
export function paramName(list, field) {
  return list.prefix ? list.prefix + field[0].toUpperCase() + field.slice(1) : field;
}
/** Every query parameter `list` uses. */
export const paramNames = (list) => FIELDS.map((field) => paramName(list, field));
/** A page number from the address: a whole number from 1 to 10,000, or 1 when it is not one. */
export const pageNumber = (value) =>
  Math.max(1, Math.min(10000, Number.isSafeInteger(Number(value)) ? Number(value) : 1));
/** The order a list shows with this search text when none is asked for. */
export const defaultSort = (list, search) => (search.trim() ? 'relevance' : list.browse);
/**
 * A list's state from the address's query, made safe: strings only (a repeated parameter is
 * an array, and ignored), cut to a length the search accepts, a sort the list offers
 * (relevance only with search text) and a visibility only for the lists that filter by it.
 *
 * @param {Record<string, string|string[]|undefined>|URLSearchParams} params the query
 * @returns {{search: string, tag: string, sort: string, visibility: string, page: number}}
 */
export function readList(params, list) {
  const get = (field) => {
    const value =
      params instanceof URLSearchParams
        ? params.get(paramName(list, field))
        : params[paramName(list, field)];
    return typeof value === 'string' ? value : '';
  };
  const search = get('search').slice(0, 300),
    sort = get('sort');
  return {
    search,
    tag: get('tag').slice(0, 64),
    sort:
      list.sorts.includes(sort) && (sort !== 'relevance' || search.trim())
        ? sort
        : defaultSort(list, search),
    visibility:
      list.visibility && ['public', 'private'].includes(get('visibility')) ? get('visibility') : '',
    page: pageNumber(get('page')),
  };
}
/**
 * The query parameters that say a list's state, leaving out what is the default (no text, no
 * tag, the default order, page 1), so plain addresses stay plain.
 */
export function listQuery(list, state) {
  const query = {};
  const set = (field, value) => {
    if (value) query[paramName(list, field)] = String(value);
  };
  set('search', state.search);
  set('tag', state.tag);
  if (state.sort && state.sort !== defaultSort(list, state.search ?? '')) set('sort', state.sort);
  if (list.visibility) set('visibility', state.visibility);
  if (state.page > 1) set('page', state.page);
  return query;
}
/**
 * A page's whole query, as its links and forms keep it: `fixed` parameters (a dashboard's
 * `owner`), then every list's state that differs from its defaults.
 *
 * @param {Record<string, object>} states each list's state, by its name in LISTS
 * @param {Record<string, string>} [fixed]
 */
export function pageQuery(states, fixed = {}) {
  const query = { ...fixed };
  for (const [name, state] of Object.entries(states))
    Object.assign(query, listQuery(LISTS[name], state));
  return query;
}
/** `query` without the parameters of `list`: the rest of the page's state. */
export function otherParams(query, list) {
  const own = new Set(paramNames(list));
  return Object.fromEntries(Object.entries(query).filter(([key]) => !own.has(key)));
}
/**
 * The address of a page with one list changed: `query` (the whole page's state, as
 * listQuery and any fixed parameters such as `owner` give it) with `list`'s parameters
 * replaced by its state with `changes` over it (changeList), ending with the list's
 * section, so the page opens there.
 */
export function listHref(basePath, query, list, state, changes = {}) {
  const params = new URLSearchParams({
    ...otherParams(query, list),
    ...listQuery(list, changeList(list, state, changes)),
  });
  const text = params.toString();
  return (text ? basePath + '?' + text : basePath) + '#' + list.id;
}
/**
 * A list's state with `changes` over it, as a search, filter, sort or page asks: any change
 * but the page's starts from page one, and typing the first word switches the default
 * order to relevance and clearing the text switches back, unless another order was chosen.
 */
export function changeList(list, state, changes) {
  const next = { ...state, ...changes };
  if (!('page' in changes)) next.page = 1;
  if ('search' in changes && !('sort' in changes)) {
    const had = !!state.search.trim(),
      has = !!next.search.trim();
    if (!had && has && state.sort === list.browse) next.sort = 'relevance';
    if (had && !has && state.sort === 'relevance') next.sort = list.browse;
  }
  return next;
}
/**
 * In the browser: changes one list in the address without loading the page (#338), keeping
 * the rest of the address as it is now, so lists changed in place keep each other's state.
 * Next.js follows history.pushState and replaceState (useSearchParams sees the change), and
 * neither scrolls. `replace` is for typing, so each keystroke is not a step back.
 */
export function navigateList(list, changes, { replace = false } = {}) {
  const current = Object.fromEntries(new URLSearchParams(window.location.search));
  const href = listHref(window.location.pathname, current, list, readList(current, list), changes);
  if (href === window.location.pathname + window.location.search + window.location.hash) return;
  window.history[replace ? 'replaceState' : 'pushState'](null, '', href);
}
/**
 * A list's search as the search API (POST /api/timelines/search) and searchTimelines take
 * it: its state, and what the page fixes (its scope, and an owner or starredBy).
 */
export function searchBody(list, state, fixed) {
  const { search, tag, sort, visibility, page } = state;
  return { ...fixed, search, tag, sort, page, ...(list.visibility ? { visibility } : {}) };
}
/** How many drafts a page of them shows. */
export const DRAFT_PAGE_SIZE = 12;
/**
 * The terms of search text, as the server's web search syntax reads it: words, "quoted
 * phrases", and either with a leading - to leave out what has them; lower-cased.
 */
export function searchTerms(text) {
  const terms = [];
  for (const [, minus, phrase, word] of text
    .normalize('NFC')
    .toLowerCase()
    .matchAll(/(-?)(?:"([^"]*)"?|(\S+))/g)) {
    const value = (phrase ?? word ?? '').trim();
    if (value && value !== '-') terms.push({ value, exclude: minus === '-' });
  }
  return terms;
}
/**
 * A page of browser drafts (src/draft-store.ts's list of them, most recently edited first)
 * matching a list's state: every word or phrase in its title, description or tags (and none
 * of the excluded ones), with its tag, in its order. Shaped as the server's search results
 * are, for the same pager.
 *
 * @param {{title: string, description?: string, tags?: string[], moments: number,
 *   updated: string}[]} drafts
 * @param {{search: string, tag: string, sort: string, page: number}} state
 */
export function searchDrafts(drafts, state) {
  const terms = searchTerms(state.search),
    tag = state.tag.normalize('NFC').trim().toLowerCase();
  const scored = [];
  for (const draft of drafts) {
    const tags = (draft.tags ?? []).map((t) => t.normalize('NFC').toLowerCase());
    if (tag && !tags.includes(tag)) continue;
    const title = (draft.title ?? '').normalize('NFC').toLowerCase(),
      rest = [(draft.description ?? '').normalize('NFC').toLowerCase(), ...tags].join('\n');
    let rank = 0,
      matches = true;
    for (const { value, exclude } of terms) {
      const found = title.includes(value) || rest.includes(value);
      if (found === exclude) {
        matches = false;
        break;
      }
      // A match in the title counts most, as the server weighs titles.
      if (!exclude) rank += title.includes(value) ? 2 : 1;
    }
    if (matches) scored.push({ draft, rank });
  }
  const title = (d) => (d.title || 'Untitled timeline').toLowerCase();
  const order = {
    relevance: (a, b) => b.rank - a.rank,
    alphabetical: (a, b) => title(a.draft).localeCompare(title(b.draft)),
    moments: (a, b) => b.draft.moments - a.draft.moments,
    updated: () => 0,
  }[state.sort];
  // Array sorting is stable: ties stay most recently edited first.
  if (order) scored.sort(order);
  const total = scored.length,
    pages = Math.ceil(total / DRAFT_PAGE_SIZE),
    page = Math.min(state.page, Math.max(1, pages));
  return {
    timelines: scored
      .slice((page - 1) * DRAFT_PAGE_SIZE, page * DRAFT_PAGE_SIZE)
      .map(({ draft }) => draft),
    total,
    page,
    pages,
  };
}
/** The line under a list: how many it has and which page this is, or why it has none. */
export function statusText(list, state, result) {
  if (!result.total) return isFiltered(state) ? list.none : list.empty;
  const [one, many] = list.count;
  return `${result.total.toLocaleString('en')} ${result.total === 1 ? one : many} · Page ${result.page} of ${result.pages}`;
}
/** Whether a list's state narrows it (search text, a tag or a visibility), for its messages. */
export const isFiltered = (state) => !!(state.search?.trim() || state.tag || state.visibility);
