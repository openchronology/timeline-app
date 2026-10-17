// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// One case in the administrators' report queue (platform/components/admin-reports.jsx),
// rendered: the decisions it offers for a case in force, with and without a review asked.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/** The component, bundled as Next.js would compile it (React itself shared with this test). */
async function load() {
  // Inside the project, so the bundle finds the project's React.
  const cache = new URL('../node_modules/.cache', import.meta.url).pathname;
  await mkdir(cache, { recursive: true });
  const dir = await mkdtemp(join(cache, 'admin-reports-'));
  const file = join(dir, 'admin-reports.mjs');
  await build({
    entryPoints: [new URL('../platform/components/admin-reports.jsx', import.meta.url).pathname],
    outfile: file,
    bundle: true,
    format: 'esm',
    platform: 'node',
    jsx: 'automatic',
    external: ['react', 'react-dom'],
    logLevel: 'silent',
  });
  try {
    return await import(pathToFileURL(file).href);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
const { ReportCase } = await load();
const buttons = (item) =>
  [
    ...renderToStaticMarkup(createElement(ReportCase, { item, busy: false, decide() {} })).matchAll(
      /<button[^>]*>([^<]*)<\/button>/g,
    ),
  ].map(([, text]) => text);
const item = (status, appealed) => ({
  id: 'c1',
  status,
  target_kind: 'timeline',
  target: { title: 'Reported' },
  path: '/someone/reported',
  owner: 'someone',
  report_count: 1,
  reports: [{ category: 'other', reporter: 'reader', created_at: '2026-10-01T00:00:00Z' }],
  created_at: '2026-10-01T00:00:00Z',
  decided_at: '2026-10-01T01:00:00Z',
  reason: 'Decided.',
  labels: status === 'labelled' ? ['violence'] : null,
  appealed_at: appealed ? '2026-10-02T00:00:00Z' : null,
  appeal: appealed ? 'Please look again.' : null,
  appeal_decided_at: null,
});

test('a review asked of labels offers to keep them, as a restriction offers to keep it (#177)', () => {
  assert.deepEqual(buttons(item('labelled', true)), ['Keep the labels', 'Remove the labels']);
  assert.deepEqual(buttons(item('labelled', false)), ['Remove the labels']);
  assert.deepEqual(buttons(item('restricted', true)), [
    'Keep the restriction',
    'Lift the restriction',
  ]);
  assert.deepEqual(buttons(item('restricted', false)), ['Lift the restriction']);
});
