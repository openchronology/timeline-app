// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { notFound, permanentRedirect } from 'next/navigation';
import Profile, { profileMetadata } from '../../components/profile.jsx';
import { RESERVED_NAMES, USERNAME } from '../../../src/addresses.ts';
export const dynamic = 'force-dynamic';
/** The username in the address, or not found for a name the site's own pages use. */
async function username(params) {
  const { owner } = await params;
  if (!USERNAME.test(owner.toLowerCase()) || RESERVED_NAMES.has(owner.toLowerCase())) notFound();
  return owner;
}
export async function generateMetadata({ params }) {
  return profileMetadata((await username(params)).toLowerCase());
}
export default async function ProfilePage({ params, searchParams }) {
  const name = await username(params);
  if (name !== name.toLowerCase()) permanentRedirect('/' + name.toLowerCase());
  return <Profile username={name} searchParams={searchParams} />;
}
