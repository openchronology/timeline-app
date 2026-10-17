// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Queueing log moments for their timelines (server/moment-ingest.mjs, shared by the syslog and
// journald receivers): a failing timeline backs off, however many messages keep arriving.
import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { MomentIngest } from '../server/moment-ingest.mjs';

const KEY = `och_key_${'a'.repeat(32)}_${'b'.repeat(64)}`;
const moment = (n) => ({ id: 'm' + n, time: `${n}/1`, metadata: { title: 'Line ' + n } });

test('a failing timeline keeps backing off while messages keep arriving (#177)', async () => {
  let requests = 0;
  const ingest = new MomentIngest({
    api: 'http://127.0.0.1:9',
    key: KEY,
    routes: { timelines: ['t'] },
    // The server is down: every request fails, which is worth retrying later.
    fetcher: async () => {
      requests++;
      return new Response(JSON.stringify({ error: 'down' }), { status: 500 });
    },
    flushMs: 50,
    log: { warn() {}, error() {}, info() {} },
  });
  // A full batch is sent at once, and fails.
  for (let n = 0; n < 500; n++) ingest.enqueue(['t'], moment(n));
  await delay(100);
  const first = requests;
  assert(first >= 1, 'the full batch was sent');
  // More messages arrive during the backoff (2 s after the first failure): each would once
  // have cancelled it and retried at once.
  for (let n = 500; n < 600; n++) {
    ingest.enqueue(['t'], moment(n));
    await delay(5);
  }
  await delay(100);
  assert.equal(requests, first, 'no retry before the backoff ends');
  assert.equal(ingest.queues.get('t').moments.length, 600, 'and nothing was dropped');
  clearTimeout(ingest.queues.get('t').timer);
});
