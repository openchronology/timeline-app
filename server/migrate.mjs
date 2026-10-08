// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import pg from 'pg';
import { bootstrapInstallation } from './administration.mjs';
import { readFile } from 'node:fs/promises';
import { convertLegacyDurations, backfillEntitySearch } from './store.mjs';
if (!process.env.DATABASE_URL && !process.env.PGDATABASE)
  throw new Error('Set DATABASE_URL or PostgreSQL PG* connection variables before migrating.');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
  await bootstrapInstallation(client);
  const converted = await convertLegacyDurations(client);
  if (converted) console.log(`Converted linked durations in ${converted} timeline(s).`);
  const indexed = await backfillEntitySearch(client);
  if (indexed) console.log(`Built text search for ${indexed} timeline(s).`);
  await client.query('COMMIT');
  console.log('OpenChronology schema installed.');
} finally {
  await client.end();
}
