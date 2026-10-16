// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Changes made at once to a large desktop file (#179), in the real app through tauri-driver:
// shifting what is tagged and deleting everything in a view happen in the native store,
// unsaved, and Undo and Redo take them back and forward. Build the app first:
//   npm run build:editor && npx tauri build --debug --no-bundle
// then run under a display (xvfb-run -a node test/desktop-bulk.mjs on Linux). In a virtual
// machine WebKitGTK may draw nothing without WEBKIT_DISABLE_DMABUF_RENDERER=1 and
// WEBKIT_DISABLE_COMPOSITING_MODE=1.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { webdriverSession } from '../bench/ui/webdriver.mjs';

const port = Number(process.env.UI_WEBDRIVER_PORT ?? 4446),
  url = `http://127.0.0.1:${port}`;
// Its own ports, apart from the UI benchmarks' (4444, and 4445 for the native driver).
const driver = spawn(
  process.env.TAURI_DRIVER ?? 'tauri-driver',
  ['--port', String(port), '--native-port', String(port + 1)],
  { stdio: ['ignore', 'pipe', 'pipe'] },
);
let logs = '';
for (const s of [driver.stdout, driver.stderr])
  s.on('data', (c) => (logs = (logs + c).slice(-8000)));
let d;
try {
  for (let i = 0; ; i++) {
    if (driver.exitCode !== null) throw new Error('tauri-driver exited:\n' + logs);
    try {
      if ((await fetch(url + '/status', { signal: AbortSignal.timeout(500) })).ok) break;
    } catch {}
    if (i > 100) throw new Error('tauri-driver did not start:\n' + logs);
    await delay(100);
  }
  d = await webdriverSession(
    url,
    resolve(
      process.env.UI_DESKTOP_APP ??
        `${process.env.CARGO_TARGET_DIR ?? 'src-tauri/target'}/debug/openchronology-desktop`,
    ),
  );
  await d.wait(`!!document.getElementById('json-file')`, 60000);
  const document = {
    format: 'openchronology',
    version: 1,
    title: 'Changed at once',
    description: '',
    events: Array.from({ length: 5000 }, (_, i) => ({
      id: 'm' + i,
      time: `${i}/1`,
      metadata: { title: 'Moment ' + i, ...(i % 2 ? {} : { tags: ['even'] }) },
    })),
    durations: [{ id: 'span', start: '10/1', end: '30/1', metadata: { title: 'Span' } }],
  };
  await d.setFile('#json-file', 'bulk.ochx', JSON.stringify(document));
  // Over 2,048 moments, the timeline moves into the native SQLite store.
  await d.wait(`document.documentElement.dataset.storage === 'sqlite'`, 120000);
  const count = `[...document.querySelectorAll('#markers .event-marker')].reduce((n, m) => n + Number(m.dataset.count), 0)`;
  /** Shows exactly [left, right] and waits until it holds `expected` moments, if given. */
  const view = async (left, right, expected) => {
    await d.eval(`(() => {
      document.getElementById('exact-left').value = '${left}';
      document.getElementById('exact-right').value = '${right}';
      document.getElementById('apply-exact-bounds').click();
    })()`);
    await d.wait(`document.getElementById('exact-left').value === '${left}/1'`);
    if (expected !== undefined) await d.wait(`${count} === ${expected}`, 30000);
  };
  /** Opens the timeline menu in the middle of the view and chooses `item`. */
  const menu = async (item) => {
    await d.eval(`(() => {
      const stage = document.getElementById('timeline-stage'), r = stage.getBoundingClientRect();
      stage.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: r.x + r.width / 2, clientY: r.y + 60 }));
    })()`);
    await d.wait(`!document.getElementById('timeline-menu').hidden`);
    await d.eval(
      `[...document.querySelectorAll('#timeline-menu button')].find((b) => b.textContent === ${JSON.stringify(item)}).click()`,
    );
  };
  const toast = (text) =>
    d.wait(`document.getElementById('toast').textContent.includes(${JSON.stringify(text)})`, 60000);
  const clearToast = () => d.eval(`document.getElementById('toast').textContent = ''`);
  const set = (id, value) =>
    d.eval(`(() => {
      const field = document.getElementById(${JSON.stringify(id)});
      field.value = ${JSON.stringify(value)};
      field.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
  const click = (id) => d.eval(`document.getElementById(${JSON.stringify(id)}).click()`);

  await view(-10, 5010, 5000);
  // What is tagged moves 100,000 later, told ahead it stays unsaved until the file is saved.
  await menu('Shift or scale times…');
  await d.wait(`document.getElementById('map-dialog').open`);
  await set('map-offset', '100000');
  await set('map-tags', 'even');
  await d.eval(`document.querySelector('input[name=map-scope][value=tagged]').click()`);
  await d.wait(
    `document.getElementById('map-summary').textContent.includes('you can undo it until you save the file')`,
  );
  await clearToast();
  await click('map-submit');
  await toast('Moved 2,500 moments and 0 durations. Undo restores them.');
  await d.wait(`!document.getElementById('map-dialog').open`);
  await view(-10, 5010, 2500);
  await view(99990, 105010, 2500);
  // Undo takes it back; Redo moves them again.
  await click('undo-button');
  await view(-10, 5010, 5000);
  await click('redo-button');
  await view(-10, 5010, 2500);
  await click('undo-button');
  await view(-10, 5010, 5000);

  // Everything in a view goes at once: moments 0 to 1009, and the duration inside it.
  await view(-10, 1009);
  await menu('Delete everything in this view…');
  await d.wait(`document.getElementById('delete-dialog').open`);
  assert.match(
    await d.eval(`document.getElementById('delete-description').textContent`),
    /You can undo this until you save the file\./,
  );
  await clearToast();
  await click('delete-confirm');
  await toast('Deleted 1,010 moments and 1 duration.');
  await view(-10, 5010, 3990);
  await click('undo-button');
  await view(-10, 5010, 5000);
  // The duration is back too: at this zoom, collapsed into the group near 0.
  await d.wait(
    `[...document.querySelectorAll('#markers .event-marker')].some((m) => m.getAttribute('aria-label').includes('1 duration'))`,
  );

  // Unsaved edits first: refused, so the change made at once cannot lose them.
  await d.eval(`(() => {
    const title = document.getElementById('timeline-title');
    title.value = 'Renamed';
    title.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await menu('Shift or scale times…');
  await d.wait(`document.getElementById('map-dialog').open`);
  await set('map-offset', '5');
  await click('map-submit');
  await d.wait(
    `document.getElementById('map-error').textContent === 'Save your changes first: this changes the whole file at once.'`,
  );
  console.log('PASS desktop bulk edits: shifting and deleting at once in the native store; Undo.');
} catch (error) {
  if (d)
    console.log(
      'state',
      await d
        .eval(
          `JSON.stringify({ toast: document.getElementById('toast').textContent, error: document.getElementById('map-error')?.textContent, open: [...document.querySelectorAll('dialog[open]')].map((x) => x.id), view: document.getElementById('markers').dataset.view, markers: document.querySelectorAll('#markers .event-marker').length, first: document.querySelector('#markers .event-marker')?.outerHTML.slice(0, 300), exact: [document.getElementById('exact-left').value, document.getElementById('exact-right').value], storage: document.documentElement.dataset.storage, size: [innerWidth, innerHeight], loading: !document.getElementById('loading-window').hidden, empty: !document.getElementById('empty-window').hidden, count: ${'[...document.querySelectorAll("#markers .event-marker")].reduce((n, m) => n + Number(m.dataset.count), 0)'} })`,
        )
        .catch((e) => e.message),
    );
  throw error;
} finally {
  await d?.close().catch(() => {});
  driver.kill();
}
