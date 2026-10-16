// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// This API's description (#178; server/openapi), with or without the server's storage.
import { openApiDocument } from '../../../../server/openapi/index.mjs';
import { siteName, siteOrigin } from '../../../lib/sharing.js';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
let description;
export function GET() {
  description ??= openApiDocument({ origin: siteOrigin(), name: siteName() });
  return Response.json(description, {
    headers: { 'Cache-Control': 'public, max-age=300', 'Access-Control-Allow-Origin': '*' },
  });
}
