// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * A moment or duration as text (#335), inside its page's TimelineSummary: what its reader
 * shows (time, tags, notes, its plugins' text and sources), the entities linked to it as
 * links to their own pages, and a link into the timeline open at it.
 */
import {
  durationTitle,
  entityFacts,
  excerpt,
  isoTime,
  momentTitle,
  presentTime,
  sharedPath,
} from '../lib/sharing.js';
import { timelinePath } from '../../src/addresses.ts';

/** A time as the timeline displays it, with its ISO form for machines when it has one. */
function Time({ timeline, time }) {
  const iso = isoTime(timeline, time);
  return <time {...(iso ? { dateTime: iso } : {})}>{presentTime(timeline, time)}</time>;
}

/**
 * @param {object} props
 * @param {object} props.timeline its timeline
 * @param {'moment'|'duration'} props.kind what it is
 * @param {string} props.id its ID
 * @param {string} props.title its title
 * @param {string} props.first its time (a moment) or start (a duration), exact
 * @param {string} [props.last] a duration's end, exact
 * @param {object} [props.metadata] its metadata (notes, tags, plugin fields)
 * @param {object[]} [props.related] the entities linked to it (see relatedOf)
 */
export default function EntitySummary({
  timeline,
  kind,
  id,
  title,
  first,
  last,
  metadata = {},
  related = [],
}) {
  const { tags, details, links } = entityFacts(timeline, metadata);
  const notes = excerpt(metadata.description, 4000);
  return (
    <article aria-label={title}>
      <h2>{title}</h2>
      <p>
        <Time timeline={timeline} time={first} />
        {kind === 'duration' && (
          <>
            {' – '}
            <Time timeline={timeline} time={last} />
          </>
        )}
      </p>
      {tags.length > 0 && (
        <ul aria-label="Tags">
          {tags.map((tag) => (
            <li key={tag}>{tag}</li>
          ))}
        </ul>
      )}
      {notes && <p>{notes}</p>}
      {details.length > 0 && (
        <dl>
          {details.map((field) => (
            <div key={field.label}>
              <dt>{field.label}</dt>
              <dd>{field.text}</dd>
            </div>
          ))}
        </dl>
      )}
      {links.map((field) => (
        <section key={field.label} aria-label={field.label}>
          <h3>{field.label}</h3>
          <ul>
            {field.urls.map((url) => (
              <li key={url}>
                <a href={url} rel="ugc nofollow noopener noreferrer">
                  {url}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {related.length > 0 && (
        <section aria-label="Related">
          <h3>Related</h3>
          <ul>
            {related.map((entity) => (
              <li key={entity.kind + ':' + entity.id}>
                <a href={sharedPath(timeline, entity)}>
                  {entity.kind === 'moment'
                    ? momentTitle({ metadata: { title: entity.title } })
                    : durationTitle({ metadata: { title: entity.title } })}
                </a>{' '}
                <Time timeline={timeline} time={entity.first} />
              </li>
            ))}
          </ul>
        </section>
      )}
      <p>
        <a href={`${timelinePath(timeline)}#${kind}/${encodeURIComponent(id)}`}>
          {`Open ${title} in the timeline`}
        </a>
      </p>
    </article>
  );
}
