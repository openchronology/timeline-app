// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import 'server-only';
import { notFound } from 'next/navigation';
import { currentSession } from './session.js';
/** A timeline the visitor may open; with `bounds`, also its first and last times. */
export async function accessibleTimeline(id, { bounds = false } = {}) {
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)) notFound();
  const current = await currentSession();
  if (!current.services.store) notFound();
  try {
    const { store } = current.services;
    return {
      ...current,
      timeline: await (bounds
        ? store.metadata(id, current.user?.id)
        : store.access(id, current.user?.id)),
    };
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
