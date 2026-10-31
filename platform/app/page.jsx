// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The home page at /: the dashboard (components/dashboard.jsx), or, with LANDING_PAGE on, the
// landing page (#379), with the dashboard at /explore.
import Dashboard from '../components/dashboard.jsx';
import {
  AudienceCards,
  ExampleTimelines,
  LandingCopy,
  LandingHero,
  StructuredData,
  VideoSection,
  audienceCards,
} from '../components/landing.jsx';
import { landingContent, landingEnabled } from '../../server/landing.mjs';
import { landingData, landingMetadata } from '../lib/landing.js';
import { webPageData } from '../lib/sharing.js';
// Rendered for every request: it depends on who is signed in and on the query.
export const dynamic = 'force-dynamic';
/**
 * The landing page's title, description and canonical address; the dashboard's is / alone,
 * whatever the query, since its searches, tags, sorts and pages are views of the same page.
 */
export async function generateMetadata() {
  if (!landingEnabled()) return { alternates: { canonical: '/' } };
  return landingMetadata('home', '/');
}
/**
 * The home page. With the landing page on: its opening (its heading, "Any span of time, on
 * one exact line"), the video if one is set, the audiences' cards, a few public timelines, and the
 * copy of platform/content/landing/home.md (or the operator's).
 */
export default async function Home({ searchParams }) {
  if (!landingEnabled()) return <Dashboard searchParams={searchParams} basePath="/" />;
  const [{ meta, html }, audiences, data] = await Promise.all([
    landingContent('home'),
    audienceCards(),
    landingData('home'),
  ]);
  return (
    <main className="platform landing">
      <StructuredData
        data={webPageData('/', meta.title, meta.description ?? meta.promise ?? '', {
          about: {
            '@type': 'SoftwareApplication',
            name: 'OpenChronology',
            applicationCategory: 'Timeline editor',
            operatingSystem: 'Web, Windows, macOS, Linux',
            license: 'https://www.gnu.org/licenses/gpl-3.0.html',
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
          },
        })}
      />
      <LandingHero meta={meta} data={data} />
      <VideoSection video={data.video} title={meta.video ?? meta.title} />
      <section className="landing-audiences" aria-labelledby="audiences-heading">
        <h2 id="audiences-heading">{meta.audiences ?? 'Who it’s for'}</h2>
        <AudienceCards audiences={audiences} headingId="audiences-heading" />
        <p>
          <a href="/for">Every audience, side by side</a>
        </p>
      </section>
      <ExampleTimelines
        timelines={data.examples}
        guest={!data.user}
        heading={meta.examples ?? 'Public timelines'}
      />
      <LandingCopy html={html} />
    </main>
  );
}
