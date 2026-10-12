// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { previewImage } from '../../../lib/preview-image.jsx';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'A timeline on OpenChronology';
export default async function Image({ params }) {
  const { id } = await params;
  return previewImage(id, null);
}
