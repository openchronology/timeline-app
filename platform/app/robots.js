// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// /robots.txt: crawlers may read the public pages and oEmbed, but not accounts, the API,
// embeds or the bare editor. They may read the editor's frame (#428), which carries a
// timeline's heading for the page that frames it and says it is indexed only as part of that.
import { siteOrigin } from '../lib/sharing.js';
export const dynamic = 'force-dynamic';
export default function robots() {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/api/oembed', '/editor/frame'],
        // Accounts, the API, and pages that repeat a timeline (embeds, the bare editor).
        disallow: ['/api/', '/account', '/admin', '/login', '/connect/', '/editor', '/embed/'],
      },
    ],
    sitemap: siteOrigin() + '/sitemap.xml',
  };
}
