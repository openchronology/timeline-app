// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import 'server-only';
import { notFound } from 'next/navigation';
import { currentSession } from './session.js';
export async function accessibleTimeline(id) {
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)) notFound();
  const current = await currentSession();
  if (!current.services.store) notFound();
  try {
    return { ...current, timeline: await current.services.store.access(id, current.user?.id) };
  } catch (e) {
    if (e.status === 403 || e.status === 404) notFound();
    throw e;
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
  } = timeline;
  return {
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
  };
}
