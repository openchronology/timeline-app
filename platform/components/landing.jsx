// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The landing page and the audience pages (#379): their opening, the cards that lead to each
// audience's page, example timelines, the video and the copy, all readable without JavaScript.
import TimelineCard from './timeline-card.jsx';
import LandingVideo from './landing-video.jsx';
import { AUDIENCES, browserPath, landingContent } from '../../server/landing.mjs';
import { jsonLd } from '../lib/sharing.js';

/**
 * A page's opening: its heading (or title), its promise in a line, and what to do next: explore the
 * public timelines, sign up (where the site takes registrations; or see one's own timelines,
 * signed in), or start a timeline in the browser.
 * @param {object} props
 * @param {Record<string, string>} props.meta the copy's front matter (`heading` or `title`,
 *   `promise`)
 * @param {{user: object|null, registration: boolean}} props.data from lib/landing.js
 * @param {string} [props.eyebrow] a line above the title: whom the page is for
 */
export function LandingHero({ meta, data, eyebrow }) {
  const browser = browserPath();
  return (
    <section className="landing-hero" aria-labelledby="landing-title">
      {eyebrow && <p className="landing-eyebrow">{eyebrow}</p>}
      <h1 id="landing-title">{meta.heading ?? meta.title}</h1>
      {meta.promise && <p className="landing-promise">{meta.promise}</p>}
      <div className="landing-actions">
        <a className="button primary" href={browser}>
          Explore timelines
        </a>
        {data.user ? (
          <a className="button" href={browser + '#mine'}>
            Your timelines
          </a>
        ) : data.registration ? (
          <a className="button" href="/login?mode=register">
            Sign up
          </a>
        ) : null}
        <a className="button" href="/editor?new=1">
          Start a timeline
        </a>
      </div>
    </section>
  );
}

/** Each audience's copy, for the cards that lead to their pages. */
export async function audienceCards() {
  return Promise.all(
    AUDIENCES.map(async (key) => ({ key, meta: (await landingContent(key)).meta })),
  );
}
/**
 * The cards that lead to each audience's page: its name and what it does there.
 * @param {object} props
 * @param {{key: string, meta: Record<string, string>}[]} props.audiences from audienceCards
 * @param {string} [props.current] the audience whose page this is, left out
 * @param {string} props.headingId the id of the heading that names the list
 */
export function AudienceCards({ audiences, current, headingId }) {
  return (
    <ul className="audience-grid" aria-labelledby={headingId}>
      {audiences
        .filter((a) => a.key !== current)
        .map(({ key, meta }) => (
          <li key={key} className="audience-card">
            <h3>
              <a href={'/for/' + key}>{meta.label ?? key}</a>
            </h3>
            {meta.card && <p>{meta.card}</p>}
          </li>
        ))}
    </ul>
  );
}

/**
 * Example timelines, as the timeline browser's cards with their images; their tags lead to
 * the browser, filtered. Nothing when there are none.
 * @param {object} props
 * @param {object[]} props.timelines from lib/landing.js
 * @param {boolean} props.guest the visitor is not signed in
 * @param {string} props.heading the section's heading
 */
export function ExampleTimelines({ timelines, guest, heading }) {
  if (!timelines.length) return null;
  const browser = browserPath();
  return (
    <section className="landing-examples" aria-labelledby="examples-heading">
      <h2 id="examples-heading">{heading}</h2>
      <div className="timeline-grid">
        {timelines.map((t) => (
          <TimelineCard
            key={t.id}
            timeline={t}
            guest={guest}
            compare={false}
            tagHref={(tag) => `${browser}?tag=${encodeURIComponent(tag)}#explore`}
          />
        ))}
      </div>
      <p>
        <a href={browser}>Explore all public timelines</a>
      </p>
    </section>
  );
}

/**
 * A page's video, if it has one, with what playing it involves.
 * @param {object} props
 * @param {object|null} props.video from lib/landing.js
 * @param {string} props.title what the video is
 */
export function VideoSection({ video, title }) {
  if (!video) return null;
  return (
    <section className="landing-video" aria-labelledby="video-heading">
      <h2 id="video-heading">Watch</h2>
      <LandingVideo video={video} title={title} />
      <p className="muted">
        Playing it here loads YouTube’s player from youtube-nocookie.com, which then sees your
        address. Or <a href={video.watch}>watch it on YouTube</a>.
      </p>
    </section>
  );
}

/** The copy's body: Markdown rendered on the server (server/landing.mjs), its links checked. */
export function LandingCopy({ html }) {
  return html.trim() ? (
    <div className="landing-copy" dangerouslySetInnerHTML={{ __html: html }} />
  ) : null;
}

/** A page's structured data, as a JSON-LD script. */
export function StructuredData({ data }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(data) }} />;
}
