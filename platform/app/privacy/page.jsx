// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// /privacy: the service's privacy policy (legal/PRIVACY.md) as a page of its own.
import PolicyPage, { loadPolicy } from '../../components/policy-page.jsx';
import { pageTitle } from '../../lib/sharing.js';
export const dynamic = 'force-dynamic';
export function generateMetadata() {
  return { title: pageTitle('Privacy policy'), alternates: { canonical: '/privacy' } };
}
export default async function Page() {
  const { html } = await loadPolicy('legal/PRIVACY.md');
  return <PolicyPage html={html} source="legal/PRIVACY.md" />;
}
