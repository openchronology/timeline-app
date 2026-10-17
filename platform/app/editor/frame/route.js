// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// GET /editor/frame: the editor's own page (dist/index.html), which the platform's pages
// frame (components/editor.jsx).
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
