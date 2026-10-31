// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Pull requests keep no whole documents: a submitted timeline is kept as rows that read
// through to its base revision, charged what it changes; reviews get a summary computed
// from history; the proposed timeline is read only when asked for; deleting the timeline
// removes it all.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { PostgresStore } from '../server/store.mjs';
import { Collaboration } from '../server/collaboration.mjs';
import { validateDocument, createPresenter, CUSTOM_EXAMPLE, Q } from '../dist/core.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }),
  store = new PostgresStore(pool),
  pulls = new Collaboration(store);
// The owner, and a contributor proposing changes (an owner saves directly instead).
const owner = randomUUID(),
  author = randomUUID(),
  timelines = [];
const order = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const normal = (d) => ({ ...d, events: [...d.events].sort((a, b) => order(a.id, b.id)) });
const count = async (sql, params) => Number((await pool.query(sql, params)).rows[0].n);
try {
  const schema = await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8');
  await pool.query(schema);
  for (const id of [owner, author])
    await pool.query(
      'INSERT INTO oc_users(id,username,email_verified_at,terms_version) VALUES($1,$2,now(),oc_policy_version())',
      [id, 'pulls_' + id.slice(0, 8)],
    );
  const moment = (i, title = 'Moment ' + i) => ({
    id: 'm' + i,
    time: `${i}/1`,
    metadata: { title, description: 'Notes '.repeat(20) },
  });
  const original = validateDocument({
    format: 'openchronology',
    version: 1,
    title: 'Pulls',
    description: 'Upstream',
    events: Array.from({ length: 400 }, (_, i) => moment(i)),
    durations: [{ id: 'd', start: { moment: 'm1' }, end: '5/1', metadata: { title: 'Span' } }],
    relationships: [{ a: { moment: 'm2' }, b: { moment: 'm3' } }],
  });
  const size = Buffer.byteLength(JSON.stringify(original));
  let t = await store.create(owner, original);
  timelines.push(t.id);
  await pool.query("INSERT INTO oc_members(timeline_id,user_id,role) VALUES($1,$2,'contributor')", [
    t.id,
    author,
  ]);
  const snapshots = await count('SELECT count(*) AS n FROM oc_snapshots');

  // A submitted timeline is kept as rows reading through to the head, charged its changes.
  const proposed = validateDocument({
    ...original,
    title: 'Proposed',
    events: [
      ...original.events
        .filter((e) => e.id !== 'm9')
        .map((e) => (e.id === 'm4' ? moment(4, 'Edited') : e)),
      moment(400),
    ],
    relationships: [...original.relationships, { a: { moment: 'm5' }, b: { moment: 'm400' } }],
  });
  let p = await pulls.create(t.id, author, {
    title: 'Proposal',
    body: 'Changes',
    baseRevision: t.revision,
    document: proposed,
  });
  const source = async (id) =>
    (
      await pool.query(
        'SELECT timeline_id,number,kind,history_rows,snapshot_id,stored_bytes FROM oc_revisions WHERE id=$1',
        [id],
      )
    ).rows[0];
  let kept = await source(p.source_revision_id);
  assert.deepEqual(
    { ...kept, stored_bytes: undefined },
    {
      timeline_id: p.source_revision_id,
      number: '1',
      kind: 'proposal',
      history_rows: true,
      snapshot_id: null,
      stored_bytes: undefined,
    },
    'kept as rows, outside the timeline',
  );
  assert(Number(kept.stored_bytes) < size / 10, `charged its changes (${kept.stored_bytes})`);
  assert.equal(await count('SELECT count(*) AS n FROM oc_snapshots'), snapshots, 'no snapshot');
  assert.equal(
    await count(
      'SELECT count(*) AS n FROM oc_proposals WHERE id=$1 AND document IS NULL AND base_document IS NULL',
      [p.id],
    ),
    1,
    'no documents stored with the pull request',
  );
  // Its storage entry is its text alone.
  assert.equal(
    await count(
      "SELECT bytes AS n FROM oc_storage_entries WHERE kind='oc_proposals' AND entry_id=$1",
      [p.id],
    ),
    Buffer.byteLength('Proposal') + Buffer.byteLength('Changes'),
  );
  // The review summary comes from history; the document only when asked for.
  assert.equal(p.document, undefined);
  assert.deepEqual(p.changes.settings, ['title']);
  assert.deepEqual(p.changes.moments, { added: 1, removed: 1, changed: 1 });
  assert.deepEqual(p.changes.relationships, { added: 1, removed: 0 });
  assert.deepEqual(p.changes.examples.map((e) => [e.change, (e.after ?? e.before).id]).sort(), [
    ['added', 'm400'],
    ['changed', 'm4'],
    ['removed', 'm9'],
  ]);
  assert.deepEqual(normal((await pulls.document(t.id, p.id, owner)).document), normal(proposed));

  // Updating keeps another revision against the same base.
  const updated = validateDocument({
    ...proposed,
    events: proposed.events.map((e) => (e.id === 'm6' ? moment(6, 'Also edited') : e)),
  });
  p = await pulls.update(t.id, p.id, author, {
    title: p.title,
    body: p.body,
    baseRevision: p.base_revision,
    revision: p.revision,
    document: updated,
  });
  assert.deepEqual(p.changes.moments, { added: 1, removed: 1, changed: 2 });
  assert.deepEqual(normal((await pulls.document(t.id, p.id, owner)).document), normal(updated));

  // Rebasing onto a changed upstream keeps the result as rows against the new head.
  const upstream = validateDocument({ ...original, description: 'Changed upstream' });
  t = await store.save(t.id, owner, t.revision, upstream);
  p = await pulls.resolve(t.id, p.id, author, { action: 'rebase', revision: p.revision });
  kept = await source(p.source_revision_id);
  assert.equal(kept.kind, 'rebase');
  assert.equal(kept.history_rows, true);
  assert.equal(p.base_revision_id, t.head_revision_id);
  const rebased = { ...updated, description: 'Changed upstream' };
  assert.deepEqual(
    normal((await pulls.document(t.id, p.id, owner)).document),
    normal(validateDocument(rebased)),
  );
  assert.deepEqual(p.changes.settings, ['title']);

  // Merging applies it.
  p = await pulls.resolve(t.id, p.id, owner, { action: 'merge', revision: p.revision });
  assert.equal(p.status, 'merged');
  assert.deepEqual(
    normal((await store.snapshot(t.id, owner)).document),
    normal(validateDocument(rebased)),
  );
  assert.deepEqual(p.changes.moments, { added: 1, removed: 1, changed: 2 }, 'still reviewable');

  // Deleting the timeline deletes its pull requests' revisions and every row they kept.
  const detached = (
    await pool.query(
      "SELECT id FROM oc_revisions WHERE timeline_id=id AND kind IN ('proposal','rebase') AND author_id=$1",
      [author],
    )
  ).rows.map((r) => r.id);
  assert.equal(detached.length, 3);
  await store.transaction(async (c) => {
    await c.query('DELETE FROM oc_timelines WHERE id=$1', [t.id]);
    await store.removeHistory(c, t.id);
  });
  for (const table of [
    'oc_history_moments',
    'oc_history_durations',
    'oc_history_relationships',
    'oc_history_settings',
    'oc_history_moment_overrides',
    'oc_history_bases',
    'oc_revisions',
  ])
    assert.equal(
      await count(`SELECT count(*) AS n FROM ${table} WHERE timeline_id=ANY($1::uuid[])`, [
        [t.id, ...detached],
      ]),
      0,
      `nothing left in ${table}`,
    );

  // Pull requests saved with documents keep them only until migrating: their revisions hold
  // the same documents.
  let legacy = await store.create(owner, original);
  timelines.push(legacy.id);
  const legacyPull = randomUUID();
  await pool.query(
    'INSERT INTO oc_proposals(id,timeline_id,author_id,title,base_revision,base_document,document) VALUES($1,$2,$3,$4,1,$5::jsonb,$6::jsonb)',
    [legacyPull, legacy.id, owner, 'Old', JSON.stringify(original), JSON.stringify(proposed)],
  );
  await pool.query(schema);
  assert.equal(
    await count('SELECT count(*) AS n FROM oc_proposals WHERE id=$1 AND document IS NULL', [
      legacyPull,
    ]),
    1,
  );
  const old = await pulls.get(legacy.id, legacyPull, owner);
  assert.deepEqual(old.changes.moments, { added: 1, removed: 1, changed: 1 });
  assert.deepEqual(
    normal((await pulls.document(legacy.id, legacyPull, owner)).document),
    normal(proposed),
  );
  // Reviews list times as the timeline displays them (#384): exact coordinates by default,
  // Gregorian dates and years when the timeline shows them, a changed time old → new, and
  // durations from start to end.
  assert.deepEqual(old.changes.examples.map((e) => [e.change, e.times]).sort(), [
    ['added', { before: null, after: '400/1' }],
    ['changed', { before: '4/1', after: '4/1' }],
    ['removed', { before: '9/1', after: null }],
  ]);
  const display = (mode, more = {}) => ({
    version: 1,
    mode,
    significantDigits: 6,
    unit: '',
    scale: '1',
    origin: '0',
    offsetMinutes: 0,
    ...more,
  });
  const review = async (presentation, proposedPresentation = presentation) => {
    const dated = validateDocument({
      ...original,
      presentation,
      events: [moment(0), { ...moment(1), time: '-1393545600/1' }],
      durations: [],
      relationships: [],
    });
    const d = await store.create(owner, dated);
    timelines.push(d.id);
    await pool.query(
      "INSERT INTO oc_members(timeline_id,user_id,role) VALUES($1,$2,'contributor')",
      [d.id, author],
    );
    const pull = await pulls.create(d.id, author, {
      title: 'Dates',
      body: '',
      baseRevision: d.revision,
      document: validateDocument({
        ...dated,
        presentation: proposedPresentation,
        events: [{ ...moment(1), time: '-1393500000/1' }, moment(2)],
        durations: [{ id: 'd', start: '-1393545600/1', end: '0/1', metadata: { title: 'Span' } }],
      }),
    });
    const times = (list) =>
      Object.fromEntries(list.map((e) => [(e.after ?? e.before).id, e.times]));
    return {
      moments: times(pull.changes.examples),
      durations: times(pull.changes.durationExamples),
    };
  };
  const gregorian = await review(display('gregorian'));
  assert.deepEqual(gregorian.moments, {
    m0: { before: '1970 CE', after: null },
    m1: { before: '1925-11-04 CE', after: '1925-11-04 CE 12:40 UTC' },
    m2: { before: null, after: '1970-01-01 CE 00:00:02 UTC' },
  });
  assert.deepEqual(gregorian.durations.d, { before: null, after: '1925-11-04 CE – 1970 CE' });
  const years = await review(display('float', { unit: 'years', scale: '31557600' }));
  assert.deepEqual(years.moments.m1, { before: '-44.1588 years', after: '-44.1574 years' });
  // A pull request changing the display: old times in the base's, new in its own.
  const redisplayed = await review(
    display('float', { unit: 'million years', scale: '31557600000000' }),
    display('gregorian'),
  );
  assert.deepEqual(redisplayed.moments.m1, {
    before: '-0.0000441588 million years',
    after: '1925-11-04 CE 12:40 UTC',
  });
  // A duration's end anchored to a moment prints as that moment's time in the revision the
  // version belongs to (#386): the base's for the old, the proposal's for the new, so a moved
  // anchor reads old → new. The anchors of every example are read in one query per revision.
  const day = 86400;
  /** A pull request moving m0 a day later and retitling twelve spans, with what its summary costs. */
  const spansReview = async (presentation, end, since) => {
    const dated = validateDocument({
      ...original,
      presentation,
      events: [moment(0), { ...moment(1), time: '-1393545600/1' }, moment(2)],
      durations: Array.from({ length: 12 }, (_, i) => ({
        id: 'span' + i,
        start: '-1393545600/1',
        end,
        metadata: { title: 'Span ' + i },
      })),
      relationships: [],
    });
    const d = await store.create(owner, dated);
    timelines.push(d.id);
    await pool.query(
      "INSERT INTO oc_members(timeline_id,user_id,role) VALUES($1,$2,'contributor')",
      [d.id, author],
    );
    const pull = await pulls.create(d.id, author, {
      title: 'Spans',
      body: '',
      baseRevision: d.revision,
      document: validateDocument({
        ...dated,
        events: [{ ...moment(0), time: `${day}/1` }, dated.events[1], moment(2)],
        durations: [
          ...dated.durations.map((x) => ({ ...x, metadata: { title: 'Renamed ' + x.id } })),
          { id: 'since', start: since, end: `${2 * day}/1`, metadata: { title: 'Since' } },
        ],
      }),
    });
    // The summary again, counting its queries.
    let queries = 0;
    const counting = Object.assign(Object.create(store), {
      pool: {
        query: (...args) => {
          queries++;
          return pool.query(...args);
        },
      },
    });
    const changes = await new Collaboration(counting).changes(
      pull.base_revision_id,
      pull.source_revision_id,
      presentation,
    );
    const times = Object.fromEntries(
      changes.durationExamples.map((e) => [(e.after ?? e.before).id, e.times]),
    );
    return { times, count: changes.durationExamples.length, queries };
  };
  const anchored = await spansReview(display('gregorian'), { moment: 'm0' }, { moment: 'm1' });
  assert.equal(anchored.count, 13);
  // An anchored end, as a date, old → new as its moment moved.
  assert.deepEqual(anchored.times.span0, {
    before: '1925-11-04 CE – 1970 CE',
    after: '1925-11-04 CE – 1970-01-02 CE',
  });
  // An anchored start.
  assert.deepEqual(anchored.times.since, { before: null, after: '1925-11-04 CE – 1970-01-03 CE' });
  // A custom display prints anchors as its script does.
  const custom = display('custom', { source: CUSTOM_EXAMPLE });
  const scripted = await spansReview(custom, { moment: 'm0' }, { moment: 'm1' });
  const presenter = createPresenter(custom);
  assert.equal(
    scripted.times.span0.after,
    `${presenter.alone(Q.parse('-1393545600/1'))} – ${presenter.alone(Q.parse(`${day}/1`))}`,
  );
  // Thirteen anchored examples on both sides cost one query per revision more than the same
  // summary with exact times: no query per anchor.
  const exact = await spansReview(display('gregorian'), '0/1', '0/1');
  assert.equal(exact.times.span0.before, '1925-11-04 CE – 1970 CE');
  assert.equal(anchored.queries, exact.queries + 2);
  // A duration the pull request leaves alone whose anchor moment it moves is listed as moved
  // (#395), its span old → new, once even when anchored at both ends; one it also edits only
  // as changed. They are found through the anchors' indexes: one query for the moved moments'
  // page, and the moved examples' anchors one query per revision, whatever the timeline's size.
  /** A pull request on a timeline of `plain` unanchored durations and 40 anchored ones. */
  const movesReview = async (plain, move) => {
    const anchoredSpans = [
      ...Array.from({ length: 38 }, (_, i) => ({
        id: 'with' + String(i).padStart(2, '0'),
        start: { moment: 'm0' },
        end: `${10 * day}/1`,
        metadata: { title: 'With ' + i },
      })),
      { id: 'both', start: { moment: 'm0' }, end: { moment: 'm1' }, metadata: { title: 'Both' } },
      { id: 'edited', start: { moment: 'm0' }, end: `${9 * day}/1`, metadata: { title: 'Old' } },
    ];
    const dated = validateDocument({
      ...original,
      presentation: display('gregorian'),
      events: [moment(0), { ...moment(1), time: `${day}/1` }, moment(2)],
      durations: [
        ...Array.from({ length: plain }, (_, i) => ({
          id: 'plain' + i,
          start: `${i}/1`,
          end: `${i + 1}/1`,
          metadata: { title: 'Plain ' + i },
        })),
        ...anchoredSpans,
      ],
      relationships: [],
    });
    const d = await store.create(owner, dated);
    timelines.push(d.id);
    await pool.query(
      "INSERT INTO oc_members(timeline_id,user_id,role) VALUES($1,$2,'contributor')",
      [d.id, author],
    );
    const pull = await pulls.create(d.id, author, {
      title: 'Moves',
      body: '',
      baseRevision: d.revision,
      document: validateDocument({
        ...dated,
        // m0 a day later and m1 two, or neither: m2 retitled either way.
        events: move
          ? [
              { ...moment(0), time: `${day}/1` },
              { ...moment(1, 'Second'), time: `${3 * day}/1` },
              moment(2, 'Renamed'),
            ]
          : [dated.events[0], dated.events[1], moment(2, 'Renamed')],
        durations: dated.durations.map((x) =>
          x.id === 'edited' ? { ...x, metadata: { title: 'New' } } : x,
        ),
      }),
    });
    let queries = 0;
    const counting = Object.assign(Object.create(store), {
      pool: {
        query: (...args) => {
          queries++;
          return pool.query(...args);
        },
      },
    });
    const changes = await new Collaboration(counting).changes(
      pull.base_revision_id,
      pull.source_revision_id,
      display('gregorian'),
    );
    return { changes, queries };
  };
  const moves = await movesReview(200, true);
  assert.deepEqual(moves.changes.durations, { added: 0, removed: 0, changed: 1, moved: 39 });
  const movedExamples = moves.changes.durationExamples.filter((e) => e.change === 'moved');
  // Thirty shown, in ID order; all thirty-nine counted.
  assert.equal(movedExamples.length, 30);
  assert.deepEqual(
    movedExamples.slice(0, 2).map((e) => [e.after.id, e.times, e.movedWith]),
    [
      [
        'both',
        { before: '1970 CE – 1970-01-02 CE', after: '1970-01-02 CE – 1970-01-04 CE' },
        [
          { id: 'm0', title: 'Moment 0' },
          { id: 'm1', title: 'Second' },
        ],
      ],
      [
        'with00',
        { before: '1970 CE – 1970-01-11 CE', after: '1970-01-02 CE – 1970-01-11 CE' },
        [{ id: 'm0', title: 'Moment 0' }],
      ],
    ],
  );
  // The edited one only as changed, its span old → new.
  assert.deepEqual(
    moves.changes.durationExamples
      .filter((e) => e.after?.id === 'edited')
      .map((e) => [e.change, e.times.after]),
    [['changed', '1970-01-02 CE – 1970-01-10 CE']],
  );
  // The cost: one query to find them, one per revision for their anchors (the edited
  // duration's anchors are read in the same two), whatever the number of durations.
  const still = await movesReview(200, false);
  assert.deepEqual(still.changes.durations, { added: 0, removed: 0, changed: 1, moved: 0 });
  assert.equal(moves.queries, still.queries + 1);
  const larger = await movesReview(2000, true);
  assert.equal(larger.changes.durations.moved, 39);
  assert.equal(larger.queries, moves.queries);
  console.log(
    'PASS pull requests keep no documents: submitted timelines are kept as rows charged their changes, reviewed from history, updated, rebased and merged, and removed with their timeline.',
  );
} finally {
  for (const id of timelines) {
    await pool.query('DELETE FROM oc_timelines WHERE id=$1', [id]);
    await store.transaction((c) => store.removeHistory(c, id)).catch(() => {});
  }
  await pool.query('DELETE FROM oc_storage_entries WHERE user_id=ANY($1::uuid[])', [
    [owner, author],
  ]);
  await pool.query('DELETE FROM oc_users WHERE id=ANY($1::uuid[])', [[owner, author]]);
  await pool.end();
}
