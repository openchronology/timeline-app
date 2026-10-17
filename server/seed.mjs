// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Installs or updates the public example timelines (npm run seed; docs/seeding.md), owned by a
// reserved "seed" account that cannot sign in, with SEED_MANAGER's account as a writer.
import pg from 'pg';
import { EXPAND_ON_HOVER } from '../dist/core.mjs';
import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';
import { PostgresStore } from './store.mjs';
import { refreshAccounts } from './standing.mjs';
import {
  SEED_USER_ID,
  LEGACY_SEED_TIMELINES,
  WORLD_WAR_II_ID,
  EUROPEAN_CAMPAIGN_ID,
  PACIFIC_CAMPAIGN_ID,
  splitWorldWarDocument,
  worldWarComparison,
  enrichSeedDocument,
  expandSeedDocument,
} from './seed-data.mjs';

/**
 * Installs the example timelines, or brings existing ones up to date, in one transaction: any
 * refusal leaves nothing changed. Safe to run again: timelines are created only when missing,
 * and each later change to their content is applied once per timeline, recorded in
 * oc_seed_updates, so an operator's deliberate edits (a plugin removed, say) are not undone.
 *
 * Steps: the seed account (trusted, so browsing lists its timelines); the legacy examples,
 * with the official-plugins and expanded-content updates; the World War II campaigns split
 * out of the old combined timeline, which then becomes a comparison of them; the
 * expand-on-hover plugin on all. `manager`, when given, is made a writer of each.
 * @param {import('pg').Pool} pool
 * @param {{manager?: string}} options `manager`: the username of an email-verified account
 * @returns {Promise<{id: string, title: string, created: boolean, updated: boolean}[]>}
 * @throws {Error} when the seed username, its reserved id or a reserved timeline id belongs
 *   to someone else, when the manager is not a verified account, or when a campaign moment
 *   was edited differently in both places
 */
