// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Which events search engines list (#467): the shape of a note, and templated notes.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EVENT_LISTINGS,
  LISTED_NOTES,
  skeleton,
  TEMPLATE_MIN,
  templatedNotes,
} from '../server/event-listing.mjs';

const padded = (text) => text + ' The record continues with details.'.repeat(5);

test('a note’s skeleton drops what a template fills in', () => {
  // Two log lines a program wrote: the same shape.
  const a = skeleton(
    'At 2026-03-14T02:35:04.539686 UTC, `nginx` on `web-1` emitted a `info` record in the synthetic orders-API incident.',
  );
  const b = skeleton(
    'At 2026-03-14T04:08:33.328777 UTC, `api` on `web-2` emitted a `error` record in the synthetic orders-API incident.',
  );
  assert.equal(a, b);
  assert.equal(a, 'at t utc on emitted a record in the synthetic orders api');
  // Addresses, paths and quoted text too.
  assert.equal(
    skeleton(
      'GET /api/orders from "10.0.0.1" by ops@example.com via https://example.com/x took 21ms',
    ),
    'get from by via took ms',
  );
  // Two notes written by hand don't.
  assert.notEqual(
    skeleton('The Samnite Wars made Rome master of central Italy.'),
    skeleton('Romulus, the founder, vanished in a storm, legend says.'),
  );
  assert.equal(skeleton(null), '');
});

test('a timeline’s notes are templated when half of a large enough sample share a shape', () => {
  assert.deepEqual(EVENT_LISTINGS, ['auto', 'all', 'none']);
  const logged = (i) =>
    padded(
      `At 02:${String(i).padStart(2, '0')}:04 UTC, \`nginx\` on \`web-${i % 3}\` emitted a record.`,
    );
  const written = (i) =>
    padded(`Event number ${'abcdefghijklmnopqrstuvwxyz'[i % 26]} began a new era ${i}.`);
  assert(logged(1).length >= LISTED_NOTES);
  // All templated, or half of them: templated.
  assert.equal(templatedNotes(Array.from({ length: 40 }, (_, i) => logged(i))), true);
  assert.equal(
    templatedNotes(
      Array.from({ length: 40 }, (_, i) => (i % 2 ? logged(i) : `${i} ` + written(i))),
    ),
    true,
  );
  // Written by hand: each its own.
  const hand = Array.from({ length: 40 }, (_, i) =>
    padded(`${'abcdefghijklmnopqrstuvwxyz'[i % 26]}${i} happened here first`),
  );
  assert.equal(templatedNotes(hand), false);
  // Too few long notes to tell, and short notes don't count.
  assert.equal(
    templatedNotes(Array.from({ length: TEMPLATE_MIN - 1 }, (_, i) => logged(i))),
    false,
  );
  assert.equal(
    templatedNotes(Array.from({ length: 40 }, (_, i) => `At 02:${i}:04 UTC, nginx emitted.`)),
    false,
  );
});
