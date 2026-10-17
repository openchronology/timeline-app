// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The link-preview image of a duration's page (lib/preview-image.jsx).
import { previewImage } from '../../../../../lib/preview-image.jsx';
import { entityParam } from '../../../../../lib/sharing.js';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'A duration on OpenChronology';
export default async function Image({ params }) {
  const { id, duration } = await params;
  const entity = entityParam(duration);
  return previewImage(id, entity ? { kind: 'duration', id: entity } : null);
}
