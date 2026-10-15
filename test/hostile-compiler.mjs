// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// A stand-in for the plugin compiler's worker (plugin-sandbox.test.mjs), misbehaving on request:
// "spin" never answers, "memory" allocates without end, "environment" reports what it was given;
// anything else compiles.
import { parentPort } from 'node:worker_threads';

parentPort.on('message', ({ id, source }) => {
  if (source === 'spin') for (;;);
  if (source === 'memory') {
    const kept = [];
    for (;;) kept.push(new Array(1e6).fill(kept.length));
  }
  if (source === 'environment')
    return parentPort.postMessage({ id, error: JSON.stringify(Object.keys(process.env)) });
  parentPort.postMessage({ id, error: null });
});
