// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * What shared links show: page descriptions, preview images, embeds and oEmbed. Previews,
 * embeds and oEmbed are for public timelines only and are read as a guest would, so they
 * never reveal a private timeline to whoever (or whatever crawler) fetches them.
 */
import 'server-only';
import {
  createPresenter,
  describeLabels,
  entityTags,
  imageURL,
  markdownText,
  printTimestamp,
  Q,
  validateInstalledPlugins,
  validatePresentation,
} from '../../dist/core.mjs';
import { TimelineLinks } from '../../server/timeline-links.mjs';
import { siteName } from '../../server/site.mjs';
import { timelineEntityLimit } from '../../server/indexnow.mjs';
import { profilePath, timelinePath } from '../../src/addresses.ts';

/** The platform's name in titles and link previews (PLATFORM_NAME, or OpenChronology). */
export { siteName };
/**
 * A page's title: what it is, then what it belongs to, then the site's name (#210), fitted to
 * what search results show (fitTitle, #469).
 */
export function pageTitle(...parts) {
  return fitTitle(parts);
}

/** How long a title search results show whole, in characters (#469). */
export const TITLE_LENGTH = 60;
/** Text cut between words to at most `length` characters, ending with "…" when cut. */
function cutWords(text, length) {
  if (text.length <= length) return text;
  const cut = text.slice(0, length - 1);
  const space = cut.lastIndexOf(' ');
  return (space > length / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:.·–—-]+$/, '') + '…';
}
/**
 * A title's head: its part before a subtitle (" · ", ": ", " — " or " – "), when that part
 * is long enough to name it alone; otherwise the whole title.
 */
export function titleHead(title) {
  const head = title.split(/ · |: | — | – /)[0];
  return head.length >= 12 ? head : title;
}
/**
 * A page's `<title>` that search results show whole (#469): its own title, then what it
 * belongs to (`parts` after the first), then the site's name, as long as it fits in
 * TITLE_LENGTH. Otherwise, in turn: what it belongs to by its head (titleHead); without the
 * site's name; that cut between words; its own title alone; and that cut. Link previews keep
 * the whole form (pageMetadata).
 * @param {string[]} parts the page's title and what it belongs to, nearest first
 */
