// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
'use client';
// Finding operations in the API reference (#178) by their path, method or summary.
import { useEffect, useState } from 'react';
export default function ApiFilter() {
  const [query, setQuery] = useState('');
  function filter(value) {
    setQuery(value);
    const words = value.toLowerCase().split(/\s+/).filter(Boolean);
    for (const element of document.querySelectorAll('[data-api-search]'))
      element.hidden = !words.every((word) => element.dataset.apiSearch.includes(word));
    // Tags with nothing left to show go too.
    for (const group of document.querySelectorAll('[data-api-group]'))
      group.hidden = ![...group.querySelectorAll('[data-api-search]')].some((e) => !e.hidden);
  }
  return (
    <label className="api-filter">
      Find an operation
      <input
        type="search"
        value={query}
        placeholder="for example timelines settings, or DELETE"
        onChange={(e) => filter(e.target.value)}
      />
    </label>
  );
}
/** Opens the operation or schema an address names, as it is followed (`#op-…`, `#schema-…`). */
export function ApiAnchors() {
  useEffect(() => {
    function open() {
      const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (target?.tagName !== 'DETAILS') return;
      target.open = true;
      target.scrollIntoView();
    }
    open();
    window.addEventListener('hashchange', open);
    return () => window.removeEventListener('hashchange', open);
  }, []);
  return null;
}
