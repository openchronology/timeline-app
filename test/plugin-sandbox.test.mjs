// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The plugin compiler’s sandbox (#157): scripts compile in a worker, and ones that exhaust its
// time or memory are refused without harming the server.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPluginCompiler } from '../server/plugin-sandbox.mjs';
import { PLUGIN_EXAMPLE } from '../dist/core.mjs';

const hostile = new URL('./hostile-compiler.mjs', import.meta.url);

test('the server compiles plugin scripts in a worker and refuses those that do not compile', async () => {
  const compiler = createPluginCompiler();
  try {
    await compiler.check(PLUGIN_EXAMPLE.source);
    await assert.rejects(
      compiler.check('function render(m,api) { return fetch("https://evil.example"); }'),
      /Unknown local variable: fetch/,
    );
    // Remembered by source: refused again without compiling.
    await assert.rejects(
      compiler.check('function render(m,api) { return fetch("https://evil.example"); }'),
      /fetch/,
    );
    await assert.rejects(compiler.check('function render(m,api) {'.repeat(1000)));
  } finally {
    await compiler.close();
  }
});

test('a script that exhausts the compiler’s time or memory is refused without affecting the server', async () => {
  const compiler = createPluginCompiler({
    file: hostile,
    timeLimit: 300,
    resourceLimits: { maxOldGenerationSizeMb: 16, maxYoungGenerationSizeMb: 4, stackSizeMb: 1 },
  });
  try {
    // The server's thread keeps running while a worker spins.
    let ticks = 0;
    const ticking = setInterval(() => ticks++, 10);
    const started = performance.now();
    await assert.rejects(compiler.check('spin'), /took too long to compile/);
    clearInterval(ticking);
    assert(performance.now() - started < 2000);
    assert(ticks >= 10, `the event loop ran ${ticks} times`);
    await assert.rejects(compiler.check('memory'), /too much memory/);
    // Workers that exceeded a limit are replaced: the next script compiles.
    await compiler.check('fine');
    // Refusals for exceeding a limit are not remembered: the same script is tried again.
    await assert.rejects(compiler.check('spin'), /took too long/);
    // Scripts compile two at a time; the rest wait for a worker.
    await Promise.all([compiler.check('a'), compiler.check('b'), compiler.check('c')]);
    // A worker is given nothing: no environment, so no secrets.
    await assert.rejects(compiler.check('environment'), (error) => error.message === '[]');
  } finally {
    await compiler.close();
  }
});
