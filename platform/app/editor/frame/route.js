// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { editorHtml, editorPolicy } from '../../../lib/editor-html.js';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  return new Response(await editorHtml(), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': editorPolicy("'self'"),
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
