// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// A timeline's own image (#339) on its card: cropped to one shape, loaded as it scrolls into
// view, and a placeholder of the same shape when it has none.

/**
 * The image at the top of a timeline's card. It links to where it is hosted, like every image
 * on the site (docs/images.md), and is not sent the page's address. A labelled timeline
 * (#115) shows the placeholder: its images stay hidden until a reader chooses to see them,
 * which a card can't offer.
 *
 * @param {object} props
 * @param {{image?: {url: string, alt: string}|null, labels?: string[]}} props.timeline
 */
export default function TimelineCardImage({ timeline }) {
  const image = timeline.labels?.length ? null : timeline.image;
  return (
    <div className="timeline-card-image">
      {image ? (
        <img src={image.url} alt={image.alt ?? ''} loading="lazy" referrerPolicy="no-referrer" />
      ) : (
        <span className="timeline-card-placeholder" aria-hidden="true" />
      )}
    </div>
  );
}
