// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { queryPlugins } from '../server/query-plugins.mjs';
import { BUILTIN_PLUGINS, validateInstalledPlugins } from '../dist/core.mjs';
test('read-only plugin projection accepts a bounded comparison union without increasing document limits', () => {
  const plugins = Array.from({ length: 33 }, (_, i) => ({
    enabled: true,
    manifest: { ...BUILTIN_PLUGINS[0], id: 'projection-' + i },
  }));
  assert.equal(queryPlugins(plugins).length, 33);
  assert.throws(() => validateInstalledPlugins(plugins));
  assert.throws(() => queryPlugins([plugins[0], plugins[0]]), /Duplicate/);
  assert.throws(() => queryPlugins(Array(257).fill(plugins[0])), /budget/);
});
