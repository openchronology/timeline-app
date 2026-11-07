// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// /llms-full.txt (#482): the help's text in one file, for AI engines and agents (lib/llms.js).
import { llmsFullText, textResponse } from '../../lib/llms.js';
export const dynamic = 'force-dynamic';
export async function GET() {
  return textResponse(await llmsFullText());
}
