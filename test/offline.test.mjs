// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The offline HTML build: assets embedded, valid script hashes, and no external resources.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Script } from 'node:vm';

test('offline HTML has embedded assets, a valid script hash, and denies external resources', async () => {
  const html = await readFile('dist/openchronology-offline.html', 'utf8');
  assert(html.slice(0, 1024).includes('<meta charset="utf-8" />'));
  const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)];
  // The color scheme's inline script (#382) in the head, then the app's.
  assert.equal(scripts.length, 2);
  const boot = createHash('sha256').update(scripts[0][2]).digest('base64');
  assert(scripts[0][2].includes('data-theme'));
  assert(html.includes(`'sha256-${boot}'`));
  assert.equal(scripts[1][1], ''); // Classic script works directly from file:// without module imports.
  const code = scripts[1][2];
  new Script(code); // The final embedded code must remain valid after HTML escaping and substitution.
  assert(!/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/.test(code));
  assert(!/\beval\s*\(|\bnew\s+Function\s*\(/.test(code));
  const hash = createHash('sha256').update(code).digest('base64');
  assert(html.includes(`script-src 'sha256-${hash}'`));
  for (const rule of [
    "default-src 'none'",
    "connect-src 'none'",
    "worker-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
  ])
    assert(html.includes(rule));
  assert(!/<(?:script|img|iframe|audio|video|source)[^>]+src\s*=/i.test(html));
  const links = [...html.matchAll(/<link\b[^>]*href="([^"]*)"[^>]*>/gi)];
  assert.equal(links.length, 1);
  assert(links[0][1].startsWith('data:image/svg+xml;base64,'));
  assert(!/sourceMappingURL|<script\b[^>]*type="module"/i.test(html));
  assert(!/@import\b|url\(/i.test(html.match(/<style>([\s\S]*?)<\/style>/)[1]));
  assert(html.includes('Copyright (c) 2026 Athan Clark'));
  assert(html.includes('rational-ordered-map/LICENSE') && html.includes('fraction.js/LICENSE'));
});
