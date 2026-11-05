// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Links into a timeline. A link's fragment names what to look at on the timeline's page:
 * `#moment/<id>`, `#duration/<id>`, `#search/<words>` or `#view/<left>..<right>` (exact
 * coordinates). The same fragments follow `/timelines/<id>`, `/embed/<id>` and the editor's
 * own `#timeline/<id>/…`.
 */
import { Rational as Q } from 'rational-ordered-map';
import { parseNumber } from './numeric.js';
import { TIMELINE_UUID, timelineAddress, timelinePath } from './addresses.js';

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
 * fragments of the timeline's page, at its address (#148).
 */
export function sharePath(
  timeline: Parameters<typeof timelinePath>[0],
  link: TimelineLink | null,
): string {
  const base = timelinePath(timeline);
  if (!link) return base;
  if (link.kind === 'moment') return `${base}/moments/${encodeURIComponent(link.id)}`;
  if (link.kind === 'duration') return `${base}/durations/${encodeURIComponent(link.id)}`;
  return base + '#' + linkFragment(link);
}

/** What a pasted address names (addressedEntity): its timeline, and a moment or duration. */
export interface AddressedEntity {
  timeline: { id?: string; owner?: string; name?: string };
  entity: { kind: 'moment' | 'duration'; id: string } | null;
}
/**
 * What a page address someone pasted names (#422), to link to it: its timeline, by ID or by
 * owner and name (which the server looks up), and the moment or duration it opens at, if any.
 * It reads a timeline's pages (`/<owner>/<slug>`, `/timelines/<id>`, and their `/moments/<id>`
 * and `/durations/<id>`), embeds (`/embed/<id>`), the editor's `#timeline/<id>/…`, and a link
 * fragment on any of them; a path alone, or a full address on `origin` when it is given. Null
 * for anything else, such as another site's address or another page of a timeline.
 */
export function addressedEntity(text: string, origin?: string): AddressedEntity | null {
  let url: URL;
  try {
    url = new URL(text.trim(), origin ?? 'http://localhost');
  } catch {
    return null;
  }
  if (origin && url.origin !== new URL(origin).origin) return null;
  const fragment = (hash: string) => {
    const link = parseLink(hash);
    return link && (link.kind === 'moment' || link.kind === 'duration')
      ? { kind: link.kind, id: link.id }
      : null;
  };
  // The editor's own address of a server timeline, with what it opens at after it.
  const editor = /^#timeline\/([a-f0-9-]+)(?:\/(.+))?$/i.exec(url.hash);
  if (editor)
    return TIMELINE_UUID.test(editor[1])
      ? { timeline: { id: editor[1].toLowerCase() }, entity: fragment(editor[2] ?? '') }
      : null;
  const path = url.pathname.replace(/\/+$/, '');
  const embed = /^\/embed\/([^/]+)$/.exec(path);
  if (embed)
    return TIMELINE_UUID.test(embed[1])
      ? { timeline: { id: embed[1].toLowerCase() }, entity: fragment(url.hash) }
      : null;
  const address = timelineAddress(path);
  if (!address) return null;
  const { rest, ...timeline } = address;
  if (!rest) return { timeline, entity: fragment(url.hash) };
  const page = /^\/(moments|durations)\/([^/]+)$/.exec(rest);
  if (!page) return null;
  let id: string;
  try {
    id = decodeURIComponent(page[2]);
  } catch {
    return null;
  }
  return ENTITY.test(id)
    ? { timeline, entity: { kind: page[1] === 'moments' ? 'moment' : 'duration', id } }
    : null;
}
