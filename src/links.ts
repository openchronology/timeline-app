// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Links into a timeline. A link's fragment names what to look at on the timeline's page:
 * `#moment/<id>`, `#duration/<id>`, `#search/<words>` or `#view/<left>..<right>` (exact
 * coordinates). The same fragments follow `/timelines/<id>`, `/embed/<id>` and the editor's
 * own `#timeline/<id>/…`.
 */
import { Rational as Q } from 'rational-ordered-map';
import { parseNumber } from './numeric.js';

export type TimelineLink =
  | { kind: 'moment'; id: string }
  | { kind: 'duration'; id: string }
  | { kind: 'search'; text: string }
  | { kind: 'view'; left: Q; right: Q };

const ENTITY = /^[A-Za-z0-9_.:-]{1,128}$/;

/** Reads a link fragment, with or without its `#`; null when it names nothing. */
export function parseLink(fragment: string): TimelineLink | null {
  const text = fragment.replace(/^#/, '');
  const slash = text.indexOf('/');
  if (slash < 0) return null;
  const kind = text.slice(0, slash);
  let rest: string;
  try {
    rest = decodeURIComponent(text.slice(slash + 1));
  } catch {
    return null;
  }
  if ((kind === 'moment' || kind === 'duration') && ENTITY.test(rest)) return { kind, id: rest };
  if (kind === 'search' && rest.trim() && rest.length <= 200) return { kind, text: rest };
  if (kind === 'view') {
    const at = rest.indexOf('..');
    if (at < 0 || rest.length > 4096) return null;
    try {
      const left = parseNumber(rest.slice(0, at)),
        right = parseNumber(rest.slice(at + 2));
      return right.compare(left) > 0 ? { kind, left, right } : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** A link's fragment, without its `#`. */
export function linkFragment(link: TimelineLink): string {
  switch (link.kind) {
    case 'moment':
    case 'duration':
      return `${link.kind}/${encodeURIComponent(link.id)}`;
    case 'search':
      return `search/${encodeURIComponent(link.text)}`;
    case 'view':
      return `view/${link.left.toString()}..${link.right.toString()}`;
  }
}

/**
 * The address to share for a link: moments and durations have pages of their own, which
 * social sites and search engines read (they ignore fragments); searches and views are
 * fragments of the timeline's page.
 */
export function sharePath(timeline: string, link: TimelineLink | null): string {
  const base = '/timelines/' + timeline;
  if (!link) return base;
  if (link.kind === 'moment') return `${base}/moments/${encodeURIComponent(link.id)}`;
  if (link.kind === 'duration') return `${base}/durations/${encodeURIComponent(link.id)}`;
  return base + '#' + linkFragment(link);
}
