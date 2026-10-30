// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// An audience's page at /for/<audience> (#379), with the landing page on: its promise, example
// timelines, video, and the copy of platform/content/landing/<audience>.md (what it can do,
// and what it can count on); any other audience is not found.
import { notFound } from 'next/navigation';
import {
  AudienceCards,
  ExampleTimelines,
  LandingCopy,
  LandingHero,
  StructuredData,
  VideoSection,
  audienceCards,
} from '../../../components/landing.jsx';
import { AUDIENCES, landingContent, landingEnabled } from '../../../../server/landing.mjs';
import { landingData, landingMetadata } from '../../../lib/landing.js';
import { webPageData } from '../../../lib/sharing.js';
export const dynamic = 'force-dynamic';
/** The audience in the address, or not found when the landing page is off or it is unknown. */
async function audience(params) {
  const { audience } = await params;
  if (!landingEnabled() || !AUDIENCES.includes(audience)) notFound();
  return audience;
}
export async function generateMetadata({ params }) {
  const key = await audience(params);
  return landingMetadata(key, '/for/' + key);
}
export default async function AudiencePage({ params }) {
  const key = await audience(params);
  const [{ meta, html }, audiences, data] = await Promise.all([
    landingContent(key),
    audienceCards(),
    landingData(key),
  ]);
  const path = '/for/' + key;
  return (
    <main className="platform landing">
      <StructuredData
        data={webPageData(path, meta.title, meta.description ?? meta.promise ?? '', {
          audience: { '@type': 'Audience', audienceType: meta.label ?? key },
          about: { '@type': 'SoftwareApplication', name: 'OpenChronology' },
        })}
      />
      <nav className="landing-breadcrumb" aria-label="Breadcrumb">
        <a href="/">Home</a> › <a href="/for">Who it’s for</a> ›{' '}
        <span aria-current="page">{meta.label ?? key}</span>
      </nav>
      <LandingHero meta={meta} data={data} />
      <ExampleTimelines
        timelines={data.examples}
        guest={!data.user}
        heading={meta.examples ?? 'Example timelines'}
      />
      <VideoSection video={data.video} title={meta.video ?? meta.title} />
      <LandingCopy html={html} />
      <section className="landing-audiences" aria-labelledby="others-heading">
        <h2 id="others-heading">Also for</h2>
        <AudienceCards audiences={audiences} current={key} headingId="others-heading" />
      </section>
    </main>
  );
}
