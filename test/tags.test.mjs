// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Entity tags: normalised like timeline tags, and separating a timeline into tracks by tag.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TimelineIndex,
  Viewport,
  Q,
  validateDocument,
  validatePluginManifest,
  filterDocument,
  separationArcs,
  tagCounts,
  viewFilterKey,
  validateEntityTags,
  validateTags,
  validateSeparations,
  separationTracks,
  tagSeparation,
  viewSeparations,
  sameSeparation,
} from '../dist/core.mjs';
const doc = () => ({
  format: 'openchronology',
  version: 1,
  title: 'Tags',
  description: '',
  events: [
    { id: 'a', time: '1/1', metadata: { title: 'A', tags: [' War ', 'war', 'TRADE'] } },
    { id: 'b', time: '2/1', metadata: { title: 'B' } },
    { id: 'c', time: '3/1', metadata: { title: 'C', tags: ['art'] } },
  ],
  durations: [
    { id: 'x', start: { moment: 'b' }, end: '9/1', metadata: { tags: ['War'] } },
    { id: 'y', start: '0/1', end: { moment: 'a' }, metadata: {} },
  ],
});
test('entity tags normalize like timeline tags; other shapes stay custom metadata', () => {
  const d = validateDocument(doc());
  assert.deepEqual(d.events[0].metadata.tags, ['war', 'trade']);
  assert.deepEqual(d.durations.find((x) => x.id === 'x').metadata.tags, ['war']);
  // Older documents may use "tags" for something else; they still open unchanged.
  const custom = validateDocument({
    ...doc(),
    events: [{ id: 'z', time: '0/1', metadata: { tags: { kind: 'legacy' } } }],
    durations: [],
  });
  assert.deepEqual(custom.events[0].metadata.tags, { kind: 'legacy' });
  assert.throws(
    () =>
      validatePluginManifest({
        apiVersion: 1,
        id: 'labels',
        version: 1,
        name: 'Labels',
        description: 'Labels',
        fields: [{ kind: 'text', metadataKey: 'tags', label: 'Tags' }],
      }),
    /reserved/,
  );
});
test('separations split entities by tag and pin durations that follow the other side', () => {
  const d = validateDocument(doc());
  const tagged = filterDocument(d, { tags: ['WAR'], mode: 'any' });
  const rest = filterDocument(d, { tags: ['war'], mode: 'none' });
  assert.deepEqual(
    tagged.events.map((e) => e.id),
    ['a'],
  );
  assert.deepEqual(
    rest.events.map((e) => e.id),
    ['b', 'c'],
  );
  // "x" follows "b", which is on the other side; it keeps b's time as a fixed start.
  assert.deepEqual(tagged.durations, [
    { id: 'x', start: '2/1', end: '9/1', metadata: { tags: ['war'] } },
  ]);
  assert.deepEqual(
    rest.durations.map((x) => [x.start, x.end]),
    [['0/1', '1/1']],
  );
  for (const side of [tagged, rest])
    assert.doesNotThrow(() => new TimelineIndex(validateDocument(side)));
  const frame = new TimelineIndex(tagged).frame(new Viewport(Q.zero, Q.from(10n)), 1000, 24);
  assert.equal(frame.durations[0].first, '2/1');
  assert.equal(viewFilterKey({ tags: ['Trade', 'war', 'trade'], mode: 'any' }), 'any:trade,war');
  assert.deepEqual(tagCounts(d.events, d.durations), [
    { tag: 'war', count: 2 },
    { tag: 'art', count: 1 },
    { tag: 'trade', count: 1 },
  ]);
});

