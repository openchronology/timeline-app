// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
'use client';
// A timeline list's search controls (#337, #338): words, tag, sort order and, for the
// account's own lists, visibility, in that list's own query parameters
// (lib/timeline-lists.js), and the grid or list layout.
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { SORT_LABELS, otherParams, paramName } from '../lib/timeline-lists.js';
/** How long typing pauses before the list searches, in milliseconds. */
export const TYPING_DELAY = 350;
/** Where the visitor's choice of layout is kept, for every list (#338). */
const LAYOUT_KEY = 'openchronology.timelineLayout';
/**
 * The visitor's layout for timeline lists, `grid` or `list`, remembered in this browser and
 * shared by every list on the page; and a function to choose it. Grid until the browser
 * says otherwise, so the server's page and the first render agree.
 */
export function useLayout() {
  const [layout, setLayout] = useState('grid');
  useEffect(() => {
    try {
      if (localStorage.getItem(LAYOUT_KEY) === 'list') setLayout('list');
    } catch {}
    const follow = (event) => setLayout(event.detail);
    window.addEventListener('timeline-layout', follow);
    return () => window.removeEventListener('timeline-layout', follow);
  }, []);
  const choose = (value) => {
    try {
      localStorage.setItem(LAYOUT_KEY, value);
    } catch {}
    window.dispatchEvent(new CustomEvent('timeline-layout', { detail: value }));
  };
  return [layout, choose];
}
/** The Grid and List buttons, shown once JavaScript runs (they need it). */
function LayoutToggle({ layout, onLayout, noun }) {
  return (
    <div className="layout-toggle" role="group" aria-label={`Show ${noun} as`}>
      {[
        ['grid', 'Grid'],
        ['list', 'List'],
      ].map(([value, text]) => (
        <button
          key={value}
          type="button"
          aria-pressed={layout === value}
          onClick={() => onLayout(value)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
/**
 * Without JavaScript the form loads the page (`basePath`, at the list's section) with this
 * list's fields and, as hidden fields, the rest of the address, so the other lists keep
 * their search, sort and page. With it, and `onNavigate`, the list changes in place: the
 * sort and visibility at once, the words and tag as they are typed (after TYPING_DELAY),
 * and Search or Enter at once; focus stays where it is.
 *
 * @param {object} props
 * @param {object} props.list the list (lib/timeline-lists.js LISTS)
 * @param {{search: string, tag: string, sort: string, visibility: string}} props.state the
 *   list's state now, from the address
 * @param {string} [props.basePath] the page the form loads
 * @param {(changes: object, options?: {replace?: boolean}) => void} [props.onNavigate]
 * @param {'grid'|'list'} [props.layout] with `onLayout`, the layout buttons
 * @param {(layout: string) => void} [props.onLayout]
 */
export default function TimelineSearch({
  list,
  state,
  basePath = '/',
  onNavigate,
  layout,
  onLayout,
}) {
  const params = useSearchParams();
  const [search, setSearch] = useState(state.search),
    [tag, setTag] = useState(state.tag),
    [ready, setReady] = useState(false);
  // The pending search while typing, and whether this spell of typing has searched yet: its
  // first search adds a step to the history, so Back returns to before it, and the rest
  // replace that step.
  const typing = useRef(null),
    spell = useRef(false);
  const name = (field) => paramName(list, field);
  useEffect(() => setReady(true), []);
  // The address changed by itself (Back, a tag, a cleared search): its words and tag show,
  // unless the visitor is still typing.
  useEffect(() => {
    if (!typing.current) setSearch(state.search);
  }, [state.search]);
  useEffect(() => {
    if (!typing.current) setTag(state.tag);
  }, [state.tag]);
  useEffect(() => () => clearTimeout(typing.current), []);
  /** Searches once typing pauses. */
  function typed(changes) {
    if (!onNavigate) return;
    clearTimeout(typing.current);
    typing.current = setTimeout(() => {
      typing.current = null;
      onNavigate(changes, { replace: spell.current });
      spell.current = true;
    }, TYPING_DELAY);
  }
  function submit(event) {
    if (!onNavigate) return;
    event.preventDefault();
    clearTimeout(typing.current);
    typing.current = null;
    onNavigate({ search, tag }, { replace: spell.current });
    spell.current = false;
  }
  const endSpell = () => {
    if (!typing.current) spell.current = false;
  };
  const others = Object.entries(otherParams(Object.fromEntries(params), list));
  return (
    <form
      action={basePath + '#' + list.id}
      method="get"
      className="search-controls"
      role="search"
      aria-label={'Find ' + list.noun}
      onSubmit={submit}
    >
      {others.map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      <label className="search-words">
        {`Search ${list.noun}`}
        <input
          name={name('search')}
          type="search"
          maxLength={300}
          value={search}
          autoComplete="off"
          onBlur={endSpell}
          onChange={(e) => {
            setSearch(e.target.value);
            typed({ search: e.target.value, tag });
          }}
          placeholder='Keywords or "exact phrase"'
        />
      </label>
      <label>
        Filter by tag
        <input
          name={name('tag')}
          maxLength={64}
          value={tag}
          autoComplete="off"
          onBlur={endSpell}
          onChange={(e) => {
            setTag(e.target.value);
            typed({ search, tag: e.target.value });
          }}
        />
      </label>
      {list.visibility && (
        <label>
          Visibility
          <ChoiceSelect
            name={name('visibility')}
            value={state.visibility}
            options={[
              ['', 'Public and private'],
              ['public', 'Public'],
              ['private', 'Private'],
            ]}
            onChange={onNavigate && ((visibility) => onNavigate({ search, tag, visibility }))}
          />
        </label>
      )}
      <label>
        {`Sort ${list.noun}`}
        <ChoiceSelect
          name={name('sort')}
          value={state.sort}
          options={list.sorts.map((sort) => [
            sort,
            SORT_LABELS[sort],
            sort === 'relevance' && !search.trim(),
          ])}
          onChange={onNavigate && ((sort) => onNavigate({ search, tag, sort }))}
        />
      </label>
      <button type="submit">Search</button>
      {ready && onLayout && <LayoutToggle layout={layout} onLayout={onLayout} noun={list.noun} />}
    </form>
  );
}
/**
 * A menu of the form. Without JavaScript it is a plain field; with it, choosing applies at
 * once (`onChange`), and it follows the address when that changes by itself.
 *
 * @param {{name: string, value: string, options: [string, string, boolean?][],
 *   onChange?: (value: string) => void}} props options as [value, text, disabled]
 */
function ChoiceSelect({ name, value, options, onChange }) {
  const [chosen, setChosen] = useState(value);
  useEffect(() => setChosen(value), [value]);
  return (
    <select
      name={name}
      value={chosen}
      onChange={(e) => {
        setChosen(e.target.value);
        onChange?.(e.target.value);
      }}
    >
      {options.map(([option, text, disabled]) => (
        <option key={option} value={option} disabled={!!disabled}>
          {text}
        </option>
      ))}
    </select>
  );
}
