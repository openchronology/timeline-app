// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// /robots.txt: crawlers may read the public pages and oEmbed, but not accounts, the API,
// embeds or the bare editor.
import { siteOrigin } from '../lib/sharing.js';
export const dynamic = 'force-dynamic';
export default function robots() {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/api/oembed'],
        // Accounts, the API, and pages that repeat a timeline (embeds, the bare editor).
        disallow: ['/api/', '/account', '/admin', '/login', '/connect/', '/editor', '/embed/'],
      },
    ],
    sitemap: siteOrigin() + '/sitemap.xml',
  };
}
