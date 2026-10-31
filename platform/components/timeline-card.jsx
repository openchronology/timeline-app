// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// A timeline's card in the dashboard's and profiles' lists (#338): its title, owner, when it
// last changed, badges, an excerpt of its description, the span and shape of its moments,
// tags that filter the list, and its stars, size, compare checkbox and fork.
import Link from 'next/link';
import StarButton from './star-button.jsx';
import TimelineCardImage from './timeline-image.jsx';
import { MarkdownExcerpt } from './markdown.jsx';
import { describeLabels } from '../../src/content-labels.ts';
import { CompareCheckbox } from './compare-selection.jsx';
import { profilePath, timelinePath } from '../../src/addresses.ts';
/** How many of a timeline's tags its card shows; the rest are counted. */
const SHOWN_TAGS = 6;
/** A date as the cards show it: the same text on the server and in every browser. */
export const cardDate = (value) =>
  new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
/**
 * A strip of bars, one for each part of the timeline's span, as tall as that part is dense
 * with moments (the search result's `shape`). Drawn with SVG attributes, which the content
 * security policy allows where inline styles are not.
 */
export function TimelineShape({ shape }) {
  return (
    <svg
      className="timeline-shape-bars"
      viewBox={`0 0 ${shape.length} 10`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <rect className="timeline-shape-axis" x="0" y="9.6" width={shape.length} height="0.4" />
      {shape.map((value, i) =>
        value > 0 ? (
          <rect
            key={i}
            x={i + 0.1}
            width="0.8"
            y={10 - Math.max(1, value / 10)}
            height={Math.max(1, value / 10)}
          />
        ) : null,
      )}
    </svg>
  );
}
/**
 * Where a timeline's image goes, above its title: its own image (#339) or a placeholder of the
 * same shape, so every list's cards show it in the same place. The list layout leaves it out.
 */
export function TimelineCardMedia({ timeline }) {
  return <TimelineCardImage timeline={timeline} />;
}
/**
 * One timeline's card.
 *
 * @param {object} props
 * @param {object} props.timeline a search result (server/collaboration.mjs searchTimelines)
 * @param {(tag: string) => string} props.tagHref the address of the list filtered by a tag
 * @param {(event: MouseEvent, tag: string) => void} [props.onTag] filters in place (JavaScript)
 * @param {string} [props.activeTag] the tag the list is filtered by
 * @param {boolean} [props.guest] the visitor is not signed in
 * @param {number} [props.compareLimit]
 * @param {boolean} [props.compare] whether it has a Compare checkbox: not where the page has
 *   no tray to compare from (the landing pages, #379)
 */
export default function TimelineCard({
  timeline: t,
  tagHref,
  onTag,
  activeTag,
  guest,
  compareLimit = 8,
  compare = true,
}) {
  const title = t.title?.trim() || 'Untitled timeline',
    tags = t.tags ?? [],
    count = BigInt(t.event_count ?? 0);
  return (
    <article className="timeline-card" data-timeline={t.id}>
      <TimelineCardMedia timeline={t} />
      <h3 className="timeline-card-title">
        <Link href={timelinePath(t)}>{title}</Link>
      </h3>
      <p className="timeline-card-byline">
        <Link href={profilePath(t.owner)}>@{t.owner}</Link>
        {t.updated_at && (
          <>
            {' · Changed '}
            <time dateTime={t.updated_at}>{cardDate(t.updated_at)}</time>
          </>
        )}
      </p>
      {(t.visibility === 'private' || t.featured || t.comparison || t.labels?.length > 0) && (
        <p className="timeline-card-badges">
          {t.visibility === 'private' && <span className="badge">Private</span>}
          {t.featured && <span className="badge badge-featured">Featured</span>}
          {t.comparison && <span className="badge">Read-only comparison</span>}
          {t.labels?.length > 0 && (
            <span className="sensitive-badge">
              Sensitive: {describeLabels(t.labels).toLowerCase()}
            </span>
          )}
        </p>
      )}
      {t.description?.trim() && (
        <p className="timeline-card-description">
          <MarkdownExcerpt text={t.description} />
        </p>
      )}
      <dl className="timeline-card-facts">
        <div>
          <dt>Size</dt>
          <dd>
            {t.comparison
              ? `${t.comparison.sources?.length ?? 0} timelines`
              : `${count.toLocaleString('en')} ${count === 1n ? 'moment' : 'moments'}`}
          </dd>
        </div>
        {t.time_span && (
          <div className="timeline-shape">
            <dt>Span</dt>
            <dd>
              {t.shape && count > 1n && <TimelineShape shape={t.shape} />}
              <span className="timeline-shape-span">{t.time_span}</span>
            </dd>
          </div>
        )}
      </dl>
      {tags.length > 0 && (
        <ul className="tags" aria-label="Tags">
          {tags.slice(0, SHOWN_TAGS).map((tag) => (
            <li key={tag}>
              <a
                className="tag-chip"
                href={tagHref(tag)}
                aria-current={tag === activeTag ? 'true' : undefined}
                title={`Show only timelines tagged ${tag}`}
                onClick={onTag && ((event) => onTag(event, tag))}
              >
                {tag}
              </a>
            </li>
          ))}
          {tags.length > SHOWN_TAGS && <li className="muted">+{tags.length - SHOWN_TAGS} more</li>}
        </ul>
      )}
      <div className="timeline-card-footer">
        <StarButton id={t.id} count={t.star_count} starred={t.starred} signedIn={!guest} />
        {compare && <CompareCheckbox id={t.id} title={title} limit={compareLimit} />}
        {/* A comparison is a read-only view of its sources: it can't be forked. */}
        {guest && !t.comparison && (
          <a className="button" href={'/editor?fork=' + t.id}>
            Fork in browser
          </a>
        )}
      </div>
    </article>
  );
}
/** A card's outline while a list loads, the size of a card. */
export function SkeletonCard() {
  return (
    <div className="timeline-card skeleton" aria-hidden="true">
      <span className="skeleton-line skeleton-title" />
      <span className="skeleton-line skeleton-short" />
      <span className="skeleton-line" />
      <span className="skeleton-line" />
      <span className="skeleton-line skeleton-short" />
    </div>
  );
}
