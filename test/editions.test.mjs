// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Editions (#197): how each offline edition starts its new timelines.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAUSAL_FACTOR_ANALYSIS,
  EDITIONS,
  Q,
  aroundToday,
  blankDocument,
  editionById,
  validateDocument,
} from '../dist/core.mjs';

test('the general offline file starts timelines with no plugins and exact rationals', () => {
  const doc = blankDocument();
  assert.equal(doc.plugins, undefined);
  assert.equal(doc.presentation, undefined);
  assert.deepEqual(validateDocument(doc).events, []);
  assert.equal(editionById(null), null);
  assert.equal(editionById('unknown'), null);
});

test('CFAM timelines start with its suite enabled and Gregorian dates in the local offset', () => {
  const cfam = editionById('cfam');
  const doc = validateDocument(blankDocument(cfam, -300));
  assert.deepEqual(
    doc.plugins,
    CAUSAL_FACTOR_ANALYSIS.plugins.map((manifest) => ({ manifest, enabled: true })),
  );
  assert.equal(doc.presentation.mode, 'gregorian');
  assert.equal(doc.presentation.offsetMinutes, -300);
  assert.equal(doc.presentation.scale, '1/1');
  assert.equal(doc.presentation.origin, '0/1');
  // Offsets beyond a fixed zone's range are clamped, as presentations allow ±1439 minutes.
  assert.equal(blankDocument(cfam, 2000).presentation.offsetMinutes, 1439);
});

test('editions have distinct IDs fit for a file name and an address', () => {
  const ids = EDITIONS.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[a-z][a-z0-9-]*$/);
});

test('an empty Gregorian timeline opens on the fortnight around now', () => {
  const now = Date.UTC(2026, 9, 17, 12, 30, 15, 250);
  const { left, span } = aroundToday(now);
  assert(span.equals(Q.from(14n * 86400n)));
  assert(left.add(span.div(Q.from(2n))).equals(Q.from(BigInt(now), 1000n)));
});
