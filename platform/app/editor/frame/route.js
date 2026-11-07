// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// GET /editor/frame: the editor's own page (dist/index.html), which the platform's pages
// frame (components/editor.jsx). With `?timeline=<id>`, a timeline its reader may open, the
// page arrives with that timeline's heading already shown (#428): its owner, image, title,
// description and count, which the editor keeps while it loads the timeline. Search engines
// may read it only as part of the page that frames it.
import { editorHtml, editorPolicy } from '../../../lib/editor-html.js';
import { currentSession } from '../../../lib/session.js';
import { momentsText } from '../../../../src/wording.ts';
import { profilePath } from '../../../../src/addresses.ts';
import { transportSecurity } from '../../../../server/site.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
/**
 * The heading of timeline `id` for the current reader, or null: when it isn't theirs to read,
 * is still being prepared, is a comparison, or carries sensitive-content labels (whose images
 * and text the editor shows only after its warning).
 */
async function headingOf(id) {
  if (!UUID.test(id ?? '')) return null;
  try {
    const { services, user } = await currentSession();
    if (!services.store) return null;
    const timeline = await services.store.metadata(id, user?.id);
    if (timeline.preparing || timeline.comparison || timeline.labels?.length) return null;
    return {
      id: timeline.id,
      title: timeline.title ?? '',
      description: timeline.description ?? '',
      image: timeline.image?.url ? timeline.image : null,
      count: momentsText(BigInt(timeline.event_count ?? 0)),
      // The breadcrumb's owner, linked to their profile as the editor links it.
      owner: timeline.owner,
      ownerPath: profilePath(timeline.owner),
    };
  } catch {
    return null;
  }
}
export async function GET(request) {
  const heading = await headingOf(new URL(request.url).searchParams.get('timeline'));
  return new Response(await editorHtml(heading ?? undefined), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': editorPolicy("'self'"),
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      // Indexed only as part of the timeline's page that frames it, never on its own.
      'X-Robots-Tag': 'noindex, indexifembedded',
      // Over https, browsers keep to it here as on the site's other pages (proxy.js).
      ...(transportSecurity() ? { 'Strict-Transport-Security': transportSecurity() } : {}),
    },
  });
}
