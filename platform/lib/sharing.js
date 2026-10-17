// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * What shared links show: page descriptions, preview images, embeds and oEmbed. Previews,
 * embeds and oEmbed are for public timelines only and are read as a guest would, so they
 * never reveal a private timeline to whoever (or whatever crawler) fetches them.
 */
import 'server-only';
import { createPresenter, Q } from '../../dist/core.mjs';
import { siteName } from '../../server/site.mjs';
import { timelinePath } from '../../src/addresses.ts';

/** The platform's name in titles and link previews (PLATFORM_NAME, or OpenChronology). */
export { siteName };

/** A timeline's id, a UUID, as it appears in a `/timelines/<id>` address. */
export const TIMELINE_ID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
/**
 * A moment's or duration's id: up to 128 letters, digits and `_ . : -`. Checked before an id
 * from an address reaches the store, so a malformed one is a 404 rather than a query.
 */
export const ENTITY_ID = /^[A-Za-z0-9_.:-]{1,128}$/;

/**
 * The platform's public origin (APP_ORIGIN, or http://localhost:3000 in development), without
 * a trailing slash, for absolute links: canonical addresses, previews, oEmbed and embeds.
 */
export function siteOrigin() {
  return (process.env.APP_ORIGIN || 'http://localhost:3000').replace(/\/+$/, '');
}
/**
 * A route parameter as written in the address (`moment%3A1` is `moment:1`): the decoded id,
 * or null when it is badly encoded or not a valid entity id (see ENTITY_ID).
 */
export function entityParam(value) {
  try {
    const id = decodeURIComponent(value);
    return ENTITY_ID.test(id) ? id : null;
  } catch {
    return null;
  }
}
/**
 * A timeline as guests see it, with its first and last times: null unless it is public.
 *
 * Reads the store's metadata as no one (user id null), so the store's own access rules
 * decide; a timeline the store refuses (403) or does not have (404) is null too, rather than
 * an error, so that a preview, embed or oEmbed request cannot tell a private timeline from a
 * missing one. Other errors (the database being down) are thrown.
 *
 * @param {object} services the platform's services (its `store` is needed)
 * @param {string} id the timeline's id, checked against TIMELINE_ID first
 */
export async function publicTimeline(services, id) {
  if (!TIMELINE_ID.test(id ?? '') || !services?.store) return null;
  try {
    const timeline = await services.store.metadata(id, null);
    return timeline.visibility === 'public' ? timeline : null;
  } catch (error) {
    if (error.status === 403 || error.status === 404) return null;
    throw error;
  }
}
/**
 * One moment of a timeline, read through the store's query as `userId` (a guest when null),
 * so it is subject to the same access rules as the timeline itself.
 * @returns {Promise<object|undefined>} the moment, or nothing when it has no such moment
 */
export async function momentOf(services, timeline, id, userId = null) {
  const { event } = await services.store.query(timeline.id, userId, { kind: 'moment', id });
  return event;
}
/**
 * One duration of a timeline, read as `userId` (a guest when null), with the band it lies in.
 * @returns {Promise<{duration: object, band: object}|null>} null when either is missing
 */
export async function durationOf(services, timeline, id, userId = null) {
  const { duration, band } = await services.store.query(timeline.id, userId, {
    kind: 'duration',
    id,
  });
  return duration && band ? { duration, band } : null;
}
/**
 * The first moments of a timeline in time order, at most `limit` of them (for previews):
 * an unbounded range from the start, read as `userId` (a guest when null).
 */
export async function firstMoments(services, timeline, limit, userId = null) {
  const { events } = await services.store.query(timeline.id, userId, {
    kind: 'events',
    lower: null,
    upper: null,
    limit,
    after: null,
  });
  return events;
}
/**
 * A time as the timeline displays it (its own presentation: calendar, units and so on), or
 * its exact coordinate if the coordinate or the presentation cannot be read.
 * @param {object} timeline the timeline, with its `presentation`
 * @param {string} time an exact time coordinate as the store keeps it
 */
export function presentTime(timeline, time) {
  try {
    return createPresenter(timeline.presentation ?? undefined).print(Q.parse(time));
  } catch {
    return time;
  }
}
/**
 * Plain text, on one line, of at most `length` characters: tags are dropped and whitespace
 * collapsed, and a longer text is cut and ends with an ellipsis. For descriptions in
 * metadata and previews, which are plain text.
 */