test("a separation keeps the whole timeline's arcs, each end marked by its side (#415)", () => {
  const d = validateDocument({
    ...doc(),
    events: [...doc().events, { id: 'far', time: '1000/1', metadata: { tags: ['war'] } }],
    relationships: [
      { a: { moment: 'a' }, b: { moment: 'c' } },
      { a: { moment: 'a' }, b: { duration: 'x' } },
      { a: { moment: 'b' }, b: { moment: 'c' } },
      { a: { moment: 'b' }, b: { moment: 'far' } },
    ],
  });
  const marks = (filter, lower, upper, threshold = null) =>
    separationArcs(d, filter)(Q.parse(lower), Q.parse(upper), threshold && Q.parse(threshold))
      .edges.map((e) => `${e.id} ${e.aIn} ${e.bIn}`)
      .sort();
  // a and x carry "war"; b and c don't; far does, a long way off.
  assert.deepEqual(marks({ tags: ['war'], mode: 'any' }, '0/1', '10/1'), [
    'd:x~m:a true true',
    'm:a~m:c true false',
    'm:b~m:c false false',
    'm:b~m:far false true',
  ]);
  // Arcs touching the window only, at least the threshold long, as for the whole timeline.
  assert.deepEqual(marks({ tags: ['war'], mode: 'any' }, '500/1', '600/1'), [
    'm:b~m:far false true',
  ]);
  assert.deepEqual(marks({ tags: ['war'], mode: 'any' }, '0/1', '10/1', '3/2'), [
    'm:a~m:c true false',
    'm:b~m:far false true',
  ]);
  // By relationship: a and what it links to directly.
  assert.deepEqual(
    marks({ related: { moment: 'a' }, depth: 'direct', mode: 'any' }, '0/1', '2000/1'),
    ['d:x~m:a true true', 'm:a~m:c true true', 'm:b~m:c false true', 'm:b~m:far false false'],
  );
  // And everything connected to it, which here is every entity linked to anything.
  assert.deepEqual(
    marks({ related: { moment: 'a' }, depth: 'all', mode: 'any' }, '0/1', '2000/1'),
    ['d:x~m:a true true', 'm:a~m:c true true', 'm:b~m:c true true', 'm:b~m:far true true'],
  );
});

test('events may carry tags of up to 128 characters; timelines keep 64 (#538)', () => {
  const long = 'gitlab:git.example.com/group/subgroup/project!1234'.padEnd(128, 'x');
  assert.deepEqual(validateEntityTags([long]), [long]);
  assert.throws(() => validateEntityTags([long + 'x']), /1–128 characters/);
  assert.throws(() => validateTags([long]), /1–64 characters/);
  // An event keeps it; a separation and a chart series select by it.
  const doc = validateDocument({
    format: 'openchronology',
    version: 1,
    title: 'Long tags',
    description: '',
    events: [{ id: 'a', time: '1/1', metadata: { tags: [long] } }],
  });
  assert.deepEqual(doc.events[0].metadata.tags, [long]);
  assert.equal(viewFilterKey({ tags: [long], mode: 'any' }), 'any:' + long);
  assert.throws(
    () => validateDocument({ ...doc, tags: [long] }),
    /1–64 characters/,
    'a timeline’s own tags stay short',
  );
});

