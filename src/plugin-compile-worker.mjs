// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The server's sandbox for compiling plugin scripts (#157; server/plugin-sandbox.mjs): a
// worker thread given a script's source, answering whether it compiles. It holds nothing but
// the compiler, and runs no script.
import { parentPort } from 'node:worker_threads';
import { compilePluginScript } from './custom-time.ts';

parentPort.on('message', ({ id, source }) => {
  let error = null;
  try {
    if (typeof source !== 'string') throw new Error('A plugin script is text.');
    compilePluginScript(source);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  }
  parentPort.postMessage({ id, error });
});
