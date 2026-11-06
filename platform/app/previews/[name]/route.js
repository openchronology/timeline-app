// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// /previews/<name>.png: the link-preview card of the site's own pages (`site`) or an audience's
// page (lib/site-preview.jsx); anything else is not found.
import { sitePreviewImage } from '../../../lib/site-preview.jsx';
export const dynamic = 'force-dynamic';
export async function GET(_request, { params }) {
  const { name } = await params;
  const match = /^([a-z]+)\.png$/.exec(name);
  const image = match ? await sitePreviewImage(match[1]) : null;
  return image ?? new Response('Not found', { status: 404 });
}
