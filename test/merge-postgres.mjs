// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Oracle: merges, rebases and syncs made entity by entity from saved history (mergePatch in
// server/merge.mjs) give the timeline rebaseDocument gives from the three whole documents,
// and conflict exactly when it does, over random edits to both sides of forks.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { PostgresStore, applyPatch } from '../server/store.mjs';
import { Versioning } from '../server/versioning.mjs';
import { Collaboration } from '../server/collaboration.mjs';
import { rebaseDocument } from '../server/merge.mjs';
import { validateDocument } from '../dist/core.mjs';
import { randomEdits } from './random-edits.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }),
  store = new PostgresStore(pool),
  versions = new Versioning(store),
  pulls = new Collaboration(store);
const user = randomUUID(),
  // Each round's fork and pull requests are another account's (one fork of a timeline to an
  // account); timelines saved by someone other than `user` map to their owner.
  users = [user],
  owners = new Map(),
  created = [];
const { random, randomDocument, randomPatch } = randomEdits(113);
const order = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const key = (r) => JSON.stringify([r.a, r.b]);
/** Documents compare independent of the order of their entities. */
const normal = (d) => ({
  ...d,
  events: [...d.events].sort((a, b) => order(a.id, b.id)),
  ...(d.durations ? { durations: [...d.durations].sort((a, b) => order(a.id, b.id)) } : {}),
  ...(d.relationships
    ? { relationships: [...d.relationships].sort((a, b) => order(key(a), key(b))) }
    : {}),
});
/** The oracle's result, or 'conflict'. */
function expected(base, proposal, upstream) {
  try {
    return normal(rebaseDocument(base, proposal, upstream));
  } catch (e) {
    if (e.status === 409) return 'conflict';
    throw e;
  }
}
/** What an operation leaves, or 'conflict'. */
async function outcome(operation, read) {
  try {
    await operation();
  } catch (e) {
    if (e.status === 409 && e.conflicts) return 'conflict';
    throw e;
  }
  return normal(await read());
}
let step = 0;
/** A few random saves to a timeline; returns its document and access record. */
async function edit(timeline, document, saves) {
  for (let i = 0; i < saves; i++) {
    const patch = randomPatch(document, ++step);
    let next;
    try {
      next = validateDocument(applyPatch(document, patch));
    } catch {
      continue;
    }
    timeline = await store.save(
      timeline.id,
      owners.get(timeline.id) ?? user,
      timeline.revision,
      undefined,
      patch,
    );
    document = next;
  }
  return { timeline, document };
}
/**
 * Saves `change` (an event, or null to delete) to one moment: crafted edits that make both
 * sides of a merge touch the same moment.
 */
async function touch(timeline, document, id, change) {
  const patch = {
    settings: { ...document, events: [], durations: undefined, relationships: undefined },
    changes: [{ id, event: change }],
  };
  const next = validateDocument(applyPatch(document, patch));
  return {
    timeline: await store.save(
      timeline.id,
      owners.get(timeline.id) ?? user,
      timeline.revision,
      undefined,
      patch,
    ),
    document: next,
  };
}
/** Saves a crafted patch of `parts` (changes, durationChanges, relationshipChanges). */
async function savePatch({ timeline, document }, parts) {
  const patch = {
    settings: { ...document, events: [], durations: undefined, relationships: undefined },
    changes: [],
    durationChanges: [],
    relationshipChanges: [],
    ...parts,
  };
  const next = validateDocument(applyPatch(document, patch));
  return {
    timeline: await store.save(
      timeline.id,
      owners.get(timeline.id) ?? user,
      timeline.revision,
      undefined,
      patch,
    ),
    document: next,
  };
}
/** A moment some duration is anchored to, or any moment. */
function anchoredMoment(document) {
  const anchors = (document.durations ?? [])
    .flatMap((d) => [d.start, d.end])
    .filter((e) => typeof e !== 'string')
    .map((e) => e.moment);
  return anchors.length ? anchors[Math.floor(random() * anchors.length)] : document.events[0].id;
}
/**
 * One side links a moment to another and anchors a new duration to it, while the other side
 * deletes it: the merged timeline drops the link and pins the duration at the moment's time.
 */
