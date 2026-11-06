// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The timeline browser at /explore (#379): the dashboard, as / shows it when the landing page
// is off, with every list's search, tag, sort and page in its query.
import Dashboard from '../../components/dashboard.jsx';
import { landingEnabled } from '../../../server/landing.mjs';
import { pageTitle, webPageData } from '../../lib/sharing.js';
import { StructuredData } from '../../components/landing.jsx';
export const dynamic = 'force-dynamic';
/**
 * One address for search engines, whatever the query: /explore with the landing page on;
 * without it the dashboard is the home page, which this repeats.
 */
export function generateMetadata() {
  return landingEnabled()
    ? {
        title: pageTitle('Explore timelines'),
        description: 'Search, sort and browse public timelines.',
        alternates: { canonical: '/explore' },
      }
    : { alternates: { canonical: '/' } };
}
export default function Explore({ searchParams }) {
  return (
    <>
      {/* What it is, for search engines: the library's collection of timelines (#474). */}
      {landingEnabled() && (
        <StructuredData
          data={webPageData(
            '/explore',
            'Explore timelines',
            'Search and browse public timelines and their events.',
            { '@type': 'CollectionPage' },
          )}
        />
      )}
      <Dashboard searchParams={searchParams} basePath="/explore" />
    </>
  );
}
