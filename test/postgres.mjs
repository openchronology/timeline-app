import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { createApplication } from '../server/http.mjs';
import assert from 'node:assert/strict';
import { demo, validateDocument, DEFAULT_PRESENTATION, CUSTOM_EXAMPLE } from '../dist/core.mjs';
if (!process.env.DATABASE_URL)
  throw new Error('DATABASE_URL must refer to a dedicated test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
const app = createApplication({ pool });
await new Promise((resolve, reject) => {
  app.once('error', reject);
  app.listen(0, '127.0.0.1', resolve);
});
const origin = `http://127.0.0.1:${app.address().port}`,
  suffix = Date.now().toString(36),
  accounts = [],
  timelines = [];
function client() {
  let cookie = '',
    csrf = '';
  return {
    async request(path, method = 'GET', data, expected = 200, withCsrf = true) {
      const res = await fetch(origin + '/api/' + path, {
        method,
        headers: {
          ...(cookie ? { Cookie: cookie } : {}),
          ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(csrf && withCsrf ? { 'X-CSRF-Token': csrf } : {}),
        },
        ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
      });
      const value = await res.json();
      assert.equal(res.status, expected, JSON.stringify(value));
      if (res.headers.get('set-cookie')) cookie = res.headers.get('set-cookie').split(';')[0];
      if (value.csrf) csrf = value.csrf;
      return value;
    },
  };
}
const owner = client(),
  viewer = client(),
  editor = client(),
  anonymous = client();
try {
  for (const [c, prefix] of [
    [owner, 'owner'],
    [viewer, 'viewer'],
    [editor, 'editor'],
  ]) {
    const r = await c.request('auth/register', 'POST', {
      username: `${prefix}_${suffix}`,
      password: 'testing exact rational timelines',
    });
    accounts.push(r.user.id);
  }
  const document = demo(true);
  document.presentation = { ...DEFAULT_PRESENTATION, mode: 'custom', source: CUSTOM_EXAMPLE };
  const t = await owner.request('timelines', 'POST', document, 201);
  timelines.push(t.id);
  assert.equal(t.visibility, 'private');
  await anonymous.request(`timelines/${t.id}`, 'GET', undefined, 404);
  await viewer.request(`timelines/${t.id}`, 'GET', undefined, 404);
  await owner.request(`timelines/${t.id}/members`, 'POST', {
    username: `viewer_${suffix}`,
    role: 'viewer',
  });
  await owner.request(`timelines/${t.id}/members`, 'POST', {
    username: `editor_${suffix}`,
    role: 'editor',
  });
  const viewed = await viewer.request(`timelines/${t.id}`);
  assert.equal(viewed.canEdit, false);
  assert.deepEqual(viewed.presentation, document.presentation);
  const editing = await editor.request(`timelines/${t.id}`);
  assert.equal(editing.canEdit, true);
  const frame = await viewer.request(`timelines/${t.id}/query`, 'POST', {
    kind: 'overview',
    lower: '10',
    upper: '11',
    threshold: '1',
  });
  assert.equal(frame.groups[0].count, '20001');
  assert(frame.visitedNodes < 50);
  await viewer.request(`timelines/${t.id}`, 'PUT', { revision: t.revision, document }, 403);
  await owner.request(`timelines/${t.id}`, 'PUT', { revision: t.revision, document }, 403, false);
  const updated = await editor.request(`timelines/${t.id}`, 'PUT', {
    revision: t.revision,
    document: { ...document, title: 'An editor changed this' },
  });
  assert.equal(updated.revision, '2');
  await owner.request(`timelines/${t.id}`, 'PUT', { revision: t.revision, document }, 409);
  const snapshot = await viewer.request(`timelines/${t.id}/document`);
  assert.equal(validateDocument(snapshot.document).events.length, 20010);
  assert.deepEqual(snapshot.document.presentation, document.presentation);
  const page = await viewer.request(`timelines/${t.id}/query`, 'POST', {
    kind: 'events',
    lower: '10',
    upper: '11',
    limit: 5,
  });
  assert.equal(page.events.length, 5);
  assert(page.next);
  const next = await viewer.request(`timelines/${t.id}/query`, 'POST', {
    kind: 'events',
    lower: '10',
    upper: '11',
    limit: 5,
    after: page.next,
  });
  assert(!next.events.some((e) => page.events.some((p) => p.id === e.id)));
  await editor.request(`timelines/${t.id}/settings`, 'PATCH', { visibility: 'public' }, 403);
  await owner.request(`timelines/${t.id}/settings`, 'PATCH', { visibility: 'public' });
  const publicView = await anonymous.request(`timelines/${t.id}`);
  assert.equal(publicView.canEdit, false);
  assert.deepEqual(publicView.presentation, document.presentation);
  await anonymous.request(
    `timelines/${t.id}`,
    'PUT',
    { revision: publicView.revision, document },
    401,
  );
  await owner.request(`timelines/${t.id}/members`, 'DELETE', { username: `editor_${suffix}` });
  await editor.request(
    `timelines/${t.id}`,
    'PUT',
    { revision: publicView.revision, document },
    403,
  );
  await owner.request('auth/logout', 'POST', {});
  await owner.request('timelines', 'GET', undefined, 401);
  console.log(
    'PASS PostgreSQL HTTP: accounts, private/public access, viewer/editor roles, CSRF, atomic revision conflicts, bounded pages and cached overviews.',
  );
} finally {
  await pool.query('DELETE FROM oc_timelines WHERE id=ANY($1::uuid[])', [timelines]);
  await pool.query('DELETE FROM oc_users WHERE id=ANY($1::uuid[])', [accounts]);
  await new Promise((resolve) => app.close(resolve));
  await pool.end();
}
