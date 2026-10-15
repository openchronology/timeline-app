// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { Readable } from 'node:stream';
import { platformServices, ConfigurationError } from './platform.mjs';

/** Starts the platform, or answers with JSON why it cannot (instead of an empty 500). */
export async function servicesOrUnavailable() {
  try {
    return { services: await platformServices() };
  } catch (error) {
    console.error('OpenChronology could not start:', error);
    const message =
      error instanceof ConfigurationError
        ? `Server misconfigured: ${error.message}`
        : 'The server is unavailable.';
    return {
      unavailable: Response.json(
        { error: message },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      ),
    };
  }
}

// Stream the incoming Next request directly through the existing bounded service
// controller. No localhost proxy or second HTTP listener is involved.
export async function dispatchNextRequest(request, handler) {
  if (!handler) {
    const { services, unavailable } = await servicesOrUnavailable();
    if (unavailable) return unavailable;
    handler = services.handler;
  }
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
    /**
     * Takes a body read a part at a time (streamResponse in http.mjs): `first`, then the
     * rest of `chunks`, pulled as the client reads, so neither is held whole; a client that
     * stops reading closes them.
     */
    streamBody(code, values, first, chunks) {
      res.writeHead(code, values);
      if (request.method === 'HEAD') return void chunks.return();
      const encoder = new TextEncoder();
      let next = first;
      body = new ReadableStream({
        async pull(controller) {
          try {
            const part = next ?? (await chunks.next());
            next = null;
            if (part.done) controller.close();
            else controller.enqueue(encoder.encode(part.value));
          } catch (error) {
            controller.error(error);
          }
        },
        cancel: () => chunks.return(),
      });
    },
  };
  await handler(req, res);
  return new Response(request.method === 'HEAD' || [204, 304].includes(status) ? null : body, {
    status,
    headers,
  });
}
