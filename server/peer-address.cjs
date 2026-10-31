// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Put at the top of Next.js's standalone launcher, server.cjs (scripts/build-platform.mjs).
// Route handlers get a web Request without its connection, so the server writes the address
// each request came from into the X-OC-Peer-Address request header before Next.js reads it,
// replacing any a client sent. The value starts with a secret made at start, which
// dispatchNextRequest (next-handler.mjs) checks: without this launcher (next dev), the header
// is ignored and every client shares the address 'unknown'.
(() => {
  const http = require('node:http');
  const secret = require('node:crypto').randomUUID();
  globalThis[Symbol.for('openchronology.peerSecret')] = secret;
  const createServer = http.createServer;
  http.createServer = function (...args) {
    const server = createServer.apply(this, args);
    server.prependListener('request', (req) => {
      req.headers['x-oc-peer-address'] = `${secret} ${req.socket.remoteAddress ?? 'unknown'}`;
    });
    return server;
  };
})();