test('separations disjoin from each source at a time, a moment, or their first moment (#549)', () => {
  const doc = validateDocument({
    format: 'openchronology',
    version: 1,
    title: 'Disjoins',
    description: '',
    events: [
      { id: 'w1', time: '1/1', metadata: { tags: ['war'] } },
      { id: 'w6', time: '6/1', metadata: { tags: ['war'] } },
      { id: 't2', time: '2/1', metadata: { tags: ['trade'] } },
      { id: 'fair', time: '7/1', metadata: { tags: ['trade', 'war'] } },
      { id: 'x', time: '3/1', metadata: {} },
    ],
    durations: [{ id: 'd', start: '8/1', end: '9/1', metadata: { tags: ['war'] } }],
  });
  const ids = (separations, track) => {
    const side = filterDocument(doc, { separations, track });
    return [...side.events.map((e) => e.id), ...(side.durations ?? []).map((d) => d.id)].sort();
  };
  // At an exact time: war leaves the main timeline at 5.
  const at = [{ tags: ['war'], disjoins: [{ from: null, at: '5' }] }];
  assert.deepEqual(ids(at, 0), ['d', 'fair', 'w6']);
  assert.deepEqual(ids(at, null), ['t2', 'w1', 'x']);
  // At a moment's time, followed as it moves.
  const moment = [{ tags: ['war'], disjoins: [{ from: null, moment: 't2' }] }];
  assert.deepEqual(ids(moment, 0), ['d', 'fair', 'w6']);
  const moved = {
    ...doc,
    events: doc.events.map((e) => (e.id === 't2' ? { ...e, time: '6/1' } : e)),
  };
  assert.deepEqual(
    filterDocument(moved, { separations: moment, track: 0 })
      .events.map((e) => e.id)
      .sort(),
    ['fair', 'w6'],
  );
  // At the first moment with its tags: here from the start; a moment gone waits forever.
  const first = [{ tags: ['trade'], disjoins: [{ from: null, first: true }] }];
  assert.deepEqual(ids(first, 0), ['fair', 't2']);
  assert.deepEqual(ids([{ tags: ['war'], disjoins: [{ from: null, moment: 'gone' }] }], 0), []);
  // From two sources: trade takes from the main timeline at 1, and from war's track only at
  // 9, so the fair (at 7, in war's track) stays with war.
  const two = [
    { tags: ['war'] },
    {
      tags: ['trade'],
      disjoins: [
        { from: null, at: '1' },
        { from: 0, at: '9' },
      ],
    },
  ];
  assert.deepEqual(ids(two, 1), ['t2']);
  assert.deepEqual(ids(two, 0), ['d', 'fair', 'w1', 'w6']);
  assert.deepEqual(ids(two, null), ['x']);
  // Without disjoins, a separation is its own throughout.
  assert.deepEqual(
    [
      ...separationTracks(
        [{ matches: (_key, tags) => tags.includes('war') }],
        'm:a',
        ['war'],
        Q.from(0n),
      ),
    ],
    [0],
  );
  // Validation.
  assert.deepEqual(
    validateSeparations([{ tags: ['War'], disjoins: [{ from: null, at: '10/2' }] }]),
    [{ tags: ['war'], disjoins: [{ from: null, at: '5/1' }] }],
  );
  for (const [bad, error] of [
    [[{ tags: ['war'], disjoins: [{ from: 0, at: '5' }] }], /another separation/],
    [[{ tags: ['war'], disjoins: [{ from: 1, at: '5' }] }], /another separation/],
    [
      [
        {
          tags: ['war'],
          disjoins: [
            { from: null, at: '5' },
            { from: null, first: true },
          ],
        },
      ],
      /at most once/,
    ],
    [[{ tags: ['war'], disjoins: [{ from: null, at: 'soon' }] }], /exact rational/],
    [[{ tags: ['war'], disjoins: [{ from: null, at: '5', first: true }] }], /a time, a moment, or/],
    [[{ tags: ['war'], disjoins: [{ from: null, moment: 'a b' }] }], /by its ID/],
  ])
    assert.throws(() => validateSeparations(bad), error);
  assert.notEqual(
    viewFilterKey({ separations: at, track: 0 }),
    viewFilterKey({ separations: moment, track: 0 }),
  );
});

