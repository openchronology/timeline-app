// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// What the page may make the real desktop app do, through tauri-driver: only the app's own
// commands (none of Tauri's or its plugins'), and thumbnails only of files in folders the user
// chose, never elsewhere or in a network automount folder, for a timeline not trusted. Build
// the app first, as for desktop-bulk.mjs:
//   npm run build:editor && npx tauri build --debug --no-bundle
// then run under a display (xvfb-run -a node test/desktop-access.mjs on Linux). It runs the app
// with settings and a cache of its own (XDG_CONFIG_HOME, XDG_CACHE_HOME), connected to no server.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { startTauriDriver, webdriverSession } from '../bench/ui/webdriver.mjs';

const home = await realpath(await mkdtemp(join(tmpdir(), 'och-access-')));
const config = join(home, 'config', 'com.openchronology.desktop'),
  chosen = join(home, 'Pictures'),
  elsewhere = join(home, 'Downloads');
for (const folder of [config, chosen, elsewhere]) await mkdir(folder, { recursive: true });
// A one-pixel PNG, which the app scales into a thumbnail itself.
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
await writeFile(join(chosen, 'a.png'), png);
await writeFile(join(elsewhere, 'b.png'), png);
// No server, and the folder populated from before, as the app remembers it.
await writeFile(join(config, 'servers.json'), '[]');
await writeFile(
  join(config, 'access.json'),
  JSON.stringify({ folders: [{ picked: chosen, real: chosen }], trusted: [], images: [] }),
);
process.env.XDG_CONFIG_HOME = join(home, 'config');
process.env.XDG_CACHE_HOME = join(home, 'cache');

const port = Number(process.env.UI_WEBDRIVER_PORT ?? 4448);
const driver = await startTauriDriver(port, ['--native-port', String(port + 1)]);
let d;
try {
  d = await webdriverSession(
    driver.url,
    resolve(
      process.env.UI_DESKTOP_APP ??
        `${process.env.CARGO_TARGET_DIR ?? 'src-tauri/target'}/debug/openchronology-desktop`,
    ),
    { logs: driver.logs },
  );
  await d.wait(`!!document.getElementById('json-file')`, 60000);
  /** What `invoke(command, args)` answers in the app (`value`), or why it is refused. */
  const invoke = (command, args) =>
    d.eval(
      `window.__TAURI__.core.invoke(${JSON.stringify(command)}, ${JSON.stringify(args)}).then((value) => ({ value }), (reason) => ({ refused: String(reason) }))`,
    );
  // The app's commands answer; Tauri's own, which the editor doesn't use, are refused.
  assert.deepEqual(await invoke('desktop_servers', {}), { value: [] });
  for (const [command, args] of [
    ['plugin:window|set_title', { label: 'main', value: 'Not the app' }],
    ['plugin:menu|new', { kind: 'Menu', options: {} }],
    ['plugin:dialog|open', { options: {} }],
  ]) {
    const answer = await invoke(command, args);
    assert.match(answer.refused ?? '', /not allowed/i, command);
  }
  // A timeline held in the page alone is neither trusted nor a file's.
  assert.deepEqual(await invoke('desktop_trust', {}), {
    value: { trusted: false, images: true },
  });
  // Thumbnails only in the folder chosen: elsewhere, and in a network automount folder,
  // nothing, without the file being read.
  const link = (path) => pathToFileURL(path).href;
  const { value: found } = await invoke('desktop_thumbnails', {
    urls: [
      link(join(chosen, 'a.png')),
      link(join(elsewhere, 'b.png')),
      'file:///net/attacker.example/share/c.jpg',
    ],
  });
  assert.match(found[0] ?? '', /^data:image\/jpeg;base64,/);
  assert.deepEqual(found.slice(1), [null, null]);
  console.log(
    "PASS desktop access: only the app's commands, and thumbnails only of chosen folders' files.",
  );
} finally {
  await d?.close().catch(() => {});
  driver.stop();
  await rm(home, { recursive: true, force: true });
}
