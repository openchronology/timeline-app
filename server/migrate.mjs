import pg from 'pg';
import { readFile } from 'node:fs/promises';
if (!process.env.DATABASE_URL && !process.env.PGDATABASE)
  throw new Error('Set DATABASE_URL or PostgreSQL PG* connection variables before migrating.');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
  await client.query('COMMIT');
  console.log('OpenChronology schema installed.');
} finally {
  await client.end();
}
