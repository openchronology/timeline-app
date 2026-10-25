// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Images are linked, not copied, on the server (#109): saving a timeline, saving changes and
// proposing keep no image copies (assets), and the migration removes those earlier releases
// stored, from timelines and their saved history, leaving saved history immutable after.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { Auth, passwordHash } from '../server/auth.mjs';
import { createApplication } from '../server/http.mjs';
import { releaseImageCopies } from '../server/store.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
const app = createApplication({ pool });
await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${app.address().port}`,
  owner = randomUUID(),
  other = randomUUID();
let headers = {},
  otherHeaders = {};
async function request(path, method = 'GET', data, as = headers, expected = 200) {
  const response = await fetch(origin + '/api/' + path, {
    method,
    headers: { ...as, ...(data ? { 'Content-Type': 'application/json' } : {}) },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  const value = await response.json();
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(value)}`);
  return value;
}
const icon = 'https://images.example.test/a.png',
  copy =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
try {
  const auth = new Auth(pool, origin);
  for (const [id, name] of [
    [owner, 'linker'],
    [other, 'proposer'],
  ])
    await pool.query(
      'INSERT INTO oc_users(id,username,email,email_verified_at,password_hash,quota_bypass,terms_version) VALUES($1,$2,$3,now(),$4,true,oc_policy_version())',
      [
        id,
        `${name}_${id.slice(0, 8)}`,
        `${name}_${id.slice(0, 8)}@example.test`,
        await passwordHash('x'.repeat(20)),
      ],
    );
  const sign = async (id) => {
    const issued = await auth.issue(
      (await pool.query('SELECT * FROM oc_users WHERE id=$1', [id])).rows[0],
    );
    return { Cookie: issued.cookie.split(';')[0], 'X-CSRF-Token': issued.csrf };
  };
  headers = await sign(owner);
  otherHeaders = await sign(other);
  const document = {
    format: 'openchronology',
    version: 1,
    title: 'Linked images',
    description: '',
    assets: { [icon]: copy },
    events: [{ id: 'm', time: '1/1', metadata: { title: 'Pictured', iconUrl: icon } }],
  };
  // Creating, replacing and saving changes keep the link and no copy.
  const created = await request('timelines', 'POST', document, headers, 201);
  const stored = async () =>
    (await pool.query('SELECT assets,storage_bytes FROM oc_timelines WHERE id=$1', [created.id]))
      .rows[0];
  assert.equal((await stored()).assets, null);
  assert.equal((await request(`timelines/${created.id}`)).assets, null);
  const kept = (await request(`timelines/${created.id}/document`)).document;
  assert.equal(kept.assets, undefined);
  assert.equal(kept.events[0].metadata.iconUrl, icon, 'The link stays.');
  const replaced = await request(`timelines/${created.id}`, 'PUT', {
    revision: created.revision,
    document: { ...document, title: 'Replaced' },
  });
  assert.equal((await stored()).assets, null);
  await request(`timelines/${created.id}/changes`, 'PUT', {
    revision: replaced.revision,
    settings: {
      format: 'openchronology',
      version: 1,
      title: 'Changed',
      description: '',
      assets: { [icon]: copy },
    },
    changes: [],
  });
  assert.equal((await stored()).assets, null);
  // A pull request's documents keep no copies either.
  await request(`timelines/${created.id}/settings`, 'PATCH', { visibility: 'public' });
  const current = await request(`timelines/${created.id}`);
  const proposal = await request(
    `timelines/${created.id}/proposals`,
    'POST',
    {
      title: 'Proposed',
      body: '',
      baseRevision: current.revision,
      document: { ...document, title: 'Proposed' },
    },
    otherHeaders,
    201,
  );
  // Its revision, as saved history keeps it.
  const copies = (
    await pool.query(
      `SELECT (SELECT count(*) FROM oc_history_settings h JOIN oc_revisions r ON r.timeline_id=h.timeline_id
          WHERE r.id=(SELECT source_revision_id FROM oc_proposals WHERE id=$1) AND h.settings ? 'assets')
        + (SELECT count(*) FROM oc_revisions r JOIN oc_proposals p ON r.id IN (p.source_revision_id,p.base_revision_id)
          WHERE p.id=$1 AND r.patch->'settings' ? 'assets') AS n`,
      [proposal.id],
    )
  ).rows[0].n;
  assert.equal(copies, '0');

  // Copies earlier releases stored are removed: from the timeline and its saved history.
  const bytes = (await stored()).storage_bytes;
  await pool.query('UPDATE oc_timelines SET assets=$2 WHERE id=$1', [created.id, { [icon]: copy }]);
  await pool.query('UPDATE oc_timelines SET storage_bytes=storage_bytes+$2 WHERE id=$1', [
    created.id,
    JSON.stringify({ [icon]: copy }).length,
  ]);
  const old = randomUUID();
  await pool.query('INSERT INTO oc_snapshots(id,document) VALUES($1,$2)', [
    old,
    { ...document, events: [] },
  ]);
  await pool.query('UPDATE oc_proposals SET document=$2 WHERE id=$1', [proposal.id, document]);
  await pool.query(
    'INSERT INTO oc_history_settings(timeline_id,since,until,settings) VALUES($1,0,1,$2)',
    [
      created.id,
      {
        format: 'openchronology',
        version: 1,
        title: 'Old',
        description: '',
        assets: { [icon]: copy },
      },
    ],
  );
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    assert((await releaseImageCopies(client)) >= 3);
    assert.equal(await releaseImageCopies(client), 0, 'Once removed, nothing is left to remove.');
    await client.query('COMMIT');
  } finally {
    client.release();
  }
  assert.equal((await stored()).assets, null);
  assert(
    Math.abs(Number((await stored()).storage_bytes) - Number(bytes)) <= 2,
    'Its storage shrinks back.',
  );
  assert.equal(
    (await pool.query('SELECT document FROM oc_snapshots WHERE id=$1', [old])).rows[0].document
      .assets,
    undefined,
  );
  assert.equal(
    (await pool.query('SELECT document FROM oc_proposals WHERE id=$1', [proposal.id])).rows[0]
      .document.assets,
    undefined,
  );
  assert.equal(
    (
      await pool.query(
        "SELECT count(*) FROM oc_history_settings WHERE timeline_id=$1 AND settings ? 'assets'",
        [created.id],
      )
    ).rows[0].count,
    '0',
  );
  // Saved history is immutable again.
  await assert.rejects(
    pool.query('UPDATE oc_snapshots SET document=document||\'{"title":"x"}\' WHERE id=$1', [old]),
    /immutable/,
  );
  await pool.query('DELETE FROM oc_snapshots WHERE id=$1', [old]);
  console.log(
    'PASS image links: saves, changes and pull requests keep no copies; earlier copies removed.',
  );
} finally {
  await pool.query(
    'DELETE FROM oc_history_settings WHERE timeline_id IN (SELECT id FROM oc_timelines WHERE owner_id=$1)',
    [owner],
  );
  await pool.query('DELETE FROM oc_timelines WHERE owner_id=ANY($1::uuid[])', [[owner, other]]);
  await pool.query('DELETE FROM oc_users WHERE id=ANY($1::uuid[])', [[owner, other]]);
  app.close();
  await pool.end();
}
