// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { HttpError } from './store.mjs';
import { validateDocument } from '../dist/core.mjs';
function same(a, b) {
  return canonical(a) === canonical(b);
}
function canonical(value) {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return (
    '{' +
    Object.keys(value)
      .sort()
      .map((k) => JSON.stringify(k) + ':' + canonical(value[k]))
      .join(',') +
    '}'
  );
}
export function rebaseDocument(base, proposal, upstream) {
  const result = { ...upstream };
  const conflicts = [];
  const merge = (a, b, c, key, fields = false) => {
    if (same(a, b)) return c;
    if (same(a, c) || same(b, c)) return b;
    const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
    if (fields && object(a) && object(b) && object(c)) {
      const result = Object.create(null);
      for (const k of new Set([...Object.keys(a), ...Object.keys(b), ...Object.keys(c)])) {
        const value = merge(a[k], b[k], c[k], key + '.' + k, true);
        if (value !== undefined) result[k] = value;
      }
      return result;
    }
    conflicts.push(key);
    return c;
  };
  for (const key of ['title', 'description', 'tags', 'presentation', 'plugins', 'assets']) {
    const value = merge(base[key], proposal[key], upstream[key], key);
    if (value === undefined) delete result[key];
    else result[key] = value;
  }
  const maps = [base, proposal, upstream].map((d) => new Map(d.events.map((e) => [e.id, e])));
  const ids = new Set(maps.flatMap((m) => [...m.keys()]));
  result.events = [];
  for (const id of ids) {
    const event = merge(...maps.map((m) => m.get(id)), 'moment ' + id, true);
    if (event) result.events.push(event);
  }
  if (conflicts.length)
    throw Object.assign(
      new HttpError(
        409,
        'Rebase conflicts: ' +
          conflicts.slice(0, 10).join(', ') +
          '. Resolve these fields explicitly; both saved versions have been retained.',
      ),
      { conflicts },
    );
  return validateDocument(result);
}
