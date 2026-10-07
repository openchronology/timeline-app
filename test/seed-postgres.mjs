// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { LEGACY_SEED_IDS } from '../server/seed-expansion.mjs';
import { seedPlatform } from '../server/seed.mjs';
import { SEED_USER_ID, SEED_TIMELINES, LEGACY_SEED_TIMELINES } from '../server/seed-data.mjs';
import { PostgresStore } from '../server/store.mjs';
import { searchTimelines } from '../server/collaboration.mjs';
import { createPluginLibrary } from '../server/plugins.mjs';
import { PLUGIN_EXAMPLE } from '../dist/core.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query('BEGIN');
// Seed's transactions are savepoints inside a test transaction, rolled back at the end.
const adapter = {
  query: (...args) => client.query(...args),
  async connect() {
    return {
      query(sql, args) {
        return client.query(
          sql === 'BEGIN'
            ? 'SAVEPOINT seed_test'
            : sql === 'COMMIT'
              ? 'RELEASE SAVEPOINT seed_test'
              : sql === 'ROLLBACK'
                ? 'ROLLBACK TO SAVEPOINT seed_test'
                : sql,
          args,
        );
      },
      release() {},
    };
  },
};
try {
  await client.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
  assert.equal(
    (
      await client.query('SELECT id FROM oc_users WHERE username=$1 OR id=$2', [
        'seed',
        SEED_USER_ID,
      ])
    ).rowCount,
    0,
  );
  const managerId = randomUUID(),
    manager = `seed_manager_${managerId.slice(0, 8)}`;
  await client.query(
    'INSERT INTO oc_users(id,username,email,email_verified_at) VALUES($1,$2,$3,now())',
    [managerId, manager, `${manager}@example.test`],
  );
  assert.ok((await seedPlatform(adapter, { manager })).every((t) => t.created));
  const user = (await client.query('SELECT * FROM oc_users WHERE id=$1', [SEED_USER_ID])).rows[0];
  assert.equal(user.password_hash, null);
  assert.equal(user.email_verified_at, null);
  const store = new PostgresStore(adapter);
  for (const { id, document } of SEED_TIMELINES) {
    const timeline = await store.access(id, null);
    assert.equal(timeline.owner, 'seed');
    assert.equal(timeline.visibility, 'public');
    assert.equal(timeline.featured, true);
    assert.equal(Number(timeline.event_count), document.events.length);
    assert.deepEqual(await store.revisionDocument(adapter, timeline.head_revision_id), document);
    assert.equal((await store.access(id, managerId)).canWrite, !document.comparison);
    if (document.comparison) {
      assert.deepEqual(timeline.comparison, document.comparison);
      assert.equal((await store.access(id, managerId)).canFork, false);
      assert.equal(
        (await client.query('SELECT id FROM oc_nodes WHERE timeline_id=$1', [id])).rowCount,
        0,
      );
      await assert.rejects(
        store.save(id, managerId, timeline.revision, { ...document, events: [] }),
        /Write access/,
      );
      continue;
    }
    const groups = await client.query('SELECT * FROM oc_overview_v2($1,$2::mpq,$3::mpq,$4::mpq)', [
      id,
      document.events[0].time,
      document.events.at(-1).time,
      '0/1',
    ]);
    assert.equal(
      groups.rows.reduce((n, group) => n + Number(group.event_count), 0),
      document.events.length,
    );
    const bounded = await client.query('SELECT * FROM oc_overview_v2($1,$2::mpq,$2::mpq,$3::mpq)', [
      id,
      document.events[1].time,
      '0/1',
    ]);
    assert.equal(bounded.rows.length, 1);
    assert.equal(bounded.rows[0].event_id, document.events[1].id);
  }
  // Upgrade an existing edited WWII document; history and deleted moments survive the split.
  const warId = SEED_TIMELINES[2].id;
  const oldWar = structuredClone(LEGACY_SEED_TIMELINES[2].document);
  oldWar.events = oldWar.events.filter((e) => e.id !== 'd-day');
  oldWar.events.find((e) => e.id === 'pearl-harbor').metadata.description =
    'Curator notes on Pearl Harbor';
  oldWar.events.push({ id: 'curator', time: '1/7', metadata: { title: 'Curator context' } });
  await store.replace(adapter, warId, oldWar);
  await client.query('UPDATE oc_timelines SET revision=revision+1 WHERE id=$1', [warId]);
  const priorWar = await store.access(warId, managerId);
  await store.checkpoint(adapter, warId, managerId, oldWar, 'save', [priorWar.head_revision_id]);
  const oldWarHead = (await store.access(warId, managerId)).head_revision_id;
  for (const campaign of SEED_TIMELINES.slice(4)) {
    await client.query('UPDATE oc_timelines SET head_revision_id=NULL WHERE id=$1', [campaign.id]);
    await store.removeHistory(adapter, campaign.id);
    await client.query('DELETE FROM oc_timelines WHERE id=$1', [campaign.id]);
  }
  await client.query(
    "DELETE FROM oc_seed_updates WHERE timeline_id=$1 AND update_key='wwii-campaign-comparison-v1'",
    [warId],
  );
  await client.query("UPDATE oc_timelines SET visibility='private' WHERE id=$1", [warId]);
  assert((await seedPlatform(adapter)).find((t) => t.id === warId).updated);
  const upgradedWar = await store.access(warId, managerId);
  assert.deepEqual(await store.revisionDocument(adapter, oldWarHead), oldWar);
  assert.equal(
    (
      await client.query('SELECT parent_id FROM oc_revision_parents WHERE revision_id=$1', [
        upgradedWar.head_revision_id,
      ])
    ).rows[0].parent_id,
    oldWarHead,
  );
  const campaignDocs = await Promise.all(
    SEED_TIMELINES.slice(4).map(async ({ id }) => {
      const t = await store.access(id, managerId);
      assert.equal(t.visibility, 'private');
      assert.equal(t.canWrite, true);
      await assert.rejects(store.access(id, null), /unavailable/);
      return store.revisionDocument(adapter, t.head_revision_id);
    }),
  );
  assert(!campaignDocs.flatMap((d) => d.events).some((e) => e.id === 'd-day'));
  assert(campaignDocs[0].events.some((e) => e.id === 'curator'));
  assert.equal(
    campaignDocs[1].events.find((e) => e.id === 'pearl-harbor').metadata.description,
    'Curator notes on Pearl Harbor',
  );
  assert((await seedPlatform(adapter)).every((t) => !t.updated));
  await client.query("UPDATE oc_timelines SET visibility='public' WHERE id=ANY($1::uuid[])", [
    [warId, ...SEED_TIMELINES.slice(4).map((t) => t.id)],
  ]);
  const browser = await searchTimelines(adapter, null, { search: 'World War II' });
  assert.equal(browser.timelines.length, 3);
  assert(browser.timelines.find((t) => t.id === warId).comparison);
  // Source permissions apply independently; a private source cannot leak through a comparison.
  const campaignId = SEED_TIMELINES[4].id;
  await client.query("UPDATE oc_timelines SET visibility='private' WHERE id=$1", [campaignId]);
  await assert.rejects(store.access(warId, null), /source is unavailable/);
  await client.query("UPDATE oc_timelines SET visibility='public' WHERE id=$1", [campaignId]);
  await assert.rejects(
    store.create(managerId, {
      ...SEED_TIMELINES[2].document,
      comparison: { sources: [warId, campaignId], combined: false },
    }),
    /ordinary timelines/,
  );
  // Simulate an earlier seed deployment with no enrichment ledger or plugins.
  const legacyId = SEED_TIMELINES[1].id;
  const legacy = structuredClone(SEED_TIMELINES[1].document);
  legacy.title = 'My Constantinople siege notes';
  legacy.plugins = [];
  legacy.events[0].metadata.title = 'Edited siege beginning';
  for (const event of legacy.events) {
    delete event.metadata.color;
    delete event.metadata.shape;
    delete event.metadata.shapeSize;
  }
  const initial = await store.access(legacyId, managerId);
  await store.save(legacyId, managerId, initial.revision, legacy);
  const oldHead = (await store.access(legacyId, managerId)).head_revision_id;
  await client.query('DELETE FROM oc_seed_updates WHERE timeline_id=$1', [legacyId]);
  const enriched = await seedPlatform(adapter);
  assert.equal(enriched.find((t) => t.id === legacyId).updated, true);
  const enrichedTimeline = await store.access(legacyId, managerId);
  const saved = await store.revisionDocument(adapter, enrichedTimeline.head_revision_id);
  assert.equal(saved.title, legacy.title);
  assert.equal(saved.events[0].metadata.title, legacy.events[0].metadata.title);
  assert.equal(saved.plugins.length, SEED_TIMELINES[1].document.plugins.length);
  assert(saved.events.every((e) => e.metadata.color && e.metadata.shape));
  assert.equal(
    (
      await client.query('SELECT parent_id FROM oc_revision_parents WHERE revision_id=$1', [
        enrichedTimeline.head_revision_id,
      ])
    ).rows[0].parent_id,
    oldHead,
  );
  // A curator can remove a plugin after the one-time enrichment.
  saved.plugins.pop();
  await store.save(legacyId, managerId, enrichedTimeline.revision, saved);
  const customizedHead = (await store.access(legacyId, managerId)).head_revision_id;
  assert((await seedPlatform(adapter)).every((t) => !t.updated));
  assert.equal((await store.access(legacyId, managerId)).head_revision_id, customizedHead);
  // Upgrade a deployed small catalogue, retain custom content and a deleted legacy moment.
  const expansionId = SEED_TIMELINES[0].id;
  const compact = structuredClone(SEED_TIMELINES[0].document);
  compact.events = compact.events.filter(
    (e) => LEGACY_SEED_IDS[0].includes(e.id) && e.id !== 'k-pg',
  );
  compact.events[0].metadata.description = 'Curator notes';
  compact.plugins = compact.plugins.filter((p) => p.manifest.id !== 'moment-icons');
  const compactTimeline = await store.access(expansionId, managerId);
  await store.save(expansionId, managerId, compactTimeline.revision, compact);
  const compactHead = (await store.access(expansionId, managerId)).head_revision_id;
  await client.query(
    "DELETE FROM oc_seed_updates WHERE timeline_id=$1 AND update_key='expanded-content-and-icons-v1'",
    [expansionId],
  );
  assert((await seedPlatform(adapter)).find((t) => t.id === expansionId).updated);
  const upgraded = await store.access(expansionId, managerId);
  const expandedDocument = await store.revisionDocument(adapter, upgraded.head_revision_id);
  assert(!expandedDocument.events.some((e) => e.id === 'k-pg'));
  assert(expandedDocument.events.some((e) => e.id === 'archaeopteryx' && e.metadata.iconUrl));
  assert.equal(
    expandedDocument.events.find((e) => e.id === compact.events[0].id).metadata.description,
    'Curator notes',
  );
  assert.equal(Number(upgraded.event_count), SEED_TIMELINES[0].document.events.length - 1);
  assert.equal(
    (
      await client.query('SELECT parent_id FROM oc_revision_parents WHERE revision_id=$1', [
        upgraded.head_revision_id,
      ])
    ).rows[0].parent_id,
    compactHead,
  );
  const removed = expandedDocument.events.find((e) => e.id === 'archaeopteryx');
  expandedDocument.events = expandedDocument.events.filter((e) => e.id !== removed.id);
  expandedDocument.plugins = expandedDocument.plugins.filter(
    (p) => p.manifest.id !== 'moment-icons',
  );
  await store.save(expansionId, managerId, upgraded.revision, expandedDocument);
  const removedHead = (await store.access(expansionId, managerId)).head_revision_id;
  assert((await seedPlatform(adapter)).every((t) => !t.updated));
  assert.equal((await store.access(expansionId, managerId)).head_revision_id, removedHead);
  const search = await searchTimelines(adapter, null, { search: 'Constantinople' });
  assert.ok(search.timelines.some((t) => t.id === SEED_TIMELINES[1].id));
  const id = SEED_TIMELINES[0].id;
  const before = await store.access(id, managerId);
  const changed = { ...SEED_TIMELINES[0].document, title: 'A curated dinosaur timeline' };
  await store.save(id, managerId, before.revision, changed);
  const head = (await store.access(id, managerId)).head_revision_id;
  assert.ok((await seedPlatform(adapter)).every((t) => !t.created));
  assert.equal((await store.access(id, managerId)).title, changed.title);
  assert.equal((await store.access(id, managerId)).head_revision_id, head);
  await assert.rejects(seedPlatform(adapter, { manager: 'does-not-exist' }), /email-verified/);
  const library = createPluginLibrary(undefined, adapter);
  const enabled = new Map();
  for (const row of (
    await client.query("SELECT plugins FROM oc_timelines WHERE visibility='public'")
  ).rows)
    for (const id of new Set(
      (row.plugins ?? []).filter((p) => p.enabled !== false).map((p) => p.manifest.id),
    ))
      enabled.set(id, (enabled.get(id) ?? 0) + 1);
  const popular = (await library.search({ sort: 'popularity', limit: 50 })).plugins;
  for (let i = 1; i < popular.length; i++)
    assert((enabled.get(popular[i - 1].id) ?? 0) >= (enabled.get(popular[i].id) ?? 0));
  const alphabetical = (await library.search({ sort: 'alphabetical', limit: 50 })).plugins;
  assert.deepEqual(
    alphabetical.map((p) => p.name),
    [...alphabetical.map((p) => p.name)].sort(),
  );
  for (const [id, version, date] of [
    ['library-age-old', 1, '2000-01-01'],
    ['library-age-old', 2, '2020-01-01'],
    ['library-age-new', 1, '2010-01-01'],
  ]) {
    const manifest = { ...PLUGIN_EXAMPLE, id, version, name: id };
    await client.query(
      'INSERT INTO oc_plugins(id,version,owner_id,manifest,published_at) VALUES($1,$2,$3,$4,$5)',
      [id, version, managerId, manifest, date],
    );
  }
  const newest = await library.search({ search: 'library-age', sort: 'age', limit: 1 });
  assert.equal(newest.total, 2);
  assert.equal(newest.plugins[0].id, 'library-age-new');
  const older = await library.search({ search: 'library-age', sort: 'age', limit: 1, page: 2 });
  assert.equal(older.plugins[0].id, 'library-age-old');
  assert.equal(older.plugins[0].version, 2);
  console.log(
    'Seed PostgreSQL integration passed: public indexing, history, search, manager access, and idempotence.',
  );
} finally {
  await client.query('ROLLBACK');
  await client.end();
}
