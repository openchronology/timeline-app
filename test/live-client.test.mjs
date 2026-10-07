// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { liveUpdates } from '../dist/live-updates.mjs';
const settle = () => new Promise((resolve) => setImmediate(resolve));
test('live browser push refreshes only changed revisions, pauses hidden views and cleans up', async () => {
  const oldDocument = globalThis.document,
    oldSource = globalThis.EventSource;
  const document = new EventTarget();
  document.hidden = false;
  globalThis.document = document;
  const streams = [];
  class Source extends EventTarget {
    static OPEN = 1;
    readyState = 1;
    constructor(url) {
      super();
      this.url = url;
      streams.push(this);
    }
    close() {
      this.readyState = 2;
    }
  }
  globalThis.EventSource = Source;
  let revision = '1',
    refreshes = 0,
    checks = 0;
  const controller = liveUpdates({
    sources: () => [{ id: 'test', revision }],
    available: () => true,
    native: () => false,
    check: async () => {
      checks++;
      return { id: 'test', revision };
    },
    refresh: async (id, next) => {
      revision = next;
      refreshes++;
    },
    denied() {},
  });
  try {
    await controller.update();
    assert.equal(checks, 0);
    assert.equal(streams.length, 1);
    streams[0].dispatchEvent(
      new MessageEvent('revision', { data: JSON.stringify({ id: 'test', revision: '2' }) }),
    );
    await settle();
    assert.equal(refreshes, 1);
    streams[0].dispatchEvent(
      new MessageEvent('revision', { data: JSON.stringify({ id: 'test', revision: '2' }) }),
    );
    await settle();
    assert.equal(refreshes, 1);
    document.hidden = true;
    await controller.update();
    assert.equal(streams[0].readyState, 2);
    document.hidden = false;
    await controller.update();
    assert.equal(streams.length, 2);
  } finally {
    controller.close();
    globalThis.document = oldDocument;
    globalThis.EventSource = oldSource;
  }
});
test('native live refresh polls metadata without requiring EventSource or fetching documents', async () => {
  const oldDocument = globalThis.document,
    oldSource = globalThis.EventSource;
  const document = new EventTarget();
  document.hidden = false;
  globalThis.document = document;
  globalThis.EventSource = undefined;
  let revision = '1',
    calls = 0;
  const controller = liveUpdates({
    sources: () => [{ id: 'native', revision }],
    available: () => true,
    native: () => true,
    check: async () => {
      calls++;
      return { id: 'native', revision: '2' };
    },
    refresh: async (id, next) => {
      revision = next;
    },
    denied() {},
  });
  try {
    await controller.update();
    await settle();
    assert.equal(calls, 1);
    assert.equal(revision, '2');
    document.hidden = true;
    await controller.update();
    assert.equal(calls, 1);
  } finally {
    controller.close();
    globalThis.document = oldDocument;
    globalThis.EventSource = oldSource;
  }
});
