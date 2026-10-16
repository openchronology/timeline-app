// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import 'server-only';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { timelinePath } from '../../src/addresses.ts';
import { currentSession } from './session.js';
/**
 * A timeline the visitor may open; with `bounds`, also its first and last times. A copy whose
 * index is still being prepared redirects to its own page, which waits for it, unless the
 * caller handles `preparing` itself. The timeline the page's address names, reached by
 * another of its addresses (#148), redirects to the same page at its own: `/<owner>/<slug>`,
 * or `/<owner>/<id>` until it has a slug.
 */
export async function accessibleTimeline(id, { bounds = false, preparing = false } = {}) {
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)) notFound();
  const current = await currentSession();
  if (!current.services.store) notFound();
  let timeline;
  try {
    const { store } = current.services;
    timeline = await (bounds || preparing
      ? store.metadata(id, current.user?.id)
      : store.access(id, current.user?.id));
  } catch (e) {
    if (e.status === 403 || e.status === 404) notFound();
    if (e.status === 409) redirect('/timelines/' + id);
    throw e;
  }
  const path = timelinePath(timeline);
  if (timeline.preparing && !preparing) redirect(path);
  const address = requestedAddress(await headers());
  if (address?.id === timeline.id && address.path !== path + address.rest)
    redirect(path + address.rest + address.search);
  return { ...current, timeline };
}
/** The address the page was asked for, as the proxy tells it. */
function requestedAddress(headers) {
  try {
    const address = JSON.parse(headers.get('x-timeline-address'));
    return typeof address?.path === 'string' ? address : null;
  } catch {
    return null;
  }
}
export function versionInfo(timeline) {
  const {
    id,
    title,
    revision,
    head_revision_id,
    upstream_id,
    visibility,
    canWrite,
    canFork,
    comparison,
    star_count,
    starred,
    moderation,
  } = timeline;
  return {
    id,
    // Its page (#148).
    path: timelinePath(timeline),
    title,
    revision,
    head_revision_id,
    upstream_id,
    visibility,
    canWrite,
    canFork,
    comparison,
    star_count,
    starred,
    // A moderation restriction in force (#115), told to its owner and administrators only.
    moderation: moderation ?? null,
  };
}
