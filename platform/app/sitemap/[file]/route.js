// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// /sitemap/<file>: one page of the sitemap — the site's pages, or a page of public timelines or
// of profiles (#287).
import { sitemapPage } from '../../../lib/sitemap.js';
export const dynamic = 'force-dynamic';
export async function GET(request, { params }) {
  return sitemapPage((await params).file);
}
