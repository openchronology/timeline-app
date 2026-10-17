// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
'use client';
// Choosing timelines to compare: a checkbox on each listed timeline, and a tray that opens
// /compare; the choice is kept for the browser tab.
import { useEffect, useState } from 'react';
/**
 * The session-storage key of the chosen timelines' ids, and also the name of the window event
 * that tells every checkbox and tray on the page that the choice changed.
 */
const key = 'openchronology:compare-selection';
/** The choice when session storage is unavailable (blocked, or a private window): page-long. */
let memorySelection = [];
/**
 * The chosen timelines' ids. What storage holds is checked, since anything could have written
 * it: only UUIDs are kept, and at most 8, the most any comparison holds (COMPARE_CEILING in
 * server/limits.mjs).
 */
function read() {
  try {
    return JSON.parse(sessionStorage.getItem(key) ?? '[]')
      .filter((v) => typeof v === 'string' && /^[a-f0-9-]{36}$/i.test(v))
      .slice(0, 8);
  } catch {
    return memorySelection;
  }
}
/**
 * The chosen ids and a function that replaces them, shared by every component that uses it.
 *
 * The choice starts empty and is read from storage in an effect, so the server's render and the
 * browser's first one agree. A change is written to storage, then announced with the `key`
 * event, which makes every user of the hook read it again: that is how a checkbox in a list
 * updates the tray at the top of the page.
 *
 * @returns {[string[], (next: string[]) => void]}
 */
function useSelection() {
  const [ids, setIds] = useState([]);
  useEffect(() => {
    const update = () => setIds(read());
    update();
    window.addEventListener(key, update);
    return () => window.removeEventListener(key, update);
  }, []);
  return [
    ids,
    (next) => {
      memorySelection = next;
      try {
        sessionStorage.setItem(key, JSON.stringify(next));
      } catch {}
      window.dispatchEvent(new Event(key));
    },
  ];
}
/**
 * The "Compare" checkbox on a timeline's card. Disabled, unless already checked, once `limit`
 * timelines are chosen.
 * @param {object} props
 * @param {string} props.id the timeline's id
 * @param {string} props.title its title, for the checkbox's accessible name
 * @param {number} [props.limit] how many the visitor may compare (lib/session.js)
 */
export function CompareCheckbox({ id, title, limit = 8 }) {
  const [ids, setIds] = useSelection();
  return (
    <label className="compare-checkbox">
      <input
        type="checkbox"
        aria-label={'Compare ' + title}
        checked={ids.includes(id)}
        disabled={ids.length >= limit && !ids.includes(id)}
        onChange={(e) =>
          setIds(e.target.checked ? [...ids, id] : ids.filter((value) => value !== id))
        }
      />{' '}
      Compare
    </label>
  );
}
/**
 * The tray above the lists: how many timelines are chosen, a link that opens them in /compare
 * (`?timelines=<id>,<id>…`) once there are two to `limit` of them, and a button to clear them.
 * A guest whose limit is below a signed-in account's (`userLimit`) is told that signing in
 * allows more.
 * @param {{limit?: number, userLimit?: number, signedIn?: boolean}} props
 */
export function CompareTray({ limit = 8, userLimit = 8, signedIn = true }) {
  const [ids, setIds] = useSelection();
  return (
    <div className="compare-tray">
      <span>
        {ids.length} selected for comparison (up to {limit}
        {!signedIn && limit < userLimit ? `; sign in to compare up to ${userLimit}` : ''})
      </span>
      {ids.length >= 2 && ids.length <= limit && (
        <a className="button primary" href={'/compare?timelines=' + ids.join(',')}>
          Compare timelines
        </a>
      )}
      {ids.length > 0 && <button onClick={() => setIds([])}>Clear selection</button>}
    </div>
  );
}
