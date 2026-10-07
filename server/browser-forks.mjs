// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { browserEntryCount } from '../dist/browser-copy.mjs';
import { HttpError } from './store.mjs';
export const BROWSER_FORK_LIMITS = Object.freeze({ events: 5000, bytes: 4 * 1024 * 1024 });
const tooLarge = () =>
  new HttpError(
    413,
    'This timeline exceeds the browser fork limit (5,000 entries, including stack entries, or 4 MiB). Nothing was copied or truncated. View the original read-only, or sign in for a database-backed fork.',
  );
export class BrowserForks {
  active = 0;
  constructor(store, auth) {
    this.store = store;
    this.auth = auth;
  }
  async copy(id, revision, address) {
    if (this.active >= 4)
      throw new HttpError(429, 'Browser copying is busy. Please try again shortly.');
    this.active++;
    try {
      await this.auth.rateLimit('browser-fork:' + address);
      return await this.store.transaction(async (client) => {
        await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
        await client.query("SET LOCAL statement_timeout='1500ms'");
        // Read only counters, ACL and precomputed size; never decompress a large
        // document to decide whether it is safe to copy.
        const { rows } = await client.query(
          `SELECT t.id,t.comparison,t.revision,t.head_revision_id,t.event_count,r.snapshot_id,s.document_bytes
           FROM oc_timelines t JOIN oc_revisions r ON r.id=t.head_revision_id
           JOIN oc_snapshots s ON s.id=r.snapshot_id
           WHERE t.id=$1 AND t.visibility='public'`,
          [id],
        );
        const timeline = rows[0];
        if (!timeline) throw new HttpError(404, 'Public timeline unavailable.');
        if (timeline.comparison)
          throw new HttpError(
            409,
            'Fork an individual source timeline; this comparison is a read-only live view.',
          );
        if (revision !== undefined && timeline.revision !== revision)
          throw new HttpError(
            409,
            'This timeline changed. Refresh it before making a browser fork.',
          );
        if (
          BigInt(timeline.event_count) > BigInt(BROWSER_FORK_LIMITS.events) ||
          timeline.document_bytes === null ||
          timeline.document_bytes === undefined ||
          BigInt(timeline.document_bytes) > BigInt(BROWSER_FORK_LIMITS.bytes - 8192)
        )
          throw tooLarge();
        const snapshot = await client.query('SELECT document FROM oc_snapshots WHERE id=$1', [
          timeline.snapshot_id,
        ]);
        const document = snapshot.rows[0]?.document;
        if (!document || browserEntryCount(document) > BROWSER_FORK_LIMITS.events) throw tooLarge();
        const result = {
          document,
          source: { id, revision: timeline.revision, savedRevision: timeline.head_revision_id },
          limits: BROWSER_FORK_LIMITS,
        };
        if (Buffer.byteLength(JSON.stringify(result)) > BROWSER_FORK_LIMITS.bytes) throw tooLarge();
        return result;
      });
    } finally {
      this.active--;
    }
  }
}
