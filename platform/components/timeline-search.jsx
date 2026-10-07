// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
'use client';
import { useState } from 'react';
import Form from 'next/form';
export default function TimelineSearch({ query }) {
  const [search, setSearch] = useState(query.search),
    [sort, setSort] = useState(query.sort);
  function updateSearch(value) {
    if (!search.trim() && value.trim() && sort === 'featured') setSort('relevance');
    if (search.trim() && !value.trim() && sort === 'relevance') setSort('featured');
    setSearch(value);
  }
  return (
    <Form action="/" className="search-controls">
      {query.owner && <input type="hidden" name="owner" value={query.owner} />}
      <label>
        Search timelines
        <input
          name="search"
          maxLength={300}
          value={search}
          onChange={(e) => updateSearch(e.target.value)}
          placeholder='Keywords or "exact phrase"'
        />
      </label>
      <label>
        Filter by tag
        <input name="tag" maxLength={64} defaultValue={query.tag} />
      </label>
      <label>
        Sort timelines
        <select name="sort" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="featured">Featured first</option>
          <option value="stars">By stars</option>
          <option value="popularity">By popularity</option>
          <option value="alphabetical">Alphabetical</option>
          <option value="age">Newest first</option>
          <option value="relevance" disabled={!search.trim()}>
            Relevance
          </option>
        </select>
      </label>
      <button type="submit">Search</button>
    </Form>
  );
}
