// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// GET /healthz: whether the server and its database are up, for monitoring; answered by
// server/http.mjs through server/next-handler.mjs.
import { dispatchNextRequest } from '../../../server/next-handler.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const handle = (request) => dispatchNextRequest(request);
export const GET = handle;
export const HEAD = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
