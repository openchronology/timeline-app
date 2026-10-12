// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * What shared links show: page descriptions, preview images, embeds and oEmbed. Previews,
 * embeds and oEmbed are for public timelines only and are read as a guest would, so they
 * never reveal a private timeline to whoever (or whatever crawler) fetches them.
 */
import 'server-only';
import { createPresenter, Q } from '../../dist/core.mjs';

export const TIMELINE_ID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export const ENTITY_ID = /^[A-Za-z0-9_.:-]{1,128}$/;
export const SITE_NAME = 'OpenChronology';

/** The platform's public origin, for absolute links. */
export function siteOrigin() {
  return (process.env.APP_ORIGIN || 'http://localhost:3000').replace(/\/+$/, '');
}
/** A route parameter as written in the address (`moment%3A1` is `moment:1`). */
export function entityParam(value) {
  try {
    const id = decodeURIComponent(value);
    return ENTITY_ID.test(id) ? id : null;
  } catch {
    return null;
  }
}
/** A timeline as guests see it, with its first and last times: null unless it is public. */
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
export async function momentOf(services, timeline, id, userId = null) {
  const { event } = await services.store.query(timeline.id, userId, { kind: 'moment', id });
  return event;
}
export async function durationOf(services, timeline, id, userId = null) {
  const { duration, band } = await services.store.query(timeline.id, userId, {
    kind: 'duration',
    id,
  });
  return duration && band ? { duration, band } : null;
}
/** The first moments of a timeline in time order. */
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
/** A time as the timeline displays it, or its exact coordinate if that fails. */
export function presentTime(timeline, time) {
  try {
    return createPresenter(timeline.presentation ?? undefined).print(Q.parse(time));
  } catch {
    return time;
  }
}
/** Plain text, on one line, of at most `length` characters. */
export function excerpt(text, length = 200) {
  const line = String(text ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return line.length > length ? line.slice(0, length - 1).trimEnd() + '…' : line;
}
export function timelineTitle(timeline) {
  return timeline.title?.trim() || 'Untitled timeline';
}
/** How many moments, over what time, and whose: the line under a timeline's title. */
export function timelineFacts(timeline) {
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
export function timelineDescription(timeline) {
  return excerpt(timeline.description) || timelineFacts(timeline);
}
export function momentTitle(event) {
  return excerpt(event.metadata?.title, 120) || 'Untitled moment';
}
export function durationTitle(duration) {
  return excerpt(duration.metadata?.title, 120) || 'Untitled duration';
}
/** The page to share for a timeline, or one of its moments or durations. */
export function sharedPath(timeline, entity) {
  const base = '/timelines/' + timeline;
  if (!entity) return base;
  return `${base}/${entity.kind === 'moment' ? 'moments' : 'durations'}/${encodeURIComponent(entity.id)}`;
}
const escape = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
/** The HTML that embeds a public timeline (see /embed/<id>). */
export function embedCode(src, title, width = '100%', height = 480) {
  return `<iframe src="${escape(src)}" title="${escape(title)}" width="${escape(width)}" height="${escape(height)}" style="border:0;max-width:100%" loading="lazy" allow="fullscreen"></iframe>`;
}

/** A page's metadata: title, description, address, link previews and oEmbed discovery. */
export function pageMetadata(timeline, path, title, description) {
  const origin = siteOrigin(),
    url = origin + path,
    shown = timeline.visibility === 'public';
  return {
    title: `${title} · ${SITE_NAME}`,
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
    openGraph: { type: 'website', siteName: SITE_NAME, locale: 'en_US', title, description, url },
    twitter: { card: 'summary_large_image', title, description },
  };
}
