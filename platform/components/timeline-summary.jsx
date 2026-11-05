// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * The timeline as text, for screen readers and search engines: the editor beside it is an
 * interactive picture of the same thing. Its moments link to their own pages, related
 * timelines (#447) to theirs, and the entities on other timelines linking to it as a whole
 * (#422) to theirs.
 */
import {
  momentTitle,
  presentTime,
  sharedPath,
  timelineFacts,
  timelineTitle,
} from '../lib/sharing.js';
import { profilePath, timelinePath } from '../../src/addresses.ts';
import Markdown from './markdown.jsx';
import { TimelineLinkList } from './entity-summary.jsx';
export default function TimelineSummary({
  timeline,
  moments = [],
  related = [],
  linkedFrom = [],
  children,
}) {
  return (
    <section className="sr-only" aria-label="Timeline summary">
      <h1>{timelineTitle(timeline)}</h1>
      {timeline.description?.trim() && <Markdown text={timeline.description} />}
      <p>
        {timelineFacts(timeline)}
        {timeline.owner && (
          <>
            {' · '}
            <a href={profilePath(timeline.owner)}>@{timeline.owner}</a>
          </>
        )}
      </p>
      {children}
      {moments.length > 0 && (
        <>
          <h2>Moments</h2>
          <ol>
            {moments.map((event) => (
              <li key={event.id}>
                <a href={sharedPath(timeline, { kind: 'moment', id: event.id })}>
                  {momentTitle(event)}
                </a>{' '}
                <time>{presentTime(timeline, event.time)}</time>
              </li>
            ))}
          </ol>
        </>
      )}
      {linkedFrom.length > 0 && <TimelineLinkList links={linkedFrom} label="Linked from" />}
      {related.length > 0 && (
        <>
          <h2>Related timelines</h2>
          <ul>
            {related.map((t) => (
              <li key={t.id}>
                <a href={timelinePath(t)}>{t.title || 'Untitled timeline'}</a> by @{t.owner}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