export function fitTitle(parts) {
  const [own, ...rest] = parts.filter(Boolean),
    site = siteName();
  const fits = (list) => {
    const text = list.join(' · ');
    return text.length <= TITLE_LENGTH ? text : null;
  };
  const heads = rest.map(titleHead);
  // What it belongs to, cut to the room left after its own title.
  const room = TITLE_LENGTH - own.length - 3 * rest.length;
  const cut = rest.length === 1 && room >= 20 ? [cutWords(heads[0], room)] : null;
  return (
    fits([own, ...rest, site]) ??
    fits([own, ...heads, site]) ??
    fits([own, ...rest]) ??
    fits([own, ...heads]) ??
    (cut && fits([own, ...cut])) ??
    cutWords(own, TITLE_LENGTH)
  );
}

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
 * Up to `limit` of the moments and durations linked to an entity (#335), each `{kind, id,
 * first, last, title}`, in (kind, ID) order, read as `userId` (a guest when null). The empty
 * cursor comes before every link; given one, the store skips counting everything reachable,
 * which costs as much as the entity's whole connected group.
 */
export async function relatedOf(services, timeline, entity, userId = null, limit = 50) {
  const { related } = await services.store.query(timeline.id, userId, {
    kind: 'related',
    entity,
    limit,
    after: { kind: '', id: '' },
  });
  return related;
}
/**
 * Up to `limit` links of an entity (`{kind, id}`), or of the timeline as a whole (`entity`
 * null), to entities on other timelines or to other timelines (#422), read as `userId` (a guest
 * when null): only those to timelines they may read. Each `{id, timeline: {id, title, owner,
 * slug}, kind, entity, title, first, last}`; kind `timeline` is the other timeline as a whole.
 */
export async function linksOf(services, timeline, entity, userId = null, limit = 50) {
  const { links } = await new TimelineLinks(services.store, { limit: Infinity }).list(
    timeline.id,
    userId,
    entity ? { [entity.kind]: entity.id } : {},
    { limit },
  );
  return links;
}
/** The page a link (see linksOf) leads to: the other entity's, or the other timeline's. */
export function linkPath(link) {
  return link.kind === 'timeline'
    ? timelinePath(link.timeline)
    : sharedPath(link.timeline, { kind: link.kind, id: link.entity });
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
 * A time as the timeline displays it (its own presentation: calendar, units and so on), written
 * alone, at its own precision: "539 BCE" or "1861-03-04 CE 12:00 UTC" rather than a full
 * timestamp (#466). Its exact coordinate if the coordinate or the presentation cannot be read.
 * @param {object} timeline the timeline, with its `presentation`
 * @param {string} time an exact time coordinate as the store keeps it
 */
export function presentTime(timeline, time) {
  try {
    return createPresenter(timeline.presentation ?? undefined).alone(Q.parse(time));
  } catch {
    return time;
  }
}
/**
 * A time as ISO 8601, for structured data (#468): only on a timeline displayed as Gregorian
 * dates, at the precision the timeline writes it alone (`1975`, `1975-03`, `1975-03-14`, or a
 * timestamp with its offset, `1861-03-04T12:00:00-05:00`), with years counted astronomically
 * as ISO 8601 does (1 BCE is `0000`, 539 BCE `-0538`), from -9999 to 9999 and ending on a
 * finite decimal; null otherwise. HTML's `datetime` takes no years before 1, so callers that
 * write one check for the sign (htmlTime). `precision` (0 a year, 1 a month, 2 a day, 3 in
 * full) writes it at least that finely, as both ends of an interval must agree.
 */
export function isoTime(timeline, time, precision = 0) {
  const found = isoParts(timeline, time);
  if (!found) return null;
  const level = Math.max(found.level, precision);
  if (level === 3) return found.full;
  return found.parts.slice(1, level + 2).join('-');
}
/** isoTime's parts: the full timestamp, its year, month and day, and its precision. */
function isoParts(timeline, time) {
  try {
    const presentation = validatePresentation(timeline.presentation);
    if (presentation.mode !== 'gregorian') return null;
    const exact = Q.parse(time);
    const full = printTimestamp(
      exact.sub(Q.parse(presentation.origin)).div(Q.parse(presentation.scale)),
      presentation.offsetMinutes,
    );
    const parts = /^(-?\d{4})-(\d\d)-(\d\d)T\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.exec(
      full,
    );
    if (!parts) return null;
    // How the timeline writes it alone: a year, a month or a day, or a time of day too.
    const alone = createPresenter(presentation).alone(exact);
    const date = /^\d+(-\d\d)?(-\d\d)? B?CE$/.exec(alone);
    return { full, parts, level: !date ? 3 : date[2] ? 2 : date[1] ? 1 : 0 };
  } catch {
    return null;
  }
}
/** An interval's ends in ISO 8601, at the finer of their precisions, or null. */
export function isoInterval(timeline, first, last) {
  const [a, b] = [isoParts(timeline, first), isoParts(timeline, last)];
  if (!a || !b) return null;
  const level = Math.max(a.level, b.level);
  return `${isoTime(timeline, first, level)}/${isoTime(timeline, last, level)}`;
}
/** A time's ISO 8601 form for HTML's `datetime`, which takes only years from 1: or null. */
export function htmlTime(timeline, time) {
  const iso = isoTime(timeline, time);
  return iso && !iso.startsWith('-') && !iso.startsWith('0000') ? iso : null;
}
/**
 * Plain text, on one line, of at most `length` characters: tags are dropped and whitespace
 * collapsed, and a longer text is cut and ends with an ellipsis. For descriptions in
 * metadata and previews, which are plain text. The cut falls between words when one ends in
 * the last fifth of the room, so a word isn't broken (#466).
 */
export function excerpt(text, length = 200) {
  const line = String(text ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (line.length <= length) return line;
  let cut = line.slice(0, length - 1);
  const space = cut.lastIndexOf(' ');
  if (line[length - 1] !== ' ' && space >= length * 0.8) cut = cut.slice(0, space);
  return cut.replace(/[\s,;:.–—-]+$/, '') + '…';
}
/** How long a page's description is: about what search results show of it (#466). */
export const DESCRIPTION_LENGTH = 155;
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
/**
 * A timeline's description as plain text (#398): its Markdown's text without the markup, as an
 * excerpt of at most `length` characters.
 */
export function descriptionExcerpt(timeline, length = 200) {
  return excerpt(markdownText(String(timeline.description ?? '')), length);
}
/** A timeline's description for metadata: its own, as plain text, or else its facts. */
export function timelineDescription(timeline) {
  return descriptionExcerpt(timeline) || timelineFacts(timeline);
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
 * What an entity's page says of it besides its title, time and notes (#335), as its reader
 * does: its tags, the text its timeline's enabled plugins record (`details`, each `{label,
 * text}`) and their links, such as sources (`links`, each `{label, urls}`, https only).
 * Fields the plugins only draw with are left out.
 */
export function entityFacts(timeline, metadata = {}) {
  const tags = entityTags(metadata);
  const details = [],
    links = [],
    seen = new Set();
  let plugins = [];
  try {
    plugins = validateInstalledPlugins(timeline.plugins ?? []);
  } catch {}
  for (const plugin of plugins.filter((p) => p.enabled))
    for (const field of plugin.manifest.fields) {
      if (seen.has(field.metadataKey)) continue;
      seen.add(field.metadataKey);
      const value = metadata[field.metadataKey];
      if (field.kind === 'text' || field.kind === 'multiline') {
        const text = typeof value === 'string' ? value.trim() : '';
        if (text) details.push({ label: field.label, text: text.slice(0, 4000) });
      } else if (field.kind === 'links' && Array.isArray(value)) {
        const urls = value.slice(0, 100).filter((url) => imageURL(url));
        if (urls.length) links.push({ label: field.label, urls });
      }
    }
  return { tags, details, links };
}
/**
 * Whether search engines may index a timeline's moment and duration pages: it is public and
 * has no sensitive-content labels, whose previews show nothing of what is in it.
 */
export function entitiesIndexable(timeline) {
  return timeline.visibility === 'public' && !timeline.labels?.length;
}
/** A moment's or duration's description: its time, then its notes as plain text, if any. */
function entityDescription(time, notes) {
  const text = markdownText(String(notes ?? '')).trim();
  return text ? excerpt(`${time}. ${text}`, DESCRIPTION_LENGTH) : time;
}
/**
 * Whether a moment's or duration's page is for search engines (#467): its timeline's are
 * (entitiesIndexable), the timeline isn't too large for its entities to be listed, and the
 * event is listed by its timeline's setting and notes (server/event-listing.mjs), as the
 * sitemap lists it. If that can't be read, as before: indexed.
 * @param {{store: object}} services
 * @param {object} timeline its timeline
 * @param {{kind: 'moment'|'duration', id: string}} entity
 */
export async function eventListed(services, timeline, entity) {
  const limit = timelineEntityLimit();
  if (!entitiesIndexable(timeline) || timeline.comparison) return false;
  if (Number(timeline.event_count ?? 0) > limit) return false;
  try {
    return (await services.store.listedOf(timeline.id, [entity], limit)).length > 0;
  } catch {
    return true;
  }
}
/**
 * A moment's or duration's page metadata (see pageMetadata): its title and the timeline's,
 * and its time and notes, as plain text without their Markdown, cut to what search results
 * show (#466); for a timeline with sensitive-content labels, the labels instead of its notes,
 * and not for search engines.
 * @param {object} timeline its timeline
 * @param {{kind: 'moment'|'duration', id: string}} entity which entity
 * @param {string} title its title
 * @param {string} time its time (or extent) as the timeline displays it
 * @param {string} [notes] its notes
 * @param {{listed?: boolean}} [options] `listed` false keeps it from search engines
 *   (eventListed)
 */
export function entityMetadata(timeline, entity, title, time, notes, { listed = true } = {}) {
  const labelled = timeline.labels?.length > 0;
  return pageMetadata(
    timeline,
    sharedPath(timeline, entity),
    [title, timelineTitle(timeline)],
    labelled
      ? `Sensitive content: ${describeLabels(timeline.labels).toLowerCase()}`
      : entityDescription(time, notes),
    null,
    // An event its timeline doesn't list still leads to those it relates to and its timeline.
    { index: entitiesIndexable(timeline) && listed, follow: entitiesIndexable(timeline) },
  );
}
/**
 * A moment's or duration's schema.org description (#335), for a JSON-LD script: a
 * `CreativeWork` covering its time, as an ISO 8601 date or interval on a timeline of Gregorian
 * dates (isoTime), and none otherwise, as schema.org reads only ISO 8601 there (#468); part of
 * the timeline, by its owner. Not an
 * `Event`: search engines take those for happenings to attend, and want a place and tickets.
 * Null where its page is not for search engines.
 * @param {object} timeline its timeline
 * @param {{kind: 'moment'|'duration', id: string, title: string, notes?: string,
 *   first: string, last: string, tags?: string[]}} entity it, with its exact times
 */
export function entityStructuredData(timeline, entity) {
  if (!entitiesIndexable(timeline)) return null;
  const origin = siteOrigin(),
    duration = entity.kind === 'duration';
  const coverage = duration
    ? isoInterval(timeline, entity.first, entity.last)
    : isoTime(timeline, entity.first);
  const description = excerpt(markdownText(String(entity.notes ?? '')), 500);
  return {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    name: entity.title,
    url: origin + sharedPath(timeline, entity),
    ...(description ? { description } : {}),
    ...(coverage ? { temporalCoverage: coverage } : {}),
    ...(entity.tags?.length ? { keywords: entity.tags.join(', ') } : {}),
    isPartOf: {
      '@type': 'CreativeWork',
      name: timelineTitle(timeline),
      url: origin + timelinePath(timeline),
      ...(timeline.owner
        ? {
            author: {
              '@type': 'Person',
              name: '@' + timeline.owner,
              url: origin + profilePath(timeline.owner),
            },
          }
        : {}),
    },
  };
}
/**
 * A timeline's schema.org description (#428), for a JSON-LD script on its page: a
 * `CreativeWork` with its title, its description as text, its own image, its author, its tags
 * and when it was made and changed. Null where its page is not for search engines (as for its
 * moments: private or labelled).
 * @param {object} timeline the timeline
 */
export function timelineStructuredData(timeline) {
  if (!entitiesIndexable(timeline) || timeline.comparison) return null;
  const origin = siteOrigin(),
    image = previewOf(timeline),
    description = descriptionExcerpt(timeline, 500);
  const date = (value) => (value ? new Date(value).toISOString() : null);
  return {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    name: timelineTitle(timeline),
    url: origin + timelinePath(timeline),
    ...(description ? { description } : {}),
    ...(image ? { image: image.url } : {}),
    ...(timeline.tags?.length ? { keywords: timeline.tags.join(', ') } : {}),
    ...(date(timeline.created_at) ? { dateCreated: date(timeline.created_at) } : {}),
    ...(date(timeline.updated_at) ? { dateModified: date(timeline.updated_at) } : {}),
    ...(timeline.owner
      ? {
          author: {
            '@type': 'Person',
            name: '@' + timeline.owner,
            url: origin + profilePath(timeline.owner),
          },
        }
      : {}),
  };
}
/**
 * Structured data as the text of a `<script type="application/ld+json">`: JSON with every
 * `<` escaped, so no title or note can close the script.
 */
export function jsonLd(data) {
  return JSON.stringify(data).replace(/</g, '\\u003c');
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
 * The image a link to the timeline previews with (#339): its own image, when it is public and
 * unlabelled (a labelled timeline previews as its title and labels alone, #115); else null,
 * and the drawn preview (lib/preview-image.jsx) stands in.
 * @returns {{url: string, alt: string, width?: number, height?: number}|null}
 */
export function previewOf(timeline) {
  return timeline?.image && timeline.visibility === 'public' && !timeline.labels?.length
    ? timeline.image
    : null;
}
/** The site's own link-preview image's address, on the site (platform/icons/). */
export const SITE_PREVIEW_PATH = '/social-preview.jpg';
/**
 * The image links to the site's own pages preview with (#390): a screenshot of a large
 * timeline in the editor, for pages with no image of their own (a timeline's page draws one).
 * @returns {{url: string, alt: string, width: number, height: number}}
 */
export function sitePreview() {
  return {
    url: siteOrigin() + SITE_PREVIEW_PATH,
    width: 1200,
    height: 630,
    alt: 'The timeline of ancient Rome in the OpenChronology editor, from 171 BCE to 225 CE: its battles, emperors and dynasties along one line.',
  };
}
/**
 * A page's metadata (Next.js's `generateMetadata` result): title, description, canonical
 * address, link previews (Open Graph and Twitter cards) and oEmbed discovery.
 *
 * Only a public timeline's pages advertise oEmbed, since /api/oembed answers for public
 * timelines only; the others are marked noindex, as is a page `index` false keeps from
 * search engines.
 *
 * @param {object} timeline the timeline the page is about (its `visibility` decides)
 * @param {string} path the page's path, made absolute with siteOrigin()
 * @param {string|string[]} title the page's own title, or it and what it belongs to (an
 *   event's, its timeline's), fitted to search results (fitTitle) and whole in link previews
 * @param {string} description its plain-text description
 * @param {{url: string, alt: string, width?: number, height?: number}|null} [image] the
 *   preview image (previewOf) in place of the page's drawn one (its opengraph-image)
 * @param {{index?: boolean, follow?: boolean}} [options] `index` false asks search engines not
 *   to index it, and not to follow its links unless `follow`
 */
export function pageMetadata(
  timeline,
  path,
  title,
  description,
  image = null,
  { index = true, follow = index } = {},
) {
  const origin = siteOrigin(),
    url = origin + path,
    shown = timeline.visibility === 'public',
    parts = [title].flat(),
    whole = parts.filter(Boolean).join(' · ');
  // Linked where it is hosted, as everywhere (docs/images.md); given here, it takes the place
  // of the drawn image Next.js would otherwise name.
  const images = image
    ? {
        images: [
          {
            url: image.url,
            ...(image.alt ? { alt: image.alt } : {}),
            ...(image.width ? { width: image.width, height: image.height } : {}),
          },
        ],
      }
    : {};
  return {
    title: fitTitle(parts),
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
    ...(shown && index ? {} : { robots: { index: false, follow: shown && follow } }),
    openGraph: {
      type: 'website',
      siteName: siteName(),
      locale: 'en_US',
      title: whole,
      description,
      url,
      ...images,
    },
    twitter: { card: 'summary_large_image', title: whole, description, ...images },
  };
}
/**
 * A page of the site's own (not a timeline's) metadata: its title before the site's name
 * (unless the title already names the site), its description, its canonical address and link
 * previews with the site's image (sitePreview), as pageMetadata gives a timeline's pages,
 * without oEmbed.
 * @param {string} path the page's path, made absolute with siteOrigin()
 * @param {string} title the page's own title
 * @param {string} description its plain-text description
 */
export function sitePageMetadata(path, title, description) {
  const url = siteOrigin() + path,
    images = [sitePreview()];
  return {
    title: title.includes(siteName()) ? title : pageTitle(title),
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      siteName: siteName(),
      locale: 'en_US',
      title,
      description,
      url,
      images,
    },
    twitter: { card: 'summary_large_image', title, description, images },
  };
}
/**
 * A page of the site's own as schema.org JSON-LD (#379): a `WebPage` of the site's
 * `WebSite`, with what else describes it (`about`, `audience`) over it.
 * @param {string} path the page's path
 * @param {string} title its title
 * @param {string} description its description
 * @param {object} [more] further properties
 */
export function webPageData(path, title, description, more = {}) {
  const origin = siteOrigin();
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: title,
    description,
    url: origin + path,
    isPartOf: { '@type': 'WebSite', name: siteName(), url: origin + '/' },
    ...more,
  };
}

/** A count for a description: exact under 1,000, else its first two digits and "+". */
export function roughCount(n) {
  const value = Number(n);
  if (value < 1000) return value.toLocaleString('en');
  const step = 10 ** (Math.floor(Math.log10(value)) - 1);
  return (Math.floor(value / step) * step).toLocaleString('en') + '+';
}
/** "1 timeline" or "65 timelines", with roughCount. */
const counted = (n, one, many) => `${roughCount(n)} ${Number(n) === 1 ? one : many}`;
/**
 * Explore's description (#471): what it searches, and how much of it there is: the public
 * timelines and their moments. Without a database (`pool`), what it does alone.
 * @param {import('pg').Pool|null} pool
 */
export async function exploreDescription(pool) {
  const fallback =
    'Search public timelines and their dated events by title and notes, or browse them by tag, stars and popularity.';
  try {
    if (!pool) return fallback;
    const { rows } = await pool.query(
      `SELECT count(*) AS timelines, coalesce(sum(event_count),0) AS moments FROM oc_timelines
      WHERE visibility='public' AND comparison IS NULL`,
    );
    const { timelines, moments } = rows[0];
    if (!Number(timelines)) return fallback;
    return excerpt(
      `Search ${counted(timelines, 'public timeline', 'public timelines')} and their ${counted(moments, 'dated event', 'dated events')} by title and notes, or browse them by tag, stars and popularity.`,
      DESCRIPTION_LENGTH,
    );
  } catch {
    return fallback;
  }
}
/**
 * A profile's description (#471): how many public timelines the account has, and the
 * titles of up to three, its most starred (none with sensitive-content labels).
 * @param {import('pg').Pool|null} pool
 * @param {string} username
 */
export async function profileDescription(pool, username) {
  const fallback = `Public timelines and favorites of @${username} on ${siteName()}.`;
  try {
    if (!pool) return fallback;
    const { rows } = await pool.query(
      `SELECT count(*) AS total,
        (array_agg(t.title ORDER BY t.star_count DESC, t.updated_at DESC)
          FILTER (WHERE t.content_labels='{}' AND t.moderator_labels='{}' AND t.title<>''))[1:3] AS titles
      FROM oc_timelines t JOIN oc_users u ON u.id=t.owner_id
      WHERE u.username=$1 AND NOT u.is_disabled AND t.visibility='public' AND t.comparison IS NULL`,
      [username],
    );
    const { total, titles } = rows[0];
    if (!Number(total)) return fallback;
    const named = (titles ?? []).map((t) => titleHead(t));
    return excerpt(
      `@${username} has ${counted(total, 'public timeline', 'public timelines')} on ${siteName()}` +
        (named.length ? `, including ${named.join(', ')}.` : '.'),
      DESCRIPTION_LENGTH,
    );
  } catch {
    return fallback;
  }
}
