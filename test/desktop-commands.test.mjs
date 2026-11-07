// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The desktop app's commands and what its window may call: every command main.rs registers is in
// build.rs's list (which makes their permissions) and granted to the editor window, nothing of
// Tauri's or its plugins' is, and the content security policy keeps scripts to the app's own.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL('../src-tauri/' + path, import.meta.url), 'utf8');

test("the editor window may call the app's own commands, and only those", async () => {
  const main = await read('src/main.rs'),
    build = await read('build.rs'),
    capability = JSON.parse(await read('capabilities/default.json'));
  const registered = /generate_handler!\[([^\]]*)\]/
    .exec(main)[1]
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
    .sort();
  const listed = [
    .../const COMMANDS: &\[&str\] = &\[([^\]]*)\]/.exec(build)[1].matchAll(/"(\w+)"/g),
  ]
    .map((m) => m[1])
    .sort();
  assert.deepEqual(listed, registered, 'build.rs lists every registered command');
  for (const name of registered)
    assert(main.includes(`fn ${name}(`), `${name} is a function in main.rs`);
  assert.deepEqual(
    [...capability.permissions].sort(),
    registered.map((name) => 'allow-' + name.replaceAll('_', '-')).sort(),
    "the window is granted exactly the app's commands",
  );
  assert.deepEqual(capability.windows, ['main']);
  assert(!capability.remote, 'no remote origin may call them');
});

test('the desktop page runs only its own scripts', async () => {
  const config = JSON.parse(await read('tauri.conf.json'));
  const csp = Object.fromEntries(
    config.app.security.csp.split(';').map((part) => {
      const [name, ...values] = part.trim().split(/\s+/);
      return [name, values];
    }),
  );
  assert.deepEqual(
    csp['script-src'].filter((source) => !/^'sha256-[A-Za-z0-9+/=]+'$/.test(source)),
    ["'self'"],
  );
  assert(!config.app.security.csp.includes('unsafe-eval'));
  // Requests to servers go through Rust (src-tauri/src/server.rs), never from the page.
  assert.deepEqual(csp['connect-src'], ['ipc:', 'http://ipc.localhost']);
});
