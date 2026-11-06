// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The timeline browser at /explore (#379): the dashboard, as / shows it when the landing page
// is off, with every list's search, tag, sort and page in its query.
import Dashboard from '../../components/dashboard.jsx';
import { landingEnabled } from '../../../server/landing.mjs';
import { exploreDescription, pageTitle } from '../../lib/sharing.js';
import { platformServices } from '../../../server/platform.mjs';
export const dynamic = 'force-dynamic';
/**
 * One address for search engines, whatever the query: /explore with the landing page on;
 * without it the dashboard is the home page, which this repeats.
 */
export async function generateMetadata() {
  return landingEnabled()
    ? {
        title: pageTitle('Explore timelines'),
        // What it searches, and how much there is (#471).
        description: await exploreDescription((await platformServices()).pool),
        alternates: { canonical: '/explore' },
      }
    : { alternates: { canonical: '/' } };
}
export default function Explore({ searchParams }) {
  return <Dashboard searchParams={searchParams} basePath="/explore" />;
}
