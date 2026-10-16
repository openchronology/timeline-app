// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Profiles were here before they were at /<username> (#148); those whose names the site's own
// pages use still are.
import { permanentRedirect } from 'next/navigation';
import Profile, { profileMetadata } from '../../../components/profile.jsx';
import { profilePath } from '../../../../src/addresses.ts';
export const dynamic = 'force-dynamic';
export async function generateMetadata({ params }) {
  return profileMetadata((await params).username);
}
export default async function LegacyProfile({ params, searchParams }) {
  const { username } = await params;
  const path = profilePath(username.toLowerCase());
  if (!path.startsWith('/users/')) {
    const query = new URLSearchParams(await searchParams).toString();
    permanentRedirect(path + (query ? '?' + query : ''));
  }
  return <Profile username={username} searchParams={searchParams} />;
}
