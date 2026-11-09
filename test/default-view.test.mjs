// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// A timeline's default view (#416): validated and normalized, carried by documents, the editor's
// index and its sparse saves, and merged like the other settings.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TimelineIndex,
  validateDocument,
  validateTimelineView,
  validateSavedViews,
  sameSeparation,
  separationGroups,
  tagSeparation,
  draftSettings,
  draftDocument,
} from '../dist/core.mjs';
import { RemoteWorkspace } from '../dist/remote-cache.mjs';
import { rebaseDocument } from '../server/merge.mjs';

const doc = (view) => ({
  format: 'openchronology',
  version: 1,
  title: 'Views',
  description: '',
  ...(view === undefined ? {} : { view }),
  events: [{ id: 'a', time: '1/1', metadata: { title: 'A', tags: ['war'] } }],
});

test('a default view is a separation by tags or by an entity, normalized and bounded', () => {
  assert.deepEqual(validateTimelineView({ separation: { tags: [' War ', 'war', 'TRADE'] } }), {
    separation: { tags: ['war', 'trade'] },
  });
  assert.deepEqual(
    validateTimelineView({ separation: { related: { moment: 'a' }, depth: 'all' } }),
    { separation: { related: { moment: 'a' }, depth: 'all' } },
  );
  assert.deepEqual(
    validateTimelineView({ separation: { related: { duration: 'gone' }, depth: 'direct' } }),
    { separation: { related: { duration: 'gone' }, depth: 'direct' } },
    'The entity need not exist: a deleted one opens the whole timeline instead.',
  );
  for (const bad of [
    null,
    [],
    {},
    { separation: null },
    { separation: { tags: [] } },
    { separation: { tags: ['a\u0007b'] } },
    { separation: { tags: Array.from({ length: 41 }, (_, i) => 't' + i) } },
    { separation: { tags: ['x'.repeat(129)] } },
    { separation: { tags: ['war'], mode: 'any' } },
    { separation: { related: { moment: 'a' } } },
    { separation: { related: { moment: 'a' }, depth: 'some' } },
    { separation: { related: { moment: 'a b' }, depth: 'all' } },
    { separation: { related: { moment: 'x'.repeat(129) }, depth: 'all' } },
    { separation: { tags: ['war'] }, bounds: {} },
  ])
    assert.throws(() => validateTimelineView(bad), undefined, JSON.stringify(bad));
});

test('separations compare by their tags in any order, or by entity and depth', () => {
  assert(sameSeparation({ tags: ['a', 'b'] }, { tags: ['b', 'a'] }));
  assert(!sameSeparation({ tags: ['a'] }, { tags: ['a', 'b'] }));
  const related = { related: { moment: 'a' }, depth: 'all' };
  assert(sameSeparation(related, { related: { moment: 'a' }, depth: 'all' }));
  assert(!sameSeparation(related, { related: { moment: 'a' }, depth: 'direct' }));
  assert(!sameSeparation(related, { related: { duration: 'a' }, depth: 'all' }));
  assert(!sameSeparation(related, { tags: ['a'] }));
  assert(!sameSeparation(related, null));
  assert(sameSeparation(null, null));
});

test('documents, the editor index and sparse saves carry the default view', () => {
  const view = { separation: { tags: ['war'] } };
  assert.deepEqual(validateDocument(doc(view)).view, view);
  assert.equal('view' in validateDocument(doc(null)), false, 'null is none, as servers send it');
  assert.throws(() => validateDocument(doc({ separation: { tags: [] } })));
  const index = new TimelineIndex(validateDocument(doc(view)));
  assert.deepEqual(index.document().view, view);
  index.view = undefined;
  assert.equal('view' in index.document(), false);
  // A browser draft keeps it in its settings record.
  const kept = draftDocument({
    settings: draftSettings(new TimelineIndex(validateDocument(doc(view)))),
    moments: index.document().events,
    durations: [],
    links: [],
    retired: [],
  });
  assert.deepEqual(kept.view, view);
  // A server or desktop timeline's unsaved settings, as a save sends them.
  const workspace = new RemoteWorkspace(validateDocument(doc(undefined)));
  workspace.view = { separation: { related: { moment: 'a' }, depth: 'direct' } };
  assert.deepEqual(workspace.patch().settings.view, workspace.view);
});

test('merges take a default view changed on one side, and refuse one changed on both', () => {
  const base = validateDocument(doc(undefined));
  const ours = validateDocument(doc({ separation: { tags: ['war'] } }));
  assert.deepEqual(rebaseDocument(base, ours, base).view, { separation: { tags: ['war'] } });
  assert.deepEqual(rebaseDocument(base, base, ours).view, { separation: { tags: ['war'] } });
  // Cleared on one side, kept on the other: cleared.
  assert.equal('view' in rebaseDocument(ours, base, ours), false);
  const theirs = validateDocument(doc({ separation: { tags: ['trade'] } }));
  assert.throws(() => rebaseDocument(base, ours, theirs), /view/);
});

