// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { liveResponse, TimelineNotifications } from '../server/live.mjs';
const id = '11111111-1111-4111-8111-111111111111';
test('live stream subscribes before initial revision and rechecks access before each notification', async () => {
  const client = new EventEmitter(),
    calls = [];
  client.query = async (sql) => {
    calls.push(sql);
  };
  client.release = () => {};
  const notifications = new TimelineNotifications({ connect: async () => client });
  let revision = '1',
    allowed = true,
    accesses = 0;
  const services = {
    origin: 'http://localhost',
    pool: {},
    notifications,
    auth: { session: async () => ({ id: 'alice' }) },
    store: {
      access: async () => {
        accesses++;
        if (!allowed) throw Object.assign(new Error('denied'), { status: 404 });
        return { revision };
      },
    },
  };
  const response = await liveResponse(
    new Request(`http://localhost/api/live?timelines=${id}`),
    services,
  );
  assert.equal(response.headers.get('Content-Type'), 'text/event-stream');
  const reader = response.body.getReader(),
    decode = new TextDecoder();
  assert.match(decode.decode((await reader.read()).value), /"revision":"1"/);
  assert.deepEqual(calls, ['LISTEN oc_timeline_changes']);
  revision = '2';
  client.emit('notification', { channel: 'oc_timeline_changes', payload: id });
  assert.match(decode.decode((await reader.read()).value), /"revision":"2"/);
  allowed = false;
  client.emit('notification', { channel: 'oc_timeline_changes', payload: id });
  assert.match(decode.decode((await reader.read()).value), /event: access/);
  assert.equal((await reader.read()).done, true);
  assert(accesses >= 4);
  notifications.close();
});
test('live endpoints reject cross-origin requests, malformed IDs and unauthorized private timelines', async () => {
  const services = {
    pool: {},
    origin: 'http://localhost',
    auth: { session: async () => null },
    store: {
      access: async () => {
        throw Object.assign(new Error('private'), { status: 404 });
      },
    },
  };
  const response = await liveResponse(
    new Request(`http://localhost/api/live?timelines=${id}`, {
      headers: { Origin: 'https://attacker.test' },
    }),
    services,
  );
  assert.equal(response.status, 403);
  assert.equal(
    (await liveResponse(new Request('http://localhost/api/live?timelines=bad'), services)).status,
    400,
  );
  assert.equal(
    (await liveResponse(new Request(`http://localhost/api/live?timelines=${id}`), services)).status,
    404,
  );
});
test('live stream consumer cancellation releases its subscription', async () => {
  const listeners = new Set();
  const services = {
    pool: {},
    origin: 'http://localhost',
    auth: { session: async () => null },
    store: { access: async () => ({ revision: '1' }) },
    notifications: {
      subscribe: async (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
  };
  const response = await liveResponse(
    new Request(`http://localhost/api/live?timelines=${id}`),
    services,
  );
  const reader = response.body.getReader();
  await reader.read();
  assert.equal(listeners.size, 1);
  await reader.cancel();
  assert.equal(listeners.size, 0);
});
