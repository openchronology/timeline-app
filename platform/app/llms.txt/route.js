// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// /llms.txt (#482): the site for AI engines and agents (lib/llms.js).
import { llmsText, textResponse } from '../../lib/llms.js';
export const dynamic = 'force-dynamic';
export async function GET() {
  return textResponse(await llmsText());
}
