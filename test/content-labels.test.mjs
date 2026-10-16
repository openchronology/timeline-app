// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Sensitive-content labels (#115): reading them leniently, saying them, and carrying them in
// what markers and duration bands are drawn from, so a labelled entity's images are blurred.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  contentLabels,
  describeLabels,
  pluginMetadata,
  durationOverview,
  CONTENT_LABELS_KEY,
  BUILTIN_PLUGINS,
} from '../dist/core.mjs';

test('labels read leniently, in their usual order', () => {
  assert.deepEqual(contentLabels(['disturbing', 'nudity', 'gore', 3, 'nudity']), [
    'nudity',
    'disturbing',
  ]);
  assert.deepEqual(contentLabels('violence'), []);
  assert.deepEqual(contentLabels(undefined), []);
});

test('labels read as a phrase', () => {
  assert.equal(describeLabels(['violence']), 'Graphic violence');
  assert.equal(describeLabels(['nudity', 'violence']), 'Nudity and graphic violence');
  assert.equal(
    describeLabels(['disturbing', 'violence', 'nudity']),
    'Nudity, graphic violence and disturbing content',
  );
  assert.equal(describeLabels([]), '');
});

test('markers and duration bands carry an entity’s labels', () => {
  const plugins = BUILTIN_PLUGINS.map((manifest) => ({ manifest, enabled: true }));
  const metadata = { title: 'A battle', [CONTENT_LABELS_KEY]: ['violence', 'bogus'] };
  assert.deepEqual(pluginMetadata(plugins, metadata)[CONTENT_LABELS_KEY], ['violence']);
  assert.equal(pluginMetadata(plugins, { title: 'Calm' })[CONTENT_LABELS_KEY], undefined);
  assert.deepEqual(durationOverview(metadata)[CONTENT_LABELS_KEY], ['violence']);
  assert.equal(durationOverview({ title: 'Calm' })[CONTENT_LABELS_KEY], undefined);
});