function anchorTo(document, round, moment) {
  const ids = document.events.map((e) => e.id);
  const m = moment ?? ids[Math.floor(random() * ids.length)];
  const other = ids.find((id) => id !== m);
  return {
    moment: m,
    parts: {
      durationChanges: [
        {
          id: 'anchored' + round,
          duration: {
            id: 'anchored' + round,
            start: { moment: m },
            end: '100000/1',
            metadata: { title: 'Anchored' },
          },
        },
      ],
      relationshipChanges: [{ a: { moment: m }, b: { moment: other }, related: true }],
    },
  };
}
const titled = (e, title) => ({ ...e, metadata: { ...e.metadata, title } });
/** Both sides' edits of one moment both had at the fork: merging, identical or conflicting. */
const CRAFTED = [
  // Different fields: they merge.
  (e) => [titled(e, 'Ours'), { ...e, time: '7001/3' }],
  // The same change on both sides.
  (e) => [titled(e, 'Both'), titled(e, 'Both')],
  // Changed on one side, deleted on the other: a conflict.
  (e) => [titled(e, 'Kept'), null],
  // The same field changed differently: a conflict.
  (e) => [titled(e, 'One'), titled(e, 'Other')],
];
const snapshot = async (id) => (await store.snapshot(id, owners.get(id) ?? user)).document;
// Merges made entity by entity rebuild no index and keep a rebase as rows of its changes.
const calls = { replace: 0, documents: 0 };
for (const [method, counter] of [
  ['replace', 'replace'],
  ['recordDetached', 'documents'],
])
  store[method] = ((original) =>
    async function (...args) {
      calls[counter]++;
      return original.apply(this, args);
    })(store[method]);
