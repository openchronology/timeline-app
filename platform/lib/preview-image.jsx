// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * The preview image social sites show for a shared timeline, moment or duration: its title,
 * facts and a strip of the timeline's moments, with the shared one marked. Only public
 * timelines are drawn; anything else gets the site's own card.
 */
import 'server-only';
import { ImageResponse } from 'next/og';
import { Q, describeLabels } from '../../dist/core.mjs';
import { platformServices } from '../../server/platform.mjs';
import {
  durationOf,
  descriptionExcerpt,
  durationTitle,
  excerpt,
  momentOf,
  momentTitle,
  presentTime,
  publicTimeline,
  siteName,
  timelineFacts,
  timelineTitle,
} from './sharing.js';

export const size = { width: 1200, height: 630 };
/** The strip's width: the image less its side padding. */
const STRIP = 1200 - 2 * 64;
const INK = '#192d25',
  PAPER = '#f6f3ea',
  ACCENT = '#c8643b',
  MUTED = '#5d6b63';
/** How far along the strip (0–1) a time falls, between the timeline's first and last moments. */
function position(first, span, time) {
  if (span.compare(Q.zero) <= 0) return 0.5;
  return Math.min(1, Math.max(0, Q.parse(time).sub(first).div(span).toApproximateNumber()));
}
/** Moment groups along the whole timeline, at about one per 1/120 of its span. */
async function strip(services, timeline) {
  if (!timeline.first || !timeline.last || timeline.comparison) return [];
  const first = Q.parse(timeline.first),
    span = Q.parse(timeline.last).sub(first);
  if (span.compare(Q.zero) <= 0) return [{ at: 0.5, count: Number(timeline.event_count ?? 1) }];
  const { groups } = await services.store.query(timeline.id, null, {
    kind: 'overview',
    lower: timeline.first,
    upper: timeline.last,
    threshold: span.div(Q.from(120n)).toString(),
  });
  return groups.slice(0, 400).map((g) => ({
    at: position(first, span, Q.parse(g.first).add(Q.parse(g.last)).div(Q.from(2n)).toString()),
    count: Number(g.count),
  }));
}
function Card({ eyebrow, title, facts, notes, groups, mark }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: PAPER,
        color: INK,
        padding: '56px 64px',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', fontSize: 28, color: MUTED, letterSpacing: 1 }}>
        {'openchronology' + (eyebrow ? ' · ' + excerpt(eyebrow, 60) : '')}
      </div>
      <div
        style={{
          display: 'flex',
          marginTop: 28,
          fontSize: title.length > 60 ? 54 : 68,
          fontWeight: 700,
          lineHeight: 1.1,
          maxHeight: 230,
          overflow: 'hidden',
        }}
      >
        {title}
      </div>
      {facts && (
        <div style={{ display: 'flex', marginTop: 20, fontSize: 30, color: MUTED }}>{facts}</div>
      )}
      {notes && (
        <div
          style={{
            display: 'flex',
            marginTop: 16,
            fontSize: 26,
            color: MUTED,
            maxHeight: 70,
            overflow: 'hidden',
          }}
        >
          {notes}
        </div>
      )}
      <div style={{ display: 'flex', flexGrow: 1 }} />
      <div style={{ display: 'flex', position: 'relative', height: 80, width: STRIP }}>
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 39,
            height: 3,
            background: INK,
            opacity: 0.35,
          }}
        />
        {mark?.band && (
          <div
            style={{
              position: 'absolute',
              left: mark.band[0] * STRIP,
              width: Math.max(8, (mark.band[1] - mark.band[0]) * STRIP),
              top: 30,
              height: 21,
              borderRadius: 10,
              background: ACCENT,
              opacity: 0.8,
            }}
          />
        )}
        {groups.map((g, i) => {
          const d = Math.min(30, 10 + Math.log2(Math.max(1, g.count)) * 3);
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: g.at * STRIP - d / 2,
                top: 40 - d / 2,
                width: d,
                height: d,
                borderRadius: d,
                background: INK,
              }}
            />
          );
        })}
        {mark?.at !== undefined && (
          <div
            style={{
              position: 'absolute',
              left: mark.at * STRIP - 20,
              top: 20,
              width: 40,
              height: 40,
              borderRadius: 40,
              border: `6px solid ${ACCENT}`,
              background: PAPER,
            }}
          />
        )}
      </div>
    </div>
  );
}
/** The site's own card, for anything that is not public. */
function siteCard() {
  return new ImageResponse(
    <Card title={siteName()} facts="Exact timelines, shared on your terms." groups={[]} />,
    size,
  );
}
/** A preview of a public timeline, or of one of its moments (`moment`) or durations. */
export async function previewImage(id, entity) {
  let services, timeline;
  try {
    services = await platformServices();
    timeline = await publicTimeline(services, id);
  } catch (error) {
    console.error('Preview unavailable:', error);
  }
  if (!timeline) return siteCard();
  // A labelled timeline (#115) previews as its title and labels alone: nothing from it is
  // shown to someone who has not chosen to see it.
  if (timeline.labels?.length)
    return new ImageResponse(
      <Card
        title={timeline.title || 'Untitled timeline'}
        facts={`Sensitive content: ${describeLabels(timeline.labels).toLowerCase()}`}
        groups={[]}
      />,
      size,
    );
  const groups = await strip(services, timeline).catch(() => []);
  const first = timeline.first ? Q.parse(timeline.first) : Q.zero,
    span = timeline.last ? Q.parse(timeline.last).sub(first) : Q.zero;
  if (entity?.kind === 'moment') {
    const event = await momentOf(services, timeline, entity.id).catch(() => null);
    if (event)
      return new ImageResponse(
        <Card
          eyebrow={timelineTitle(timeline)}
          title={momentTitle(event)}
          facts={presentTime(timeline, event.time)}
          notes={excerpt(event.metadata?.description, 140)}
          groups={groups}
          mark={{ at: position(first, span, event.time) }}
        />,
        size,
      );
  }
  if (entity?.kind === 'duration') {
    const found = await durationOf(services, timeline, entity.id).catch(() => null);
    if (found)
      return new ImageResponse(
        <Card
          eyebrow={timelineTitle(timeline)}
          title={durationTitle(found.duration)}
          facts={`${presentTime(timeline, found.band.first)} – ${presentTime(timeline, found.band.last)}`}
          notes={excerpt(found.duration.metadata?.description, 140)}
          groups={groups}
          mark={{
            band: [position(first, span, found.band.first), position(first, span, found.band.last)],
          }}
        />,
        size,
      );
  }
  return new ImageResponse(
    <Card
      title={timelineTitle(timeline)}
      facts={timelineFacts(timeline)}
      notes={descriptionExcerpt(timeline, 140)}
      groups={groups}
    />,
    size,
  );
}
