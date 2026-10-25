// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The HTTP API's description (#178) against the server: every operation it describes reaches
// a route of the request handler, rather than "Unknown endpoint." or "Method not allowed.",
// and it is served at /api/openapi.json. (openapi.test.mjs checks the other way.)
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { Auth, passwordHash } from '../server/auth.mjs';
import { createApplication } from '../server/http.mjs';
import { openApiDocument } from '../server/openapi/index.mjs';
if (!process.env.DATABASE_URL) throw new Error('Use a dedicated PostgreSQL test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
const app = createApplication({
  pool,
  mailer: { async send() {} },
  securityKey: Buffer.alloc(32, 48),
  passwordCheck: async () => {},
});
await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${app.address().port}`,
  suffix = randomUUID().slice(0, 8),
  userId = randomUUID();
/** What the request handler answers for a route it does not have. */
const MISSES = [
  'Unknown endpoint.',
  'Not found.',
  'Method not allowed.',
  'Unknown administration endpoint.',
  'Unknown administration action.',
];
/** Routes the Next.js platform serves itself, outside the request handler. */
const PLATFORM = ['/api/live', '/api/oembed'];
/** Requests that would end the session the others run as: sent last. */
const LAST = [
  'POST /api/auth/logout',
  'POST /api/auth/revoke-others',
  'DELETE /api/timelines/{id}',
];
try {
  await pool.query(
    `INSERT INTO oc_users(id,username,email,email_verified_at,password_hash,is_admin,quota_bypass,terms_version)
    VALUES($1,$2,$3,now(),$4,true,true,oc_policy_version())`,
    [userId, 'openapi_' + suffix, `openapi_${suffix}@example.test`, await passwordHash('x')],
  );
  const issued = await new Auth(pool, origin).issue(
    (await pool.query('SELECT * FROM oc_users WHERE id=$1', [userId])).rows[0],
  );
  const signedIn = { Cookie: issued.cookie.split(';')[0], 'X-CSRF-Token': issued.csrf };
  const created = await fetch(origin + '/api/timelines', {
    method: 'POST',
    headers: { ...signedIn, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      format: 'openchronology',
      version: 1,
      title: 'Described',
      description: '',
      events: [{ id: 'a', time: '1/1', metadata: { title: 'A' } }],
    }),
  });
  assert.equal(created.status, 201);
  const timeline = await created.json();
  const shown = await (
    await fetch(origin + '/api/timelines', {
      method: 'POST',
      headers: { ...signedIn, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        format: 'openchronology',
        version: 1,
        title: 'Shown',
        description: '',
        events: [{ id: 'g', time: '2/1', metadata: { title: 'G' } }],
      }),
    })
  ).json();

  // Served for anyone, and the same as the description itself.
  const served = await fetch(origin + '/api/openapi.json');
  assert.equal(served.status, 200);
  assert.equal(served.headers.get('access-control-allow-origin'), '*');
  const document = await served.json();
  // The server names its own origin in `servers`.
  const { servers, ...described } = openApiDocument();
  assert.deepEqual(
    { ...document, servers: undefined, info: described.info },
    {
      ...described,
      servers: undefined,
    },
  );

  /** A value for a path parameter: this timeline's ID where it names one, or a valid shape. */
  const value = (path, parameter) => {
    const schema = parameter.schema?.$ref
      ? document.components.schemas[parameter.schema.$ref.split('/').pop()]
      : (parameter.schema ?? {});
    if (parameter.name === 'id' && path.startsWith('/api/timelines/')) return timeline.id;
    if (schema.example !== undefined) return String(schema.example);
    if (schema.enum) return String(schema.enum[0]);
    if (schema.format === 'uuid') return randomUUID();
    if (schema.type === 'integer' || /^\^?\[0-9|\^?\[1-9|\^?\\d/.test(schema.pattern ?? ''))
      return '1';
    return 'probe';
  };
  const operations = Object.entries(document.paths)
    .flatMap(([path, item]) =>
      ['get', 'post', 'put', 'patch', 'delete']
        .filter((m) => item[m])
        .map((method) => ({
          path,
          method,
          operation: item[method],
          parameters: [...(item.parameters ?? []), ...(item[method].parameters ?? [])],
        })),
    )
    .filter(({ path }) => !PLATFORM.includes(path))
    .sort(
      (a, b) =>
        LAST.includes(`${a.method.toUpperCase()} ${a.path}`) -
        LAST.includes(`${b.method.toUpperCase()} ${b.path}`),
    );
  const missing = [];
  for (const { path, method, operation, parameters } of operations) {
    const url = path.replace(/\{([^}]+)\}/g, (_, name) =>
      encodeURIComponent(
        value(
          path,
          parameters.find((p) => p.name === name),
        ),
      ),
    );
    const json = !!operation.requestBody?.content?.['application/json'];
    const response = await fetch(origin + url, {
      method: method.toUpperCase(),
      headers: { ...signedIn, ...(json ? { 'Content-Type': 'application/json' } : {}) },
      ...(operation.requestBody ? { body: json ? '{}' : '' } : {}),
      redirect: 'manual',
    });
    const text = await response.text();
    let error = null;
    try {
      error = JSON.parse(text).error ?? null;
    } catch {}
    if ([404, 405].includes(response.status) && MISSES.includes(error))
      missing.push(`${method.toUpperCase()} ${path} (${url}): ${response.status} ${error}`);
  }
  assert.deepEqual(missing, [], 'Described operations the server does not have');
  assert(operations.length > 80, `${operations.length} operations sent`);

  // Guests may copy a public timeline into their browser (#178 found it refused them).
  await pool.query("UPDATE oc_timelines SET visibility='public' WHERE id=$1", [shown.id]);
  const copied = await fetch(`${origin}/api/timelines/${shown.id}/browser-fork`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  const copy = await copied.json();
  assert.equal(copied.status, 200, JSON.stringify(copy));
  assert.deepEqual(
    copy.document.events.map((e) => e.id),
    ['g'],
  );
  console.log(
    `PASS OpenAPI: the description is served, and all ${operations.length} operations it describes reach the server's routes; guests copy public timelines.`,
  );
} finally {
  app.close();
  await pool.query('DELETE FROM oc_timelines WHERE owner_id=$1', [userId]);
  await pool.query('DELETE FROM oc_users WHERE id=$1', [userId]);
  await pool.end();
}