export async function seedPlatform(pool, { manager = '' } = {}) {
  const store = new PostgresStore(pool);
  return store.transaction(async (client) => {
    // One seeding at a time (a transaction-scoped advisory lock), so two runs cannot both
    // create the account or the timelines.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('openchronology:seed:v1'))");
    // Either the reserved id or the username "seed" held by any other account refuses.
    const existing = await client.query(
      'SELECT id,username FROM oc_users WHERE id=$1 OR username=$2',
      [SEED_USER_ID, 'seed'],
    );
    if (existing.rows.some((user) => user.id !== SEED_USER_ID || user.username !== 'seed'))
      throw new Error(
        'The seed username or reserved ID already belongs to another account. No data was changed.',
      );
    // No password, email or OAuth identity: this account cannot authenticate. ON CONFLICT
    // DO NOTHING keeps an existing seed account as it is.
    await client.query(
      'INSERT INTO oc_users(id,username,password_hash,quota_bypass) VALUES($1,$2,NULL,true) ON CONFLICT(id) DO NOTHING',
      [SEED_USER_ID, 'seed'],
    );
    // The operator's curated timelines are listed like an established account's (#103).
    await client.query(
      "UPDATE oc_users SET quota_bypass=true,trust=coalesce(trust,'trusted') WHERE id=$1",
      [SEED_USER_ID],
    );
    await refreshAccounts(client, [SEED_USER_ID]);
    let managerId;
    if (manager) {
      const result = await client.query(
        'SELECT id FROM oc_users WHERE username=$1 AND email_verified_at IS NOT NULL',
        [manager],
      );
      if (!result.rows[0])
        throw new Error('SEED_MANAGER must name an existing email-verified account.');
      managerId = result.rows[0].id;
    }
    const result = [];
    for (const [index, { id, document }] of LEGACY_SEED_TIMELINES.entries()) {
      // The timeline if it exists, locked against saves while it is updated here.
      const previous = await client.query(
        'SELECT owner_id,head_revision_id FROM oc_timelines WHERE id=$1 FOR UPDATE',
        [id],
      );
      if (previous.rows[0] && previous.rows[0].owner_id !== SEED_USER_ID)
        throw new Error(
          `Reserved seed timeline ${id} belongs to another owner. No data was changed.`,
        );
      if (!previous.rows.length) {
        await client.query(
          "INSERT INTO oc_timelines(id,owner_id,title,visibility,featured) VALUES($1,$2,$3,'public',true)",
          [id, SEED_USER_ID, document.title],
        );
        await store.replace(client, id, document);
        await store.checkpoint(client, id, SEED_USER_ID, document, 'save');
      }
      let updated = false;
      // A one-time update: the insert returns a row only the first time this key is recorded
      // for this timeline (ON CONFLICT DO NOTHING ... RETURNING), and only then is it applied.
      // A timeline created just now already has the content, so the marker alone is recorded.
      const enrichment = await client.query(
        "INSERT INTO oc_seed_updates(timeline_id,update_key) VALUES($1,'official-plugins-v1') ON CONFLICT DO NOTHING RETURNING timeline_id",
        [id],
      );
      if (
        previous.rows.length &&
        enrichment.rows.length &&
        !(await store.access(id, SEED_USER_ID, client)).comparison
      ) {
        const timeline = await store.access(id, SEED_USER_ID, client);
        const current = await store.revisionDocument(client, timeline.head_revision_id);
        const enriched = enrichSeedDocument(current, document);
        // Saved as a new revision on the head: content replaced, revision counter bumped
        // (as a save does, so open editors see a newer timeline) and a checkpoint recorded.
        if (!isDeepStrictEqual(enriched, current)) {
          await store.replace(client, id, enriched);
          await client.query('UPDATE oc_timelines SET revision=revision+1 WHERE id=$1', [id]);
          await store.checkpoint(client, id, SEED_USER_ID, enriched, 'save', [
            timeline.head_revision_id,
          ]);
          updated = true;
        }
      }
      const expansion = await client.query(
        "INSERT INTO oc_seed_updates(timeline_id,update_key) VALUES($1,'expanded-content-and-icons-v1') ON CONFLICT DO NOTHING RETURNING timeline_id",
        [id],
      );
      if (
        previous.rows.length &&
        expansion.rows.length &&
        !(await store.access(id, SEED_USER_ID, client)).comparison
      ) {
        const timeline = await store.access(id, SEED_USER_ID, client);
        const current = await store.revisionDocument(client, timeline.head_revision_id);
        const expanded = expandSeedDocument(current, document, index);
        if (!isDeepStrictEqual(expanded, current)) {
          await store.replace(client, id, expanded);
          await client.query('UPDATE oc_timelines SET revision=revision+1 WHERE id=$1', [id]);
          await store.checkpoint(client, id, SEED_USER_ID, expanded, 'save', [
            timeline.head_revision_id,
          ]);
          updated = true;
        }
      }
      // The manager becomes a writer, or is raised to one if already a member.
      if (managerId)
        await client.query(
          "INSERT INTO oc_members(timeline_id,user_id,role) VALUES($1,$2,'writer') ON CONFLICT(timeline_id,user_id) DO UPDATE SET role='writer'",
          [id, managerId],
        );
      result.push({ id, title: document.title, created: !previous.rows.length, updated });
    }
    // World War II was once one timeline; it is now a comparison of two campaign timelines.
    // The campaigns are split from its current content (or, once it is a comparison, from
    // the bundled document), and the conversion is a one-time update.
    const war = await store.access(WORLD_WAR_II_ID, SEED_USER_ID, client);
    const current = await store.revisionDocument(client, war.head_revision_id);
    const migration = await client.query(
      "INSERT INTO oc_seed_updates(timeline_id,update_key) VALUES($1,'wwii-campaign-comparison-v1') ON CONFLICT DO NOTHING RETURNING timeline_id",
      [WORLD_WAR_II_ID],
    );
    const documents = splitWorldWarDocument(
      war.comparison ? LEGACY_SEED_TIMELINES[2].document : current,
    );
    for (const [index, id] of [EUROPEAN_CAMPAIGN_ID, PACIFIC_CAMPAIGN_ID].entries()) {
      const previous = (
        await client.query(
          'SELECT owner_id,head_revision_id FROM oc_timelines WHERE id=$1 FOR UPDATE',
          [id],
        )
      ).rows[0];
      if (previous && previous.owner_id !== SEED_USER_ID)
        throw new Error(
          `Reserved seed timeline ${id} belongs to another owner. No data was changed.`,
        );
      let document = documents[index],
        updated = false;
      // A new campaign takes World War II's sharing settings and members, so converting it
      // to a comparison shows the same people the same content.
      if (!previous) {
        await client.query(
          'INSERT INTO oc_timelines(id,owner_id,title,visibility,featured,allow_private_forks,publication_restricted) VALUES($1,$2,$3,$4,$5,$6,$7)',
          [
            id,
            SEED_USER_ID,
            document.title,
            war.visibility,
            war.featured,
            war.allow_private_forks,
            war.publication_restricted,
          ],
        );
        await client.query(
          'INSERT INTO oc_members(timeline_id,user_id,role) SELECT $1,user_id,role FROM oc_members WHERE timeline_id=$2 ON CONFLICT DO NOTHING',
          [id, WORLD_WAR_II_ID],
        );
        await store.replace(client, id, document);
        await store.checkpoint(client, id, SEED_USER_ID, document, 'save');
      } else if (migration.rows.length && !war.comparison) {
        // A campaign timeline that already exists: merge World War II's moments into it by
        // id, refusing a moment edited differently in the two.
        const saved = await store.revisionDocument(client, previous.head_revision_id);
        const byId = new Map(saved.events.map((event) => [event.id, event]));
        for (const event of document.events) {
          if (byId.has(event.id) && !isDeepStrictEqual(byId.get(event.id), event))
            throw new Error(
              `Campaign event ${event.id} has conflicting edits. Reconcile it before converting World War II. No data was changed.`,
            );
          byId.set(event.id, event);
        }
        document = { ...saved, events: [...byId.values()] };
        if (!isDeepStrictEqual(document, saved)) {
          await store.replace(client, id, document);
          await client.query('UPDATE oc_timelines SET revision=revision+1 WHERE id=$1', [id]);
          await store.checkpoint(client, id, SEED_USER_ID, document, 'save', [
            previous.head_revision_id,
          ]);
          updated = true;
        }
      }
      if (managerId)
        await client.query(
          "INSERT INTO oc_members(timeline_id,user_id,role) VALUES($1,$2,'writer') ON CONFLICT(timeline_id,user_id) DO UPDATE SET role='writer'",
          [id, managerId],
        );
      result.push({ id, title: document.title, created: !previous, updated });
    }
    // Last, World War II itself becomes the comparison of the two campaigns.
    if (migration.rows.length && !war.comparison) {
      const comparison = worldWarComparison(current);
      await store.replace(client, WORLD_WAR_II_ID, comparison);
      await client.query('UPDATE oc_timelines SET revision=revision+1 WHERE id=$1', [
        WORLD_WAR_II_ID,
      ]);
      await store.checkpoint(client, WORLD_WAR_II_ID, SEED_USER_ID, comparison, 'save', [
        war.head_revision_id,
      ]);
      result.find((entry) => entry.id === WORLD_WAR_II_ID).updated = true;
    }
    // The expand-on-hover plugin, added once to every example that lacks it.
    for (const entry of result) {
      const update = await client.query(
        "INSERT INTO oc_seed_updates(timeline_id,update_key) VALUES($1,'expand-on-hover-v1') ON CONFLICT DO NOTHING RETURNING timeline_id",
        [entry.id],
      );
      if (!update.rows.length) continue;
      const timeline = await store.access(entry.id, SEED_USER_ID, client);
      const current = await store.revisionDocument(client, timeline.head_revision_id);
      if (current.plugins?.some((plugin) => plugin.manifest.id === EXPAND_ON_HOVER.id)) continue;
      const document = {
        ...current,
        plugins: [...(current.plugins ?? []), { manifest: EXPAND_ON_HOVER, enabled: true }],
      };
      await store.replace(client, entry.id, document);
      await client.query('UPDATE oc_timelines SET revision=revision+1 WHERE id=$1', [entry.id]);
      await store.checkpoint(client, entry.id, SEED_USER_ID, document, 'save', [
        timeline.head_revision_id,
      ]);
      entry.updated = true;
    }
    return result;
  });
}
// Run as a script (npm run seed): seeds the database the environment names and reports
// each timeline as created, updated or preserved.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.DATABASE_URL && !process.env.PGDATABASE)
    throw new Error('Set DATABASE_URL or PostgreSQL connection environment variables.');
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    for (const result of await seedPlatform(pool, { manager: process.env.SEED_MANAGER }))
      console.log(
        `${result.created ? 'Created' : result.updated ? 'Updated' : 'Preserved'} ${result.title}: /timelines/${result.id}`,
      );
  } finally {
    await pool.end();
  }
}
