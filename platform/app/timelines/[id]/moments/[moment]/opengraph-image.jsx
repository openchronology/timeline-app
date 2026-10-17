// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The link-preview image of a moment's page (lib/preview-image.jsx).
import { previewImage } from '../../../../../lib/preview-image.jsx';
import { entityParam } from '../../../../../lib/sharing.js';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'A moment on OpenChronology';
export default async function Image({ params }) {
  const { id, moment } = await params;
  const entity = entityParam(moment);
  return previewImage(id, entity ? { kind: 'moment', id: entity } : null);
}
