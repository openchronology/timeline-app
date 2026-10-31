// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The index of audiences at /for (#379), with the landing page on: a card leading to each
// audience's page, with the copy of platform/content/landing/audiences.md.
import { notFound } from 'next/navigation';
import {
  AudienceCards,
  LandingCopy,
  StructuredData,
  audienceCards,
} from '../../components/landing.jsx';
import { landingContent, landingEnabled } from '../../../server/landing.mjs';
import { landingMetadata } from '../../lib/landing.js';
import { siteOrigin, webPageData } from '../../lib/sharing.js';
export const dynamic = 'force-dynamic';
export async function generateMetadata() {
  if (!landingEnabled()) return {};
  return landingMetadata('audiences', '/for');
}
export default async function Audiences() {
  if (!landingEnabled()) notFound();
  const [{ meta, html }, audiences] = await Promise.all([
    landingContent('audiences'),
    audienceCards(),
  ]);
  return (
    <main className="platform landing">
      <StructuredData
        data={webPageData('/for', meta.title, meta.description ?? meta.promise ?? '', {
          '@type': 'CollectionPage',
          hasPart: audiences.map(({ key, meta }) => ({
            '@type': 'WebPage',
            name: meta.title,
            url: siteOrigin() + '/for/' + key,
          })),
        })}
      />
      <section className="landing-hero" aria-labelledby="landing-title">
        <h1 id="landing-title">{meta.heading ?? meta.title}</h1>
        {meta.promise && <p className="landing-promise">{meta.promise}</p>}
      </section>
      <section aria-labelledby="audiences-heading">
        <h2 id="audiences-heading" className="sr-only">
          Audiences
        </h2>
        <AudienceCards audiences={audiences} headingId="audiences-heading" />
      </section>
      <LandingCopy html={html} />
    </main>
  );
}
