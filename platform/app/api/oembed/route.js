// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * oEmbed (https://oembed.com) for public timelines, so services that discover it turn a
 * pasted timeline link into the timeline itself.
 * Pages announce it with <link rel="alternate" type="application/json+oembed">.
 */
import { platformServices } from '../../../../server/platform.mjs';
import { parseLink, linkFragment } from '../../../../dist/core.mjs';
import { profilePath, timelineAddress } from '../../../../src/addresses.ts';
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
/** The rest of a timeline's address: its page, or one of its moments' or durations'. */
const REST = /^(?:\/(moments|durations)\/([^/]+))?\/?$/;
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
  // At /timelines/<id>, or /<owner>/<slug or id> (#148).
  const address = timelineAddress(target.pathname),
    page = address && REST.exec(address.rest);
  if (target.host !== new URL(origin).host || !page) return fail(404, 'Not a timeline address.');
  const services = await platformServices();
  const id = address.id ?? (await services.store?.addressed(address.owner, address.name));
  const timeline = id ? await publicTimeline(services, id) : null;
  if (!timeline) return fail(404, 'This timeline is not public, or no longer exists.');
  // What the embed opens to: the page's moment or duration, or its link fragment.
  const entity = page[2] ? entityParam(page[2]) : null;
  const link = entity
    ? { kind: page[1] === 'moments' ? 'moment' : 'duration', id: entity }
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
      author_url: origin + profilePath(timeline.owner),
      html: embedCode(src, title, width, height),
      width,
      height,
      // No thumbnail of a labelled timeline (#115): it opens behind its warning.
      ...(timeline.labels?.length
        ? {}
        : {
            thumbnail_url: `${origin}/timelines/${timeline.id}/opengraph-image`,
            thumbnail_width: 1200,
            thumbnail_height: 630,
          }),
      cache_age: 3600,
    },
    { headers: { 'Cache-Control': 'public, max-age=3600', 'Access-Control-Allow-Origin': '*' } },
  );
}
