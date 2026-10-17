// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// GET /api/live?timelines=…: a stream of notices when those timelines change
// (server/live.mjs).
import { servicesOrUnavailable } from '../../../../server/next-handler.mjs';
import { liveResponse } from '../../../../server/live.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request) {
  const { services, unavailable } = await servicesOrUnavailable();
  return unavailable ?? liveResponse(request, services);
}
