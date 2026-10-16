// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * A public timeline for other sites to frame: the editor, read-only and anonymous (see
 * `embedded` in src/app.ts). Private timelines, and comparisons of them, are never embedded.
 */
import { editorHtml, editorPolicy } from '../../../lib/editor-html.js';
import { publicTimeline, sharedPath, siteOrigin, timelineTitle } from '../../../lib/sharing.js';
import { platformServices } from '../../../../server/platform.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const escape = (text) =>
  String(text).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );
export async function GET(request, { params }) {
  const { id } = await params;
  // Pages that may frame embeds: any, unless the operator lists some.
  const headers = {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': editorPolicy(process.env.EMBED_FRAME_ANCESTORS?.trim() || '*'),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Robots-Tag': 'noindex',
  };
  let timeline = null;
  try {
    timeline = await publicTimeline(await platformServices(), id);
  } catch (error) {
    console.error('Embed unavailable:', error);
  }
  if (!timeline)
    return new Response(
      '<!doctype html><meta charset="utf-8"><title>Timeline unavailable</title><p style="font-family:system-ui;margin:16px">This timeline is not public, or no longer exists.</p>',
      { status: 404, headers },
    );
  const canonical = siteOrigin() + sharedPath(timeline);
  const html = (await editorHtml()).replace(
    /<title>[^<]*<\/title>/,
    `<title>${escape(timelineTitle(timeline))} · OpenChronology</title><link rel="canonical" href="${escape(canonical)}" />`,
  );
  return new Response(html, { headers });
}