export function excerpt(text, length = 200) {
  const line = String(text ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return line.length > length ? line.slice(0, length - 1).trimEnd() + '…' : line;
}
/** A timeline's title, or "Untitled timeline" when it has none. */
export function timelineTitle(timeline) {
  return timeline.title?.trim() || 'Untitled timeline';
}
/** How many moments, over what time, and whose: the line under a timeline's title. */
export function timelineFacts(timeline) {
  // Counted as a bigint (a Postgres bigint arrives as a string) so a large count stays exact.
  const count = BigInt(timeline.event_count ?? 0);
  const parts = [
    timeline.comparison
      ? 'A comparison of timelines'
      : `${count.toLocaleString('en')} ${count === 1n ? 'moment' : 'moments'}`,
  ];
  if (timeline.first && timeline.last && count > 1n)
    parts.push(
      `${presentTime(timeline, timeline.first)} – ${presentTime(timeline, timeline.last)}`,
    );
  if (timeline.owner) parts.push('by @' + timeline.owner);
  return parts.join(' · ');
}
/** A timeline's description for metadata: its own, as an excerpt, or else its facts. */
export function timelineDescription(timeline) {
  return excerpt(timeline.description) || timelineFacts(timeline);
}
/** A moment's title, as a short excerpt, or "Untitled moment". */
export function momentTitle(event) {
  return excerpt(event.metadata?.title, 120) || 'Untitled moment';
}
/** A duration's title, as a short excerpt, or "Untitled duration". */
export function durationTitle(duration) {
  return excerpt(duration.metadata?.title, 120) || 'Untitled duration';
}
/**
 * The page to share for a timeline (#148), or one of its moments or durations: the
 * timeline's own address (`/<owner>/<slug>`) followed by `/moments/<id>` or `/durations/<id>`.
 * @param {object} timeline the timeline
 * @param {{kind: 'moment'|'duration', id: string}} [entity] one of its moments or durations
 */
export function sharedPath(timeline, entity) {
  const base = timelinePath(timeline);
  if (!entity) return base;
  return `${base}/${entity.kind === 'moment' ? 'moments' : 'durations'}/${encodeURIComponent(entity.id)}`;
}
/** Text escaped for an HTML attribute value (the embed code is HTML the reader copies). */
const escape = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
/**
 * The HTML that embeds a public timeline (see /embed/<id>): an iframe, lazily loaded and
 * allowed to go fullscreen, with every value escaped.
 * @param {string} src the embed's address
 * @param {string} title the frame's accessible title
 */
export function embedCode(src, title, width = '100%', height = 480) {
  return `<iframe src="${escape(src)}" title="${escape(title)}" width="${escape(width)}" height="${escape(height)}" style="border:0;max-width:100%" loading="lazy" allow="fullscreen"></iframe>`;
}

/**
 * A page's metadata (Next.js's `generateMetadata` result): title, description, canonical
 * address, link previews (Open Graph and Twitter cards) and oEmbed discovery.
 *
 * Only a public timeline's pages advertise oEmbed, since /api/oembed answers for public
 * timelines only; the others are marked noindex.
 *
 * @param {object} timeline the timeline the page is about (its `visibility` decides)
 * @param {string} path the page's path, made absolute with siteOrigin()
 * @param {string} title the page's own title, before the site's name
 * @param {string} description its plain-text description
 */
export function pageMetadata(timeline, path, title, description) {
  const origin = siteOrigin(),
    url = origin + path,
    shown = timeline.visibility === 'public';
  return {
    title: `${title} · ${siteName()}`,
    description,
    alternates: {
      canonical: url,
      ...(shown
        ? {
            types: {
              'application/json+oembed': `${origin}/api/oembed?format=json&url=${encodeURIComponent(url)}`,
            },
          }
        : {}),
    },
    // Private pages are for their members: not for search engines.
    ...(shown ? {} : { robots: { index: false, follow: false } }),
    openGraph: { type: 'website', siteName: siteName(), locale: 'en_US', title, description, url },
    twitter: { card: 'summary_large_image', title, description },
  };
}
