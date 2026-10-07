// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { Readable } from 'node:stream';
import { platformServices } from './platform.mjs';

// Stream the incoming Next request directly through the existing bounded service
// controller. No localhost proxy or second HTTP listener is involved.
export async function dispatchNextRequest(request, handler) {
  handler ??= (await platformServices()).handler;
  const url = new URL(request.url);
  const req = request.body ? Readable.fromWeb(request.body) : Readable.from([]);
  Object.assign(req, {
    url: url.pathname + url.search,
    method: request.method,
    headers: Object.fromEntries(request.headers),
    socket: { remoteAddress: 'unknown' },
  });
  let status = 200,
    body = null;
  const headers = new Headers();
  const setHeader = (name, value) => {
    headers.delete(name);
    for (const item of Array.isArray(value) ? value : [value]) headers.append(name, String(item));
  };
  const res = {
    setHeader,
    writeHead(code, values) {
      status = code;
      for (const [name, value] of Object.entries(values ?? {})) setHeader(name, value);
    },
    end(value) {
      body = value ?? null;
    },
  };
  await handler(req, res);
  return new Response(request.method === 'HEAD' || [204, 304].includes(status) ? null : body, {
    status,
    headers,
  });
}