test('separations disjoin from later ones, and unite at a time, a moment, or their last moment (#549)', () => {
  const doc = validateDocument({
    format: 'openchronology',
    version: 1,
    title: 'Unions',
    description: '',
    events: [
      { id: 'w1', time: '1/1', metadata: { tags: ['war'] } },
      { id: 't2', time: '2/1', metadata: { tags: ['trade'] } },
      { id: 'tw3', time: '3/1', metadata: { tags: ['trade', 'war'] } },
      { id: 'w6', time: '6/1', metadata: { tags: ['war'] } },
      { id: 'fair', time: '7/1', metadata: { tags: ['trade', 'war'] } },
      { id: 'x', time: '3/1', metadata: {} },
    ],
    durations: [{ id: 'd', start: '8/1', end: '9/1', metadata: { tags: ['war'] } }],
  });
  const ids = (separations, track) => {
    const side = filterDocument(doc, { separations: validateSeparations(separations), track });
    return [...side.events.map((e) => e.id), ...(side.durations ?? []).map((d) => d.id)].sort();
  };
  // War disjoins from trade (a later separation) at 4, and from the main timeline at 6: trade
  // is taken first, so the events carrying both stay with trade until 4.
  const complex = [
    {
      tags: ['war'],
      disjoins: [
        { from: 1, at: '4' },
        { from: null, at: '6' },
      ],
    },
    { tags: ['trade'] },
  ];
  assert.deepEqual(ids(complex, 0), ['d', 'fair', 'w6']);
  assert.deepEqual(ids(complex, 1), ['t2', 'tw3']);
  assert.deepEqual(ids(complex, null), ['w1', 'x']);
  // A union at a time: from 6, war's events are back on the main timeline.
  const back = [{ tags: ['war'], unions: [{ into: null, at: '6' }] }];
  assert.deepEqual(ids(back, 0), ['tw3', 'w1']);
  assert.deepEqual(ids(back, null), ['d', 'fair', 't2', 'w6', 'x']);
  // At a moment's time, and at its last moment (the fair, at 7; durations follow it).
  assert.deepEqual(ids([{ tags: ['war'], unions: [{ into: null, moment: 'w6' }] }], 0), [
    'tw3',
    'w1',
  ]);
  assert.deepEqual(ids([{ tags: ['war'], unions: [{ into: null, last: true }] }], 0), [
    'tw3',
    'w1',
    'w6',
  ]);
  // Into another separation, followed through that one's own union.
  const into = [
    { tags: ['war'], unions: [{ into: 1, at: '6' }] },
    { tags: ['trade'], unions: [{ into: null, at: '7' }] },
  ];
  assert.deepEqual(ids(into, 0), ['tw3', 'w1']);
  assert.deepEqual(ids(into, 1), ['t2', 'tw3', 'w6']);
  assert.deepEqual(ids(into, null), ['d', 'fair', 'x']);
  // Disjoining and uniting: its own track between 2 and 7.
  const between = [
    { tags: ['war'], disjoins: [{ from: null, at: '2' }], unions: [{ into: null, at: '7' }] },
  ];
  assert.deepEqual(ids(between, 0), ['tw3', 'w6']);
  // The latest union passed applies; unions into each other stop rather than go round.
  assert.deepEqual(
    ids(
      [
        {
          tags: ['war'],
          unions: [
            { into: 1, at: '2' },
            { into: null, at: '6' },
          ],
        },
        { tags: ['trade'], unions: [{ into: 0, at: '2' }] },
      ],
      null,
    ),
    ['d', 'fair', 'w6', 'x'],
  );
  for (const [bad, error] of [
    [
      [
        { tags: ['a'], disjoins: [{ from: 1, at: '1' }] },
        { tags: ['b'], disjoins: [{ from: 0, at: '1' }] },
      ],
      /circle/,
    ],
    [[{ tags: ['war'], unions: [{ into: null, first: true }] }], /a time, a moment, or the last/],
    [[{ tags: ['war'], disjoins: [{ from: null, last: true }] }], /a time, a moment, or the first/],
    [
      [
        {
          tags: ['war'],
          unions: [
            { into: null, at: '1' },
            { into: null, last: true },
          ],
        },
      ],
      /at most once/,
    ],
  ])
    assert.throws(() => validateSeparations(bad), error);
});

