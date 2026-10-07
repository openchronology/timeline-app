// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { followLatest } from '../dist/follow-latest.mjs';
function fixture(load) {
  let now = 0,
    next = 0,
    blocked = false;
  const timers = new Map(),
    applied = [],
    errors = [],
    calls = [];
  const host = {
    load: (signal) => {
      calls.push(signal);
      return load ? load(signal) : Promise.resolve('latest');
    },
    apply: (value) => applied.push(value),
    blocked: () => blocked,
    cancel() {},
    error: (error) => errors.push(error),
  };
  const follow = followLatest(host, {
    now: () => now,
    set: (run, delay) => {
      const id = ++next;
      timers.set(id, { run, at: now + delay });
      return id;
    },
    clear: (id) => timers.delete(id),
  });
  async function advance(ms) {
    const end = now + ms;
    for (;;) {
      const entry = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
      if (!entry || entry[1].at > end) break;
      now = entry[1].at;
      timers.delete(entry[0]);
      entry[1].run();
      await Promise.resolve();
      await Promise.resolve();
    }
    now = end;
  }
  return {
    follow,
    advance,
    applied,
    calls,
    errors,
    block: (value) => {
      blocked = value;
    },
  };
}
test('follow is opt-in and requires an addition; navigation restarts its idle deadline', async () => {
  const f = fixture();
  f.follow.addition();
  await f.advance(20000);
  assert.equal(f.calls.length, 0);
  f.follow.setEnabled(true);
  await f.advance(20000);
  assert.equal(f.calls.length, 0);
  f.follow.navigation();
  f.follow.addition();
  f.follow.addition();
  await f.advance(14000);
  assert.equal(f.calls.length, 0);
  f.follow.navigation();
  await f.advance(14999);
  assert.equal(f.calls.length, 0);
  await f.advance(1);
  assert.deepEqual(f.applied, ['latest']);
  assert.equal(f.calls.length, 1);
  await f.advance(60000);
  assert.equal(f.calls.length, 1);
});
test('blocked views defer fetching until the dialog, edit or gesture ends', async () => {
  const f = fixture();
  f.follow.setEnabled(true);
  f.block(true);
  f.follow.addition();
  await f.advance(30000);
  assert.equal(f.calls.length, 0);
  f.block(false);
  f.follow.wake();
  await f.advance(0);
  assert.deepEqual(f.applied, ['latest']);
});
test('navigation aborts an in-flight request and stale results cannot move the viewport', async () => {
  let resolve;
  const f = fixture(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  f.follow.setEnabled(true);
  f.follow.addition();
  await f.advance(0);
  f.follow.navigation();
  assert(f.calls[0].aborted);
  resolve('stale');
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(f.applied, []);
  await f.advance(14999);
  assert.equal(f.calls.length, 1);
  await f.advance(1);
  assert.equal(f.calls.length, 2);
  resolve('fresh');
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(f.applied, ['fresh']);
});
test('disabling or switching timeline cancels requests and discards queued additions', async () => {
  for (const stop of ['reset', 'setEnabled']) {
    let resolve;
    const f = fixture(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    f.follow.setEnabled(true);
    f.follow.addition();
    await f.advance(0);
    f.follow[stop](false);
    assert(f.calls[0].aborted);
    resolve('stale');
    await Promise.resolve();
    await Promise.resolve();
    await f.advance(60000);
    assert.deepEqual(f.applied, []);
    assert.equal(f.calls.length, 1);
  }
});
test('empty timelines do not move the camera, and failures do not loop requests', async () => {
  const empty = fixture(() => Promise.resolve(null));
  empty.follow.setEnabled(true);
  empty.follow.addition();
  await empty.advance(0);
  assert.deepEqual(empty.applied, []);
  const f = fixture(() => Promise.reject(new Error('unavailable')));
  f.follow.setEnabled(true);
  f.follow.addition();
  await f.advance(60000);
  assert.equal(f.errors.length, 1);
  assert.equal(f.calls.length, 1);
});
