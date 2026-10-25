// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// /terms: the service's terms of service (legal/TERMS.md) as a page of its own.
import PolicyPage, { loadPolicy } from '../../components/policy-page.jsx';
import { pageTitle } from '../../lib/sharing.js';
export const dynamic = 'force-dynamic';
export function generateMetadata() {
  return { title: pageTitle('Terms of service'), alternates: { canonical: '/terms' } };
}
export default async function Page() {
  const { html } = await loadPolicy('legal/TERMS.md');
  return <PolicyPage html={html} source="legal/TERMS.md" />;
}
