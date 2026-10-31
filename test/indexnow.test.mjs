// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// IndexNow (#389, server/indexnow.mjs): the key, its file, which public pages count as changed,
// and submissions in batches, at most hourly per address, retried with a wait. Every request
// goes to a stand-in; none reaches the network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BATCH_LIMIT,
  INDEXNOW_ENDPOINT,
  IndexNow,
  RESUBMIT_AFTER,
  changedPaths,
  indexNowKey,
  indexNowKeyFile,
  localOrigin,
  snapshot,
  startIndexNow,
} from '../server/indexnow.mjs';

// Nothing here may reach the network: a real request fails the test.
const realFetch = globalThis.fetch;
globalThis.fetch = () => {
  throw new Error('A test tried to reach the network.');
};
test.after(() => (globalThis.fetch = realFetch));

const KEY = 'a1b2c3d4e5f60718';
const quiet = { info() {}, warn() {}, error() {} };

test('IndexNow is off unless a valid key is set', () => {
  assert.equal(indexNowKey({}), null);
  assert.equal(indexNowKey({ INDEXNOW_KEY: '  ' }), null);
  assert.equal(indexNowKey({ INDEXNOW_KEY: ` ${KEY} ` }), KEY);
  assert.equal(indexNowKey({ INDEXNOW_KEY: 'Ab-' + 'x'.repeat(125) }).length, 128);
  for (const key of [
    'short1',
    'x'.repeat(129),
    'has space1',
    'dots.not.ok',
    'slash/es/no',
    'ünïcödé1',
  ])
    assert.throws(() => indexNowKey({ INDEXNOW_KEY: key }), /INDEXNOW_KEY/);
});

test('the key file is /<key>.txt, only when the key is set', () => {
  const env = { INDEXNOW_KEY: KEY };
  assert.equal(indexNowKeyFile(`/${KEY}.txt`, env), KEY);
  for (const path of [`/${KEY}`, `/${KEY}.txt/`, '/other1234.txt', `/x/${KEY}.txt`, '/robots.txt'])
    assert.equal(indexNowKeyFile(path, env), null, path);
  assert.equal(indexNowKeyFile(`/${KEY}.txt`, {}), null);
  assert.equal(indexNowKeyFile('/short.txt', { INDEXNOW_KEY: 'short' }), null);
});

const row = (id, owner, slug, updated = 1, disabled = false) => ({
  id,
  owner,
  slug,
  disabled,
  updated_at: new Date(updated * 1000),
});
const A = '00000000-0000-4000-8000-00000000000a',
  B = '00000000-0000-4000-8000-00000000000b',
  C = '00000000-0000-4000-8000-00000000000c';

test('changes: new, saved, renamed and removed timelines, and the profiles they change', () => {
  const before = snapshot([row(A, 'ada', 'rome'), row(B, 'ada', 'egypt')]);
  assert.deepEqual(changedPaths(before, before), new Set());
  // Saved: its page alone; its owner's profile lists the same timelines.
  assert.deepEqual(
    changedPaths(before, snapshot([row(A, 'ada', 'rome', 2), row(B, 'ada', 'egypt')])),
    new Set(['/ada/rome']),
  );
  // Renamed: both addresses, and the profile.
  assert.deepEqual(
    changedPaths(before, snapshot([row(A, 'ada', 'roma'), row(B, 'ada', 'egypt')])),
    new Set(['/ada/rome', '/ada/roma', '/ada']),
  );
  // Made private or deleted: its old address, and the profile, still listed for egypt.
  assert.deepEqual(
    changedPaths(before, snapshot([row(B, 'ada', 'egypt')])),
    new Set(['/ada/rome', '/ada']),
  );
  // Made public or created public by a new owner: its page and the new profile.
  assert.deepEqual(
    changedPaths(
      before,
      snapshot([row(A, 'ada', 'rome'), row(B, 'ada', 'egypt'), row(C, 'bo', 'c')]),
    ),
    new Set(['/bo/c', '/bo']),
  );
  // An account renamed: every address of its timelines and both profiles.
  assert.deepEqual(
    changedPaths(before, snapshot([row(A, 'ada2', 'rome'), row(B, 'ada2', 'egypt')])),
    new Set(['/ada/rome', '/ada2/rome', '/ada/egypt', '/ada2/egypt', '/ada', '/ada2']),
  );
  // A reserved name's pages are at /users/ and /timelines/.
  assert.deepEqual(
    changedPaths(
      before,
      snapshot([row(A, 'ada', 'rome'), row(B, 'ada', 'egypt'), row(C, 'for', 'c')]),
    ),
    new Set([`/timelines/${C}`, '/users/for']),
  );
});

test('a disabled account’s profile is not sent unless it was listed', () => {
  const before = snapshot([row(A, 'ada', 'rome')]);
  // Its timeline's page is public and listed in the sitemap; its profile is not.
  assert.deepEqual(
    changedPaths(before, snapshot([row(A, 'ada', 'rome'), row(C, 'cy', 'c', 1, true)])),
    new Set(['/cy/c']),
  );
  // Disabled since: its profile drops out of the sitemap, so it is sent.
  assert.deepEqual(
    changedPaths(before, snapshot([row(A, 'ada', 'rome', 1, true)])),
    new Set(['/ada']),
  );
});

