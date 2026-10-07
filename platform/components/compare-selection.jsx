// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
'use client';
import { useEffect, useState } from 'react';
const key = 'openchronology:compare-selection';
let memorySelection = [];
function read() {
  try {
    return JSON.parse(sessionStorage.getItem(key) ?? '[]')
      .filter((v) => typeof v === 'string' && /^[a-f0-9-]{36}$/i.test(v))
      .slice(0, 8);
  } catch {
    return memorySelection;
  }
}
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
export function CompareCheckbox({ id, title }) {
  const [ids, setIds] = useSelection();
  return (
    <label className="compare-checkbox">
      <input
        type="checkbox"
        aria-label={'Compare ' + title}
        checked={ids.includes(id)}
        disabled={ids.length >= 8 && !ids.includes(id)}
        onChange={(e) =>
          setIds(e.target.checked ? [...ids, id] : ids.filter((value) => value !== id))
        }
      />{' '}
      Compare
    </label>
  );
}
export function CompareTray() {
  const [ids, setIds] = useSelection();
  return (
    <div className="compare-tray">
      <span>{ids.length} selected for comparison (up to 8)</span>
      {ids.length >= 2 && (
        <a className="button primary" href={'/compare?timelines=' + ids.join(',')}>
          Compare timelines
        </a>
      )}
      {ids.length > 0 && <button onClick={() => setIds([])}>Clear selection</button>}
    </div>
  );
}