test('several separations are a default view of groups of tags (#548)', () => {
  const view = validateTimelineView({ separation: { groups: [['War', 'siege'], ['trade']] } });
  assert.deepEqual(view, { separation: { groups: [['war', 'siege'], ['trade']] } });
  assert.throws(() => validateTimelineView({ separation: { groups: [['war']] } }), /two to 7/);
  assert.throws(
    () => validateTimelineView({ separation: { groups: Array(8).fill(['war']) } }),
    /two to 7/,
  );
  assert.throws(
    () => validateTimelineView({ separation: { groups: [['war'], []] } }),
    /needs a tag/,
  );
  // The same groups in any order, each the same tags in any order.
  assert.ok(
    sameSeparation(
      { groups: [['war', 'siege'], ['trade']] },
      { groups: [['trade'], ['siege', 'war']] },
    ),
  );
  assert.ok(!sameSeparation({ groups: [['war'], ['trade']] }, { tags: ['war', 'trade'] }));
  assert.ok(sameSeparation({ tags: ['war'] }, { tags: ['war'] }));
  assert.deepEqual(tagSeparation([['war']]), { tags: ['war'] });
  assert.deepEqual(separationGroups({ groups: [['a'], ['b']] }), [['a'], ['b']]);
});

test('a default view keeps separations that disjoin (#549)', () => {
  const separations = [
    { tags: ['war'], disjoins: [{ from: null, at: '10/2' }] },
    {
      tags: ['siege'],
      disjoins: [
        { from: 0, moment: 'm1' },
        { from: null, first: true },
      ],
    },
  ];
  const view = validateTimelineView({ separation: { separations } });
  assert.deepEqual(view.separation.separations[0].disjoins, [{ from: null, at: '5/1' }]);
  assert.deepEqual(view.separation.separations[1].disjoins, separations[1].disjoins);
  // Kept as {separations} only when one disjoins; otherwise as before.
  assert.deepEqual(tagSeparation([{ tags: ['war'] }]), { tags: ['war'] });
  assert.deepEqual(tagSeparation(view.separation.separations), view.separation);
  // Order matters with disjoins: a disjoin names a separation by its place.
  assert.ok(
    !sameSeparation(view.separation, { separations: [...view.separation.separations].reverse() }),
  );
  assert.throws(
    () =>
      validateTimelineView({
        separation: { separations: [{ tags: ['war'], disjoins: [{ from: 3, at: '1' }] }] },
      }),
    /another separation/,
  );
});

test('a default view names a saved view, and files keep a list of views (#550)', () => {
  assert.deepEqual(validateTimelineView({ id: 'v1', separation: { tags: ['War'] } }), {
    id: 'v1',
    separation: { tags: ['war'] },
  });
  assert.throws(() => validateTimelineView({ id: 'a b', separation: { tags: ['war'] } }), /its ID/);
  assert.throws(() => validateTimelineView({ name: 'x', separation: { tags: ['war'] } }), /only/);
  const views = [
    { id: 'war', title: ' Wars ', separation: { tags: ['War'] } },
    {
      id: 'trade',
      title: 'Trade',
      description: 'Ports and fairs',
      separation: { separations: [{ tags: ['trade'], unions: [{ into: null, last: true }] }] },
    },
  ];
  assert.deepEqual(validateSavedViews(views), [
    { id: 'war', title: 'Wars', separation: { tags: ['war'] } },
    { ...views[1] },
  ]);
  for (const [bad, error] of [
    [[views[0], views[0]], /ID of its own/],
    [[{ ...views[0], title: ' ' }], /title/],
    [[{ ...views[0], description: 'x'.repeat(2001) }], /description/],
    [[{ ...views[0], separation: { tags: [] } }], /tag/],
    [Array.from({ length: 101 }, (_, i) => ({ ...views[0], id: 'v' + i })), /at most 100/],
  ])
    assert.throws(() => validateSavedViews(bad), error);
  // Documents carry them, and the editor's index keeps them.
  const document = validateDocument({
    format: 'openchronology',
    version: 1,
    title: 'Views',
    description: '',
    events: [],
    views,
    view: { id: 'war', separation: { tags: ['war'] } },
  });
  assert.equal(document.views.length, 2);
  const index = new TimelineIndex(document);
  assert.deepEqual(index.document().views, document.views);
  assert.deepEqual(index.document().view, { id: 'war', separation: { tags: ['war'] } });
});