try {
  await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
  await pool.query(
    'INSERT INTO oc_users(id,username,email_verified_at,terms_version) VALUES($1,$2,now(),oc_policy_version())',
    [user, 'merge_' + user.slice(0, 8)],
  );
  let upstream = await store.create(user, randomDocument('Merges'));
  created.push(upstream.id);
  // Public, so anyone may fork it and propose to it.
  await pool.query("UPDATE oc_timelines SET visibility='public' WHERE id=$1", [upstream.id]);
  upstream = await store.access(upstream.id, user);
  let upstreamDocument = await snapshot(upstream.id);
  const tally = { sync: 0, merge: 0, rebase: 0, conflicts: 0 };
  const ROUNDS = 45;
  for (let round = 0; round < ROUNDS; round++) {
    // Another account's fork, then independent edits on both sides.
    const other = randomUUID();
    users.push(other);
    await pool.query(
      'INSERT INTO oc_users(id,username,email_verified_at,terms_version) VALUES($1,$2,now(),oc_policy_version())',
      [other, 'merge_' + other.slice(0, 8)],
    );
    const fork = await versions.copy(upstream.id, other, { revision: upstream.revision });
    created.push(fork.id);
    owners.set(fork.id, other);
    const base = upstreamDocument;
    let side = await edit(fork, base, 1 + Math.floor(random() * 4));
    ({ timeline: upstream, document: upstreamDocument } = await edit(
      upstream,
      upstreamDocument,
      1 + Math.floor(random() * 4),
    ));
    const operation = ['sync', 'merge', 'rebase'][round % 3];
    // Every other sync and merge, both sides also edit one moment they both still have.
    if (operation !== 'rebase' && round % 2 === 0) {
      const shared = side.document.events.filter((e) =>
        upstreamDocument.events.some(
          (u) => u.id === e.id && JSON.stringify(u) === JSON.stringify(e),
        ),
      );
      const moment = shared[Math.floor(random() * shared.length)];
      const [ours, theirs] = CRAFTED[Math.floor(round / 2) % CRAFTED.length](moment);
      side = await touch(side.timeline, side.document, moment.id, ours);
      ({ timeline: upstream, document: upstreamDocument } = await touch(
        upstream,
        upstreamDocument,
        moment.id,
        theirs,
      ));
    }
    // Every other sync and merge otherwise, one side links and anchors a new duration to a
    // moment the other side deletes, in turns.
    if (operation !== 'rebase' && round % 2 === 1) {
      const { moment, parts } = anchorTo(side.document, round);
      const both = (id) =>
        [side.document, upstreamDocument].every((d) => d.events.some((e) => e.id === id));
      if (both(moment) && both(parts.relationshipChanges[0].b.moment)) {
        const [linking, deleting] = round % 4 === 1 ? ['side', 'upstream'] : ['upstream', 'side'];
        const sides = { side, upstream: { timeline: upstream, document: upstreamDocument } };
        sides[linking] = await savePatch(sides[linking], parts);
        sides[deleting] = await savePatch(sides[deleting], {
          changes: [{ id: moment, event: null }],
        });
        ({ side } = sides);
        ({ timeline: upstream, document: upstreamDocument } = sides.upstream);
      }
    }
    calls.replace = calls.documents = 0;
    let want, got;
    if (operation === 'sync') {
      // The fork takes upstream's changes.
      want = expected(base, side.document, upstreamDocument);
      got = await outcome(
        () => versions.sync(side.timeline.id, other, { revision: side.timeline.revision }),
        () => snapshot(side.timeline.id),
      );
    } else if (operation === 'merge') {
      // Upstream takes the fork's pull request.
      const p = await pulls.create(upstream.id, other, {
        title: 'Round ' + round,
        body: '',
        sourceTimelineId: side.timeline.id,
        sourceRevisionId: side.timeline.head_revision_id,
      });
      want = expected(base, side.document, upstreamDocument);
      got = await outcome(
        () => pulls.resolve(upstream.id, p.id, user, { action: 'merge', revision: p.revision }),
        () => snapshot(upstream.id),
      );
      if (got !== 'conflict') {
        upstream = await store.access(upstream.id, user);
        upstreamDocument = await snapshot(upstream.id);
      }
    } else {
      // A pull request submitted against an earlier upstream, rebased onto the current one.
      // Every third rebase deletes a moment upstream anchors a duration and a link to; every
      // third links and anchors to a moment upstream then deletes; the rest are random.
      const variant = Math.floor(round / 3) % 3;
      let document, deleted;
      let anchored;
      if (variant === 1) {
        const m = anchoredMoment(upstreamDocument);
        document = validateDocument(
          applyPatch(upstreamDocument, {
            settings: upstreamDocument,
            changes: [{ id: m, event: null }],
          }),
        );
        anchored = m;
      } else if (variant === 2) {
        const { moment, parts } = anchorTo(upstreamDocument, round);
        document = validateDocument(
          applyPatch(upstreamDocument, { settings: upstreamDocument, changes: [], ...parts }),
        );
        deleted = moment;
      } else
        document = validateDocument(
          applyPatch(upstreamDocument, randomPatch(upstreamDocument, ++step)),
        );
      const earlier = await store.access(upstream.id, user);
      const p = await pulls.create(upstream.id, other, {
        title: 'Round ' + round,
        body: '',
        baseRevision: earlier.revision,
        document,
      });
      calls.documents = 0;
      const before = upstreamDocument;
      if (deleted)
        ({ timeline: upstream, document: upstreamDocument } = await savePatch(
          { timeline: upstream, document: upstreamDocument },
          { changes: [{ id: deleted, event: null }] },
        ));
      // Upstream links and anchors a new duration to the moment the proposal deletes: the
      // rebased proposal drops the link and pins the duration.
      if (anchored)
        ({ timeline: upstream, document: upstreamDocument } = await savePatch(
          { timeline: upstream, document: upstreamDocument },
          anchorTo(upstreamDocument, round, anchored).parts,
        ));
      ({ timeline: upstream, document: upstreamDocument } = await edit(
        upstream,
        upstreamDocument,
        1 + Math.floor(random() * 3),
      ));
      want = expected(before, document, upstreamDocument);
      got = await outcome(
        () => pulls.resolve(upstream.id, p.id, other, { action: 'rebase', revision: p.revision }),
        async () => (await pulls.document(upstream.id, p.id, other)).document,
      );
    }
    assert.deepEqual(got, want, `round ${round}: ${operation}`);
    assert.deepEqual(
      calls,
      { replace: 0, documents: 0 },
      `round ${round}: merged entity by entity`,
    );
    tally[operation]++;
    if (want === 'conflict') tally.conflicts++;
  }
  assert(
    tally.conflicts >= 6 && tally.conflicts < ROUNDS / 2,
    `some conflicts (${tally.conflicts})`,
  );
  console.log(
    `PASS merges entity by entity: ${tally.sync} syncs, ${tally.merge} pull request merges and ${tally.rebase} rebases match rebaseDocument (${tally.conflicts} conflicting both ways).`,
  );
} finally {
  await store.idle();
  for (const id of created.reverse()) {
    await pool.query('DELETE FROM oc_timelines WHERE id=$1', [id]);
    await store.transaction((c) => store.removeHistory(c, id)).catch(() => {});
  }
  await pool.query('DELETE FROM oc_storage_entries WHERE user_id=ANY($1)', [users]);
  await pool.query('DELETE FROM oc_users WHERE id=ANY($1)', [users]);
  await pool.end();
}
