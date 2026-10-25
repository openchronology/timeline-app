// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// /sitemap.xml: the sitemap index, naming the pages of the sitemap under /sitemap/ (#287).
import { sitemapIndex } from '../../lib/sitemap.js';
export const dynamic = 'force-dynamic';
export function GET() {
  return sitemapIndex();
}
