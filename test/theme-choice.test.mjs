// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The color scheme's choice (#382): stored and applied, System as no attribute, storage that
// fails tolerated; the inline script that applies it before the first paint (a parameter first,
// then the stored choice, never in an embed); and the editor's page and the desktop app's and
// offline file's policies carrying that script's hash.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import {
  THEME_BOOT,
  THEME_KEY,
  applyChoice,
  chooseTheme,
  parseChoice,
  storedChoice,
} from '../dist/theme-choice.mjs';
import { inlineScriptHashes } from '../scripts/offline.mjs';

/** A stand-in for <html>'s attributes. */
function element() {
  const attributes = new Map();
  return {
    attributes,
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: (name) => attributes.delete(name),
    getAttribute: (name) => attributes.get(name) ?? null,
  };
}
/** A stand-in for localStorage, or one that throws as a blocked one does. */
function storage(entries = {}, broken = false) {
  const map = new Map(Object.entries(entries));
  const check = () => {
    if (broken) throw new Error('SecurityError');
  };
  return {
    map,
    getItem: (key) => (check(), map.get(key) ?? null),
    setItem: (key, value) => (check(), map.set(key, String(value))),
    removeItem: (key) => (check(), map.delete(key)),
  };
}

test('a choice is stored, applied, and System is no attribute', () => {
  assert.equal(parseChoice('dark'), 'dark');
  assert.equal(parseChoice('light'), 'light');
  for (const other of [null, undefined, '', 'Dark', 'sepia', 1])
    assert.equal(parseChoice(other), 'system');
  const store = storage(),
    root = element();
  chooseTheme('dark', () => store, root);
  assert.equal(store.map.get(THEME_KEY), 'dark');
  assert.equal(root.getAttribute('data-theme'), 'dark');
  assert.equal(
    storedChoice(() => store),
    'dark',
  );
  chooseTheme('system', () => store, root);
  assert.equal(store.map.has(THEME_KEY), false);
  assert.equal(root.getAttribute('data-theme'), null);
  assert.equal(
    storedChoice(() => store),
    'system',
  );
  applyChoice('light', root);
  assert.equal(root.getAttribute('data-theme'), 'light');
});

test('storage that fails leaves System, and a choice still applies to the page', () => {
  const broken = storage({}, true),
    root = element();
  assert.equal(
    storedChoice(() => broken),
    'system',
  );
  assert.equal(
    storedChoice(() => {
      throw new Error('no localStorage');
    }),
    'system',
  );
  chooseTheme('dark', () => broken, root);
  assert.equal(root.getAttribute('data-theme'), 'dark');
  assert.equal(
    storedChoice(() => null),
    'system',
  );
});

/** What THEME_BOOT sets on <html> at `href` with `entries` stored (or a broken storage). */
function boot(href, entries = {}, broken = false) {
  const root = element(),
    url = new URL(href);
  const context = {
    document: { documentElement: root },
    location: { search: url.search, pathname: url.pathname },
  };
  Object.defineProperty(context, 'localStorage', {
    get: () => {
      if (broken === 'missing') throw new Error('SecurityError');
      return storage(entries, broken);
    },
  });
  vm.runInNewContext(THEME_BOOT, context);
  return root.getAttribute('data-theme');
}

test('the inline script applies a parameter, then the stored choice, but not in an embed', () => {
  const site = 'https://example.org';
  assert.equal(boot(site + '/explore'), null);
  assert.equal(boot(site + '/explore', { [THEME_KEY]: 'dark' }), 'dark');
  assert.equal(boot(site + '/explore', { [THEME_KEY]: 'light' }), 'light');
  assert.equal(boot(site + '/explore', { [THEME_KEY]: 'purple' }), null);
  assert.equal(boot(site + '/explore?theme=light', { [THEME_KEY]: 'dark' }), 'light');
  assert.equal(boot(site + '/explore?a=1&theme=dark'), 'dark');
  assert.equal(boot(site + '/explore?theme=darkest'), null);
  assert.equal(boot(site + '/explore', {}, true), null);
  assert.equal(boot(site + '/explore', {}, 'missing'), null);
  assert.equal(boot(site + '/explore?theme=dark', {}, 'missing'), 'dark');
  // An embed follows the page it is in: the system's setting or its own parameter.
  const embed = site + '/embed/0f8fad5b-d9cb-469f-a165-70867728950e';
  assert.equal(boot(embed, { [THEME_KEY]: 'dark' }), null);
  assert.equal(boot(embed + '?theme=dark', { [THEME_KEY]: 'light' }), 'dark');
});

test('the editor page carries the script, and the desktop app and offline file its hash', async () => {
  const html = await readFile(new URL('../src/index.html', import.meta.url), 'utf8');
  assert(html.includes(`<script>${THEME_BOOT}</script>`), 'src/index.html has THEME_BOOT');
  const hash = createHash('sha256').update(THEME_BOOT).digest('base64');
  assert.deepEqual(inlineScriptHashes(html), [hash]);
  const tauri = JSON.parse(
    await readFile(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'),
  );
  assert(tauri.app.security.csp.includes(`'sha256-${hash}'`), 'the desktop app allows it');
  const offline = await readFile(
    new URL('../dist/openchronology-offline.html', import.meta.url),
    'utf8',
  );
  assert(offline.includes(`'sha256-${hash}'`), 'the offline file allows it');
});
