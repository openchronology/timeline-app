// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Related timelines (#447): below a timeline on the website, others about the same things,
// from GET /api/timelines/{id}/related, as cards that open their own pages.
import { timelinePath } from './addresses.js';
import { describeLabels } from './content-labels.js';
import { imageSource } from './image-assets.js';
import { markdownText } from './rich-text.js';

/** A related timeline as the server lists it: what its card shows. */
export interface RelatedTimeline {
  id: string;
  slug?: string | null;
  title: string;
  description: string;
  owner: string;
  event_count: string | number;
  time_span?: string | null;
  image?: { url: string; alt?: string } | null;
  labels?: string[];
  featured?: boolean;
}

/**
 * Shows `timelines` in `section` (its heading kept, its list replaced), or hides it when there
 * are none. Each card links to the timeline's page, in the whole window rather than the frame
 * the editor sits in; a labelled one says so, and shows no image, as its page opens behind its
 * warning (#115).
 */
export function showRelated(section: HTMLElement, timelines: readonly RelatedTimeline[]) {
  const list = section.querySelector<HTMLElement>('.related-timelines-list')!;
  list.replaceChildren(
    ...timelines.map((t) => {
      const card = document.createElement('a');
      card.className = 'related-timeline';
      card.href = timelinePath(t);
      card.target = '_top';
      const labelled = !!t.labels?.length;
      const picture = labelled ? null : imageSource(t.image?.url ?? null);
      if (picture) {
        const img = document.createElement('img');
        img.src = picture;
        img.alt = '';
        img.loading = 'lazy';
        img.referrerPolicy = 'no-referrer';
        card.append(img);
      }
      const title = document.createElement('strong');
      title.textContent = t.title || 'Untitled timeline';
      const facts = document.createElement('span');
      facts.className = 'related-timeline-facts';
      facts.textContent = [
        '@' + t.owner,
        Number(t.event_count).toLocaleString() + ' moments',
        t.time_span,
        t.featured ? 'Featured' : null,
      ]
        .filter(Boolean)
        .join(' · ');
      card.append(title, facts);
      if (labelled) {
        const badge = document.createElement('span');
        badge.className = 'sensitive-badge';
        badge.textContent = `Sensitive: ${describeLabels(t.labels!).toLowerCase()}`;
        card.append(badge);
      }
      // Its description as plain text (#398), cut short.
      const about = markdownText(t.description).replace(/\s+/g, ' ').trim();
      if (about) {
        const description = document.createElement('span');
        description.className = 'related-timeline-description';
        description.textContent = about.length > 160 ? about.slice(0, 157).trimEnd() + '…' : about;
        card.append(description);
      }
      return card;
    }),
  );
  section.hidden = !timelines.length;
}
