// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Newer releases (#601): which latest release is newer than the one running, so only a real
// upgrade is offered; and the platform's switch for administrators' banners.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newerRelease } from '../dist/core.mjs';

test('a newer release is offered only over an older release', () => {
  assert.equal(newerRelease('v0.25.0', 'v0.26.0'), true);
  assert.equal(newerRelease('v0.25.0', 'v0.25.1'), true);
  assert.equal(newerRelease('v0.25.9', 'v1.0.0'), true);
  assert.equal(newerRelease('v0.9.0', 'v0.10.0'), true, 'numbers, not text');
  assert.equal(newerRelease('0.25.0', 'v0.26.0'), true, 'with or without the v');
  assert.equal(newerRelease('v0.26.0-rc.1', 'v0.26.0'), true, 'a release over its pre-release');
  for (const [current, latest] of [
    ['v0.25.0', 'v0.25.0'],
    ['v0.26.0', 'v0.25.0'],
    ['v0.25.0', 'v0.26.0-rc.1'],
    ['', 'v0.26.0'],
    [null, 'v0.26.0'],
    ['0123abc', 'v0.26.0'],
    ['v0.25.0', 'nightly'],
    ['v0.25.0', undefined],
  ])
    assert.equal(newerRelease(current, latest), false, `${current} → ${latest}`);
});

test('administrators’ banners can be turned off', async () => {
  const { updateNoticesEnabled } = await import('../server/site.mjs');
  assert.equal(updateNoticesEnabled({}), true);
  assert.equal(updateNoticesEnabled({ UPDATE_NOTICES: '' }), true);
  assert.equal(updateNoticesEnabled({ UPDATE_NOTICES: 'off' }), false);
  assert.equal(updateNoticesEnabled({ UPDATE_NOTICES: ' OFF ' }), false);
});
