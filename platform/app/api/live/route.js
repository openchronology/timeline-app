// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { platformServices } from '../../../../server/platform.mjs';
import { liveResponse } from '../../../../server/live.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request) {
  return liveResponse(request, await platformServices());
}
