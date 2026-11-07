// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Put at the top of Next.js's standalone launcher, server.cjs (scripts/build-platform.mjs),
// after peer-address.cjs. The proxy marks the public pages a shared cache may keep (#473,
// server/shared-cache.mjs), but it cannot see everything about the request or response, so
// here, as each response's headers go out, one marked so:
// - is kept private when it answers the router's payload (RSC) or a server action, whose
//   headers and `_rsc` parameter Next.js hides from the proxy: its redirect to the payload's
//   address, kept under the page's, would send readers of the page there;
// - is kept private when it is a server error, so a passing failure is not kept for a minute;
// - otherwise varies by Cookie, which Next.js's own Vary would replace if the proxy set it:
//   a visitor with a session cookie is answered apart from the copy kept for the signed-out.
(() => {
  const http = require('node:http');
  const PRIVATE = 'private, no-cache, no-store, max-age=0, must-revalidate';
  const FLIGHT = [
    'rsc',
    'next-router-state-tree',
    'next-router-prefetch',
    'next-router-segment-prefetch',
    'next-action',
  ];
  // What only the proxy's mark (SHARED_CACHE_CONTROL) has: public, with a shared lifetime.
  const shared = (value) =>
    typeof value === 'string' && /^public\b/.test(value) && /\bs-maxage=/.test(value);
  const createServer = http.createServer;
  http.createServer = function (...args) {
    const server = createServer.apply(this, args);
    server.prependListener('request', (req, res) => {
      const flight =
        FLIGHT.some((name) => name in req.headers) || /[?&]_rsc(?:=|&|$)/.test(req.url ?? '');
      const writeHead = res.writeHead;
      res.writeHead = function (status, ...rest) {
        if (shared(this.getHeader('cache-control'))) {
          if (flight || (typeof status === 'number' ? status : this.statusCode) >= 500)
            this.setHeader('cache-control', PRIVATE);
          else {
            const vary = String(this.getHeader('vary') ?? '');
            if (!/(?:^|,)\s*cookie\s*(?:,|$)/i.test(vary))
              this.setHeader('vary', vary ? `${vary}, Cookie` : 'Cookie');
          }
        }
        return writeHead.call(this, status, ...rest);
      };
    });
    return server;
  };
})();
