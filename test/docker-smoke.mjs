// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
const origin = 'http://localhost:5173';
const health = await fetch(`${origin}/healthz`);
assert.equal(health.status, 200);
assert.deepEqual(await health.json(), { status: 'ok', storage: 'postgresql' });
const index = await fetch(origin);
assert.equal(index.status, 200);
const html = await index.text();
assert.match(html, /<html/i);
assert.match(html, /Explore timelines/);
assert.doesNotMatch(html, /id="timeline-stage"/);
assert.match(index.headers.get('content-security-policy'), /'nonce-[^']+'/);
const frame = await fetch(`${origin}/editor/frame`);
assert.equal(frame.status, 200);
assert.match(await frame.text(), /id="timeline-stage"/);
const session = await fetch(`${origin}/api/session`);
assert.equal(session.status, 200);
const state = await session.json();
assert.equal(state.server, true);
assert.equal(state.fileExchange, true);
assert.equal(state.user, null);
assert.equal(typeof state.csrf, 'string');
console.log(
  'PASS container HTTP readiness, frontend, database session, and file exchange configuration.',
);