test('separations by an entity’s relationships, beside separations by tags (#552)', () => {
  const doc = validateDocument({
    format: 'openchronology',
    version: 1,
    title: 'Related',
    description: '',
    events: [
      { id: 'w1', time: '1/1', metadata: { tags: ['war'] } },
      { id: 'm', time: '2/1', metadata: {} },
      { id: 'fair', time: '7/1', metadata: { tags: ['war'] } },
      { id: 'far', time: '9/1', metadata: {} },
      { id: 'x', time: '3/1', metadata: {} },
    ],
    relationships: [
      { a: { moment: 'w1' }, b: { moment: 'm' } },
      { a: { moment: 'm' }, b: { moment: 'fair' } },
      { a: { moment: 'fair' }, b: { moment: 'far' } },
    ],
  });
  const ids = (separations, track) =>
    filterDocument(doc, { separations: validateSeparations(separations), track })
      .events.map((e) => e.id)
      .sort();
  const related = { related: { moment: 'm' }, depth: 'direct' };
  assert.deepEqual(ids([related], 0), ['fair', 'm', 'w1']);
  assert.deepEqual(ids([{ ...related, depth: 'all' }], 0), ['fair', 'far', 'm', 'w1']);
  assert.deepEqual(ids([related], null), ['far', 'x']);
  // Beside tags: an event in both is on both tracks; with a disjoin from war's track at the
  // set's first moment (w1), war's members move.
  assert.deepEqual(ids([{ tags: ['war'] }, related], 0), ['fair', 'w1']);
  assert.deepEqual(ids([{ tags: ['war'] }, related], 1), ['fair', 'm', 'w1']);
  const moving = [{ tags: ['war'] }, { ...related, disjoins: [{ from: 0, first: true }] }];
  assert.deepEqual(ids(moving, 0), []);
  assert.deepEqual(ids(moving, 1), ['fair', 'w1']);
  assert.deepEqual(ids(moving, null), ['far', 'm', 'x']);
  // At its last moment (the fair), the set unites back.
  assert.deepEqual(ids([{ ...related, unions: [{ into: null, last: true }] }], 0), ['m', 'w1']);
  // An entity no longer on the timeline takes nothing.
  assert.deepEqual(ids([{ related: { moment: 'gone' }, depth: 'all' }], 0), []);
  for (const [bad, error] of [
    [[{ related: { moment: 'm' } }], /direct or all/],
    [[{ related: { moment: 'm' }, depth: 'all', tags: ['war'] }], /not both/],
    [[{ related: { moment: 'a b' }, depth: 'all' }], /./],
  ])
    assert.throws(() => validateSeparations(bad), error);
  // Default views keep them; one alone is the older {related, depth}.
  assert.deepEqual(tagSeparation([related]), { related: { moment: 'm' }, depth: 'direct' });
  assert.deepEqual(tagSeparation([{ tags: ['war'] }, related]), {
    separations: [{ tags: ['war'] }, related],
  });
  assert.deepEqual(viewSeparations({ related: { moment: 'm' }, depth: 'all' }), [
    { related: { moment: 'm' }, depth: 'all' },
  ]);
  assert(
    sameSeparation(
      { separations: [related, { tags: ['b', 'a'] }] },
      { separations: [{ tags: ['a', 'b'] }, related] },
    ),
  );
  assert(
    !sameSeparation(
      { separations: [related, { tags: ['a'] }] },
      { related: { moment: 'm' }, depth: 'all' },
    ),
  );
});

test('a comma inside a tag is a semicolon, so events and separations agree', () => {
  assert.deepEqual(validateEntityTags(['Type: Sovereign, banking and currency crisis']), [
    'type: sovereign; banking and currency crisis',
  ]);
  const d = validateDocument({
    ...doc(),
    events: [{ id: 'c', time: '1/1', metadata: { title: 'C', tags: ['a, b', 'war'] } }],
    durations: [],
  });
  assert.deepEqual(d.events[0].metadata.tags, ['a; b', 'war']);
  // Saved before the change, a tag with a comma still reads, and separates, the new way.
  const old = {
    ...doc(),
    events: [{ id: 'o', time: '1/1', metadata: { title: 'O', tags: ['a, b'] } }],
    durations: [],
  };
  const [tagged] = filterDocument(old, { tags: validateEntityTags(['a, b']), mode: 'any' }).events;
  assert.equal(tagged.id, 'o');
  assert.deepEqual(validateSeparations([{ tags: ['a, b'] }])[0].tags, ['a; b']);
});
