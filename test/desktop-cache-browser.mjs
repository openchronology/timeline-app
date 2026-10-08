// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import { closeMomentDetails } from './moment-dialog-browser.mjs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Q, Viewport, TimelineIndex } from '../dist/core.mjs';
export async function checkDesktopCache(browser) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
  let document = {
    format: 'openchronology',
    version: 1,
    title: 'Cached SQLite timeline',
    description: '',
    events: [
      ...Array.from({ length: 10000 }, (_, i) => ({
        id: 'dense-' + i,
        time: Q.from(BigInt(i), 100000n).toString(),
        metadata: { title: 'Dense ' + i },
      })),
      {
        id: 'near',
        time: '10/1',
        metadata: { title: 'Nearby moment', description: 'SQLite inspector notes' },
      },
      { id: 'far', time: '10000/1', metadata: { title: 'Far away' } },
    ],
    durations: [
      {
        id: 'period',
        start: '12/1',
        end: { moment: 'near' },
        metadata: { title: 'Cached period', notes: { detail: 'not in viewport payloads' } },
      },
    ],
  };
  let index = new TimelineIndex(document),
    generation = 1,
    reads = 0,
    durationReads = 0;
  const overviews = [],
    details = [],
    saves = [],
    errors = [];
  const header = () => ({
    document: { ...document, events: [], durations: [] },
    generation,
    path: '/tmp/cached.och',
    event_count: String(document.events.length),
    first: '0/1',
    last: '10000/1',
  });
  await context.exposeFunction('nativeInvoke', async (command, args) => {
    if (command === 'desktop_server') return null;
    if (command === 'desktop_open') return header();
    if (command === 'desktop_accept_open') return;
    if (command === 'desktop_document') {
      assert.equal(args.generation, generation);
      reads++;
      return document;
    }
    if (command === 'desktop_query') {
      assert.equal(args.generation, generation);
      const q = args.query;
      if (q.kind === 'duration') {
        durationReads++;
        return { duration: document.durations.find((d) => d.id === q.id) ?? null };
      }
      if (q.kind === 'events') {
        details.push(q);
        return { events: index.eventsBetween(q.lower, q.upper, 100), next: null };
      }
      overviews.push(q);
      const view = new Viewport(Q.parse(q.lower), Q.parse(q.upper).sub(Q.parse(q.lower)));
      const frame = index.frame(
        view,
        1000,
        Q.parse(q.threshold).div(view.span).toApproximateNumber() * 1000,
      );
      assert(frame.groups.length <= 1025);
      return frame;
    }
    if (command === 'desktop_save') {
      assert.equal(args.generation, generation);
      assert.equal(args.document, null);
      assert.deepEqual(args.patch.settings.events, []);
      saves.push(args.patch);
      const events = new Map(document.events.map((e) => [e.id, e]));
      for (const change of args.patch.changes) {
        if (change.event) events.set(change.id, change.event);
        else events.delete(change.id);
      }
      const durations = new Map(document.durations.map((d) => [d.id, d]));
      for (const change of args.patch.durationChanges ?? []) {
        if (change.duration) durations.set(change.id, change.duration);
        else durations.delete(change.id);
      }
      document = {
        ...args.patch.settings,
        events: [...events.values()],
        durations: [...durations.values()],
      };
      index = new TimelineIndex(document);
      generation++;
      return header();
    }
    throw new Error('Unexpected desktop cache command ' + command);
  });
  await context.addInitScript(() => {
    window.__TAURI__ = { core: { invoke: (command, args) => window.nativeInvoke(command, args) } };
  });
  await context.route('http://localhost:5173/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    assert(!path.startsWith('/api/'), 'Local SQLite browsing must not make HTTP requests');
    const name = path === '/' ? 'index.html' : path.slice(1);
    await route.fulfill({
      body: await readFile(resolve('dist', name)),
      contentType: name.endsWith('.html')
        ? 'text/html'
        : name.endsWith('.css')
          ? 'text/css'
          : 'text/javascript',
    });
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  const bounds = async (left, right) => {
    await page.locator('#left-bound').fill(left);
    await page.locator('#right-bound').fill(right);
    await page.locator('#apply-bounds').click();
    await page.waitForFunction(() => document.getElementById('loading-window').hidden);
  };
  try {
    await page.goto('http://localhost:5173');
    // Without a server connection, the desktop cannot sign in and file actions use plain names.
    assert(await page.locator('#account-button').isDisabled());
    assert.deepEqual(
      await page.locator('#sqlite-open, #sqlite-save, #sqlite-save-as').allTextContents(),
      ['Open', 'Save', 'Save As…'],
    );
    await page.locator('#sqlite-open').click();
    await page.waitForFunction(
      () =>
        document.getElementById('timeline-title').value === 'Cached SQLite timeline' &&
        document.getElementById('loading-window').hidden &&
        document.querySelector('.event-marker.group'),
    );
    assert.equal(reads, 0);
    assert.equal(details.length, 0);
    assert(overviews.length > 0);
    await bounds('0', '20');
    await page.getByRole('button', { name: 'Nearby moment', exact: true }).waitFor();
    const fetched = overviews.length;
    await bounds('1', '21');
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    assert.equal(overviews.length, fetched);
    await page.getByRole('button', { name: 'Nearby moment', exact: true }).click();
    await page.locator('#event-description').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#event-description').inputValue(), 'SQLite inspector notes');
    assert.equal(details.length, 1);
    await page.locator('#event-title').fill('Edited SQLite moment');
    await page.getByRole('button', { name: 'Edited SQLite moment', exact: true }).waitFor();
    await closeMomentDetails(page);
    await bounds('9000', '11000');
    await page.getByRole('button', { name: 'Far away', exact: true }).waitFor();
    assert.equal(
      await page.getByRole('button', { name: 'Edited SQLite moment', exact: true }).count(),
      0,
    );
    await bounds('0', '20');
    await page.getByRole('button', { name: 'Edited SQLite moment', exact: true }).waitFor();
    assert.equal(reads, 0);
    // Durations open by ID without loading the file, and save as sparse duration changes.
    const band = page.locator('.duration-band');
    await band.filter({ hasText: 'Cached period' }).click({ force: true });
    await page.locator('#duration-dialog').waitFor({ state: 'visible' });
    assert.equal(durationReads, 1);
    assert.equal(await page.locator('#duration-title').inputValue(), 'Cached period');
    await page.locator('#duration-title').fill('Edited period');
    await band.filter({ hasText: 'Edited period' }).waitFor();
    await page.getByRole('button', { name: 'Close duration details' }).click();
    await page.locator('#duration-dialog').waitFor({ state: 'hidden' });
    await page.locator('#sqlite-save').click();
    await page.waitForFunction(
      () => document.getElementById('save-status').textContent === 'Saved to file',
    );
    assert.equal(saves.length, 1);
    assert.equal(saves[0].changes.length, 1);
    assert.deepEqual(saves[0].durationChanges, [
      {
        id: 'period',
        duration: {
          id: 'period',
          start: '12/1',
          end: { moment: 'near' },
          metadata: {
            title: 'Edited period',
            description: '',
            notes: { detail: 'not in viewport payloads' },
          },
        },
      },
    ]);
    assert.equal(reads, 0);
    assert.equal(document.events.length, 10002);
    assert(document.events.some((e) => e.id === 'far'));
    const download = page.waitForEvent('download');
    await page.locator('#export-button').click();
    const exported = JSON.parse(await readFile(await (await download).path(), 'utf8'));
    assert.equal(reads, 1);
    assert.equal(exported.events.length, 10002);
    assert(
      exported.events.some((e) => e.id === 'near' && e.metadata.title === 'Edited SQLite moment'),
    );
    assert.equal(exported.durations[0].metadata.title, 'Edited period');
    assert.deepEqual(exported.durations[0].end, { moment: 'near' });
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
}
