// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Q,
  parseTime,
  timeMapping,
  timeMappingInput,
  mapTime,
  mappedEntities,
  unchangedMapping,
  filterDocument,
} from '../dist/core.mjs';

test('a mapping is a positive scale around a point, then an offset, in exact rationals', () => {
  const m = timeMapping({ scale: '3/2', offset: '-0.25', around: '10' });
  assert.equal(mapTime(Q.parse('14/1'), m).toString(), '63/4'); // (14-10)*1.5+10-0.25
  assert.equal(mapTime(Q.parse('10/1'), m).toString(), '39/4');
  // Around zero by default, as comparisons align: time × scale + offset.
  assert.equal(mapTime(Q.parse('4/1'), timeMapping({ scale: '2', offset: '1' })).toString(), '9/1');
  assert.deepEqual(timeMappingInput(m), { scale: '3/2', offset: '-1/4', around: '10/1' });
  assert(unchangedMapping(timeMapping({ scale: '1', offset: '0', around: '5' })));
  for (const scale of ['0', '-1', 'x', '', undefined])
    assert.throws(() => timeMapping({ scale, offset: '0' }));
  assert.throws(() => timeMapping({ scale: '1', offset: 'later' }), /offset/);
  assert.throws(() => timeMapping(null));
});

test('mapped entities: everything or what a filter selects; anchored ends follow moments', () => {
  const document = {
    events: [
      { id: 'a', time: '1/1', metadata: { tags: ['x'] } },
      { id: 'b', time: '2/1', metadata: {} },
      { id: 'c', time: '3/1', metadata: {} },
    ],
    durations: [
      { id: 'f', start: '1/1', end: '5/1', metadata: {} },
      { id: 'h', start: { moment: 'a' }, end: '9/1', metadata: { tags: ['x'] } },
      { id: 'm', start: { moment: 'a' }, end: { moment: 'b' }, metadata: {} },
    ],
    relationships: [{ a: { moment: 'b' }, b: { moment: 'c' } }],
  };
  const shift = timeMapping({ scale: '1', offset: '10' });
  const all = mappedEntities(document, shift, null, parseTime);
  assert.deepEqual(
    all.events.map((e) => [e.id, e.time]),
    [
      ['a', '11/1'],
      ['b', '12/1'],
      ['c', '13/1'],
    ],
  );
  // The duration that only follows moments is left out: it moves with them.
  assert.deepEqual(
    all.durations.map((d) => [d.id, d.start, d.end]),
    [
      ['f', '11/1', '15/1'],
      ['h', { moment: 'a' }, '19/1'],
    ],
  );
  assert.deepEqual(all.events[0].metadata, { tags: ['x'] }, 'Metadata is kept.');
  // The same selection as separating by that filter.
  for (const filter of [
    { tags: ['x'], mode: 'any' },
    { tags: ['x'], mode: 'none' },
    { related: { moment: 'b' }, depth: 'direct', mode: 'any' },
  ]) {
    const mapped = mappedEntities(document, shift, filter, parseTime);
    const side = filterDocument(document, filter);
    assert.deepEqual(
      mapped.events.map((e) => e.id),
      side.events.map((e) => e.id),
    );
  }
  assert.deepEqual(
    mappedEntities(document, shift, { tags: ['x'], mode: 'any' }, parseTime).durations.map(
      (d) => d.id,
    ),
    ['h'],
  );
  // Nothing moves, nothing is returned; nor does a time the mapping keeps.
  assert.deepEqual(
    mappedEntities(document, timeMapping({ scale: '1', offset: '0' }), null, parseTime),
    {
      events: [],
      durations: [],
    },
  );
  const aroundB = mappedEntities(
    document,
    timeMapping({ scale: '2', offset: '0', around: '2' }),
    null,
    parseTime,
  );
  assert.deepEqual(
    aroundB.events.map((e) => e.id),
    ['a', 'c'],
  );
});
