// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { createApplication } from '../server/http.mjs';

test('legal notices survive all web builds and offline notices have no source download request', async () => {
  const web = await readFile('dist/index.html', 'utf8');
  const offline = await readFile('dist/openchronology-offline.html', 'utf8');
  const legal = await readFile('dist/legal.html', 'utf8');
  for (const html of [legal, offline]) {
    for (const title of [
      'terms of service',
      'privacy notice',
      'Copyright, abuse, and security reporting',
      'GNU GENERAL PUBLIC LICENSE',
    ])
      assert(html.includes(title));
    assert(html.includes('Copyright (c) 2026 Athan Clark'));
    assert(!html.includes('<!-- OPENCHRONOLOGY_LEGAL -->'));
  }
  assert(web.includes('href="openchronology-web-source.tar.gz"'));
  assert(web.includes('href="legal.html"'));
  assert(!web.includes('<footer class="legal-notices"><details>'));
  assert(!offline.includes('href="openchronology-web-source.tar.gz"'));
  const { stdout } = await promisify(execFile)('tar', [
    '-tzf',
    'dist/openchronology-web-source.tar.gz',
  ]);
  const entries = stdout.trim().split('\n');
  assert(entries.includes('openchronology/src/app.ts'));
  assert(entries.includes('openchronology/third-party-source/rational-ordered-map/src/map.ts'));
  assert(entries.includes('openchronology/third-party-source/fraction.js/src/fraction.js'));
  assert(entries.includes('openchronology/legal/PRIVACY.md'));
  assert(
    !entries.some((name) =>
      /(?:^|\/)(?:\.env(?!\.example$)|\.git\/|target\/|node_modules\/)|\.(?:och|ochx|sqlite)$/.test(
        name,
      ),
    ),
  );
});

test('unauthenticated legal and source routes serve typed files but do not expose source directories or secrets', async () => {
  const app = createApplication();
  async function get(url, method = 'GET') {
    const req = Object.assign(Readable.from([]), {
      url,
      method,
      headers: {},
      socket: { remoteAddress: '127.0.0.1' },
    });
    return new Promise((resolve, reject) => {
      const res = {
        headers: {},
        setHeader(k, v) {
          this.headers[k] = v;
        },
        writeHead(status, headers) {
          this.status = status;
          Object.assign(this.headers, headers);
        },
        end(body) {
          resolve({ status: this.status, headers: this.headers, body });
        },
      };
      app.listeners('request')[0](req, res).catch(reject);
    });
  }
  for (const [url, type] of [
    ['/legal.html', 'text/html'],
    ['/LICENSE.txt', 'text/plain'],
    ['/NOTICE.txt', 'text/plain'],
    ['/openchronology-web-source.tar.gz', 'application/gzip'],
  ]) {
    const response = await get(url);
    assert.equal(response.status, 200);
    assert(response.headers['Content-Type'].startsWith(type));
    assert(response.body.length > 0);
    assert.equal((await get(url, 'HEAD')).body, undefined);
  }
  for (const url of ['/.env', '/legal/PRIVACY.md', '/scripts/source.mjs', '/server/auth.mjs'])
    assert.equal((await get(url)).status, 404);
});
