// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * oEmbed (https://oembed.com) for public timelines, so services that discover it turn a
 * pasted timeline link into the timeline itself.
 * Pages announce it with <link rel="alternate" type="application/json+oembed">.
 */
import { platformServices } from '../../../../server/platform.mjs';
import { parseLink, linkFragment } from '../../../../dist/core.mjs';
import {
  embedCode,
  entityParam,
  publicTimeline,
  siteOrigin,
  siteName,
  timelineTitle,
} from '../../../lib/sharing.js';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const PAGE =
  /^\/timelines\/([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})(?:\/(moments|durations)\/([^/]+))?\/?$/i;
const fail = (status, error) =>
  Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
/** A size limit from the request: a positive integer, or none. */
const limit = (value) => {
  const n = Number(value);
  return value !== null && Number.isSafeInteger(n) && n > 0 ? n : Infinity;
};
export async function GET(request) {
  const query = new URL(request.url).searchParams;
  if ((query.get('format') ?? 'json') !== 'json')
    return fail(501, 'Only the json format is available.');
  let target;
  try {
    target = new URL(query.get('url') ?? '');
  } catch {
    return fail(400, 'Give the url of a timeline.');
  }
  const origin = siteOrigin();
  const page = PAGE.exec(target.pathname);
  if (target.host !== new URL(origin).host || !page) return fail(404, 'Not a timeline address.');
  const timeline = await publicTimeline(await platformServices(), page[1]);
  if (!timeline) return fail(404, 'This timeline is not public, or no longer exists.');
  // What the embed opens to: the page's moment or duration, or its link fragment.
  const entity = page[3] ? entityParam(page[3]) : null;
  const link = entity
    ? { kind: page[2] === 'moments' ? 'moment' : 'duration', id: entity }
    : parseLink(target.hash);
  const src = `${origin}/embed/${timeline.id}${link ? '#' + linkFragment(link) : ''}`;
  const width = Math.min(800, limit(query.get('maxwidth'))),
    height = Math.min(480, limit(query.get('maxheight')), Math.round(width * 0.6));
  if (width < 200 || height < 160) return fail(501, 'The timeline needs at least 200 × 160.');
  const title = timelineTitle(timeline);
  return Response.json(
    {
      version: '1.0',
      type: 'rich',
      provider_name: siteName(),
      provider_url: origin,
      title,
      author_name: timeline.owner,
      author_url: `${origin}/users/${encodeURIComponent(timeline.owner)}`,
      html: embedCode(src, title, width, height),
      width,
      height,
      thumbnail_url: `${origin}/timelines/${timeline.id}/opengraph-image`,
      thumbnail_width: 1200,
      thumbnail_height: 630,
      cache_age: 3600,
    },
    { headers: { 'Cache-Control': 'public, max-age=3600', 'Access-Control-Allow-Origin': '*' } },
  );
}
