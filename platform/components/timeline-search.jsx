// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
'use client';
// A timeline list's search form (#337): words, tag, sort order and, for the account's own
// lists, visibility, in that list's own query parameters (lib/timeline-lists.js).
import { useState } from 'react';
import Form from 'next/form';
import { SORT_LABELS, defaultSort, otherParams, paramName } from '../lib/timeline-lists.js';
/**
 * The form searches by loading the page (`basePath`) with this list's fields and, as hidden
 * fields, the rest of the page's query, so the other lists keep their search, sort and page.
 * Its page starts over from one.
 *
 * @param {object} props
 * @param {object} props.list the list (lib/timeline-lists.js LISTS)
 * @param {{search: string, tag: string, sort: string, visibility: string}} props.state the
 *   list's state now
 * @param {Record<string, string>} props.query the whole page's query
 * @param {string} [props.basePath] the page the form loads
 */
export default function TimelineSearch({ list, state, query, basePath = '/' }) {
  const [search, setSearch] = useState(state.search),
    [sort, setSort] = useState(state.sort);
  const name = (field) => paramName(list, field);
  // Typing the first word switches the default order to relevance, and clearing the text
  // switches back, unless another order was chosen.
  function updateSearch(value) {
    if (!search.trim() && value.trim() && sort === defaultSort(list, '')) setSort('relevance');
    if (search.trim() && !value.trim() && sort === 'relevance') setSort(defaultSort(list, ''));
    setSearch(value);
  }
  return (
    <Form
      action={basePath}
      className="search-controls"
      role="search"
      aria-label={'Find ' + list.noun}
    >
      {Object.entries(otherParams(query, list)).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      <label>
        {`Search ${list.noun}`}
        <input
          name={name('search')}
          type="search"
          maxLength={300}
          value={search}
          onChange={(e) => updateSearch(e.target.value)}
          placeholder='Keywords or "exact phrase"'
        />
      </label>
      <label>
        Filter by tag
        <input name={name('tag')} maxLength={64} defaultValue={state.tag} />
      </label>
      {list.visibility && (
        <label>
          Visibility
          <select name={name('visibility')} defaultValue={state.visibility}>
            <option value="">Public and private</option>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
        </label>
      )}
      <label>
        {`Sort ${list.noun}`}
        <select name={name('sort')} value={sort} onChange={(e) => setSort(e.target.value)}>
          {list.sorts.map((value) => (
            <option key={value} value={value} disabled={value === 'relevance' && !search.trim()}>
              {SORT_LABELS[value]}
            </option>
          ))}
        </select>
      </label>
      <button type="submit">Search</button>
    </Form>
  );
}