/** A stand-in pool answering the public pages query with `rows`. */
function pool(rows) {
  const stand = { rows, query: async () => ({ rows: stand.rows }) };
  return stand;
}
/** A stand-in IndexNow endpoint answering each submission with the next status. */
function endpoint(statuses = []) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body), init });
    const status = statuses.shift() ?? 200;
    if (status === 'down') throw new Error('connect ECONNREFUSED');
    return new Response(null, { status });
  };
  return { calls, fetch };
}

test('the first poll is the baseline; changes are sent once, in the protocol’s shape', async () => {
  pool.current = pool([row(A, 'ada', 'rome')]);
  const remote = endpoint();
  let now = 1_000_000;
  const index = new IndexNow(pool.current, {
    origin: 'https://timescale.example/',
    key: KEY,
    fetch: remote.fetch,
    log: quiet,
    now: () => now,
  });
  await index.run();
  assert.equal(remote.calls.length, 0, 'nothing changed yet');
  pool.current.rows = [row(A, 'ada', 'rome', 2), row(B, 'ada', 'egypt')];
  await index.run();
  assert.equal(remote.calls.length, 1);
  const [{ url, body, init }] = remote.calls;
  assert.equal(url, INDEXNOW_ENDPOINT);
  assert.equal(init.method, 'POST');
  assert.match(init.headers['content-type'], /^application\/json/);
  assert.ok(init.signal instanceof AbortSignal, 'a submission has a time limit');
  assert.deepEqual(body, {
    host: 'timescale.example',
    key: KEY,
    keyLocation: `https://timescale.example/${KEY}.txt`,
    urlList: [
      'https://timescale.example/ada/rome',
      'https://timescale.example/ada/egypt',
      'https://timescale.example/ada',
    ],
  });
  // Saved again within the hour: held, then sent once the hour has passed.
  now += 60_000;
  pool.current.rows = [row(A, 'ada', 'rome', 3), row(B, 'ada', 'egypt')];
  await index.run();
  assert.equal(remote.calls.length, 1, 'an address goes at most once an hour');
  pool.current.rows = [row(A, 'ada', 'rome', 4), row(B, 'ada', 'egypt')];
  now += 60_000;
  await index.run();
  assert.equal(remote.calls.length, 1);
  now += RESUBMIT_AFTER;
  await index.run();
  assert.equal(remote.calls.length, 2);
  assert.deepEqual(remote.calls[1].body.urlList, ['https://timescale.example/ada/rome']);
  now += 60_000;
  await index.run();
  assert.equal(remote.calls.length, 2, 'nothing left to send');
});

test('failures that may pass are retried after a growing wait; refusals are dropped', async () => {
  pool.current = pool([]);
  const remote = endpoint(['down', 429, 503, 403]);
  let now = 0;
  const index = new IndexNow(pool.current, {
    origin: 'https://timescale.example',
    key: KEY,
    fetch: remote.fetch,
    log: quiet,
    now: () => now,
  });
  await index.run();
  pool.current.rows = [row(A, 'ada', 'rome')];
  await index.run(); // no answer: wait a minute
  assert.equal(remote.calls.length, 1);
  now += 30_000;
  await index.run();
  assert.equal(remote.calls.length, 1, 'still waiting');
  now += 30_000;
  await index.run(); // 429: wait two minutes
  assert.equal(remote.calls.length, 2);
  now += 120_000;
  await index.run(); // 503: wait four
  assert.equal(remote.calls.length, 3);
  now += 240_000;
  await index.run(); // 403: refused for good, dropped
  assert.equal(remote.calls.length, 4);
  now += 60_000;
  await index.run();
  assert.equal(remote.calls.length, 4, 'a refused batch is not sent again');
  assert.deepEqual(remote.calls[3].body.urlList, [
    'https://timescale.example/ada/rome',
    'https://timescale.example/ada',
  ]);
});

test('many changes go in batches of at most the protocol’s limit', async () => {
  pool.current = pool([]);
  const remote = endpoint();
  const index = new IndexNow(pool.current, {
    origin: 'https://timescale.example',
    key: KEY,
    fetch: remote.fetch,
    log: quiet,
  });
  await index.run();
  pool.current.rows = Array.from({ length: BATCH_LIMIT + 5 }, (_, i) =>
    row(`00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, 'ada', 's' + i),
  );
  await index.run();
  assert.deepEqual(
    remote.calls.map((c) => c.body.urlList.length),
    [BATCH_LIMIT, 6],
  );
});

test('a failing database is logged, never thrown', async () => {
  const errors = [];
  const index = new IndexNow(
    { query: async () => Promise.reject(new Error('down')) },
    {
      origin: 'https://timescale.example',
      key: KEY,
      fetch: endpoint().fetch,
      log: { ...quiet, error: (...args) => errors.push(args) },
    },
  );
  await index.run();
  assert.equal(errors.length, 1);
});

test('an origin on this machine, as tests use, is never submitted', () => {
  for (const origin of [
    'http://localhost:5173',
    'http://127.0.0.1:5199',
    'http://[::1]:3000',
    'http://app.localhost',
  ])
    assert.ok(localOrigin(origin), origin);
  for (const origin of ['https://timescale.info', 'https://example.com', 'http://10.0.0.5'])
    assert.ok(!localOrigin(origin), origin);
  const warnings = [];
  const queried = [];
  const stop = startIndexNow(
    { query: async () => queried.push(1) },
    { origin: 'http://127.0.0.1:5199', key: KEY, log: { warn: (w) => warnings.push(w) } },
    10,
  );
  stop();
  assert.equal(warnings.length, 1);
  assert.deepEqual(queried, []);
});
