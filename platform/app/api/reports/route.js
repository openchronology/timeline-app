// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// POST /api/reports: reporting something to the site's administrators (#115), answered by
// server/http.mjs through server/next-handler.mjs.
import { dispatchNextRequest } from '../../../../server/next-handler.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const handle = (request) => dispatchNextRequest(request);
export const GET = handle;
export const HEAD = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;

export const PATCH = handle;
