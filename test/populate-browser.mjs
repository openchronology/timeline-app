// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The desktop's file populator (#433), with the native side stood in for: its choices, what it
// asks Rust for, the timeline it opens, and a moment's file opened in its own app.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Q, Viewport, TimelineIndex } from '../dist/core.mjs';

/**
 * The populator: its choices follow the kind of file (only media is dated by its metadata, read
 * in a zone, or placed); it sends Rust the choices and a template, never a path; the timeline it
 * makes opens unsaved with a summary; Rust is asked for thumbnails and to open a moment's file in
 * its app, or show it in its folder, for the timeline on screen (Rust, not the page, asks the
 * user whether to trust a timeline).
 */
// A one-pixel picture, as the desktop's thumbnails come: a data: URL.
const THUMBNAIL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
export async function checkPopulate(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const photo = 'file:///home/someone/Pictures/Trip%202024/IMG_0042.JPG';
  const video = 'file:///home/someone/Pictures/Trip%202024/clip.mp4';
  let document = null,
    index = null;
  const calls = [];
  const header = () => ({
    document: { ...document, events: [] },
    generation: 1,
    path: '/tmp/populated.och',
    event_count: String(document.events.length),
    first: document.events[0].time,
    last: document.events.at(-1).time,
  });
  await context.exposeFunction('nativeInvoke', async (command, args) => {
    calls.push([command, args]);
    if (command === 'desktop_servers') return [];
    if (command === 'desktop_populate_pick') return ['/home/someone/Pictures/Trip 2024'];
    if (command === 'desktop_populate') {
      document = {
        ...args.template,
        events: [
          {
            id: 'file-1',
            time: '1714972089/1',
            metadata: { title: 'IMG_0042.JPG', sources: [photo], tags: ['file:photo'] },
          },
          {
            id: 'file-2',
            time: '1714979289/1',
            metadata: {
              title: 'clip.mp4',
              sources: [video],
              tags: ['file:video'],
            },
          },
        ],
      };
      index = new TimelineIndex(document);
      return {
        ...header(),
        report: {
          added: 2,
          skipped: { 'no recorded date': { count: 1, examples: ['/x/notes.jpg'] } },
          truncated: false,
        },
      };
    }
    if (command === 'desktop_accept_open') return 1;
    // Not a release build: it never asks for a newer one (#601).
    if (command === 'desktop_latest_release') return { current: null };
    // A populated timeline is the user's own: trusted, as Rust keeps it.
    if (command === 'desktop_trust') return { trusted: true, images: true };
    if (command === 'desktop_document') return document;
    if (command === 'desktop_query') {
      const q = args.query;
      if (q.kind === 'tags') return { tags: [] };
      if (q.kind === 'related') return { related: [], next: null, reachable: 0, direct: 0 };
      if (q.kind === 'moment')
        return { moment: document.events.find((e) => e.id === q.id) ?? null };
      if (q.kind === 'events')
        return { events: index.eventsBetween(q.lower, q.upper, 100), next: null };
      const view = new Viewport(Q.parse(q.lower), Q.parse(q.upper).sub(Q.parse(q.lower)));
      const frame = index.frame(
        view,
        1000,
        Q.parse(q.threshold).div(view.span).toApproximateNumber() * 1000,
      );
      // A lone moment's metadata, as native-store sends it.
      for (const group of frame.groups)
        if (group.id) group.metadata = document.events.find((e) => e.id === group.id)?.metadata;
      return frame;
    }
    // A thumbnail (#440, #442) for each photo asked for; this video has none to give.
    if (command === 'desktop_thumbnails')
      return args.urls.map((url) => (/\.jpg$/i.test(url) ? THUMBNAIL : null));
    if (['desktop_open_file', 'desktop_reveal_file'].includes(command))
      return { trusted: true, images: true };
    if (command === 'desktop_populate_clear') return null;
    throw new Error('Unexpected desktop command ' + command);
  });
  await context.addInitScript(() => {
    // A channel's messages are sent here at once, as Rust would while it works.
    class Channel {
      onmessage() {}
    }
    window.__TAURI__ = {
      core: {
        Channel,
        invoke: (command, args) => {
          if (args?.progress instanceof Channel) {
            args.progress.onmessage({ scanned: 512, added: 2 });
            args = { ...args, progress: 'channel' };
          }
          return window.nativeInvoke(command, args);
        },
      },
    };
  });
  await context.route('http://localhost:5173/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    assert(!path.startsWith('/api/'), 'The populator makes no HTTP requests');
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
  const errors = [],
    confirms = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => {
    confirms.push(d.message());
    void d.accept();
  });
  try {
    await page.goto('http://localhost:5173');
    await page.locator('#populate-button').click();
    const dialog = page.locator('#populate-dialog');
    await dialog.waitFor();
    const shown = (selector) => dialog.locator(selector).isVisible();
    // Media: dated by its metadata, read in a zone, and optionally placed.
    assert(await shown('input[name="populate-date"][value="metadata"]'));
    assert(await shown('#populate-zone'));
    assert(await shown('#populate-location'));
    assert.equal(
      await dialog.locator('#populate-location').isChecked(),
      false,
      'no GPS unless asked',
    );
    // Any file: only the file system's dates, and the metadata choice gives way to modified.
    await dialog.locator('input[name="populate-type"][value="anyFile"]').check();
    assert(!(await shown('input[name="populate-date"][value="metadata"]')));
    assert(!(await shown('#populate-zone')) && !(await shown('#populate-location')));
    assert(await dialog.locator('input[name="populate-date"][value="modified"]').isChecked());
    await dialog.locator('input[name="populate-type"][value="mediaFile"]').check();
    await dialog.locator('input[name="populate-date"][value="metadata"]').check();
    assert(await shown('#populate-zone'));
    await dialog.locator('input[name="populate-date"][value="created"]').check();
    assert(!(await shown('#populate-zone')), 'a zone only for recorded times');
    await dialog.locator('input[name="populate-date"][value="metadata"]').check();
    // A folder picked natively: listed, and naming the timeline.
    await dialog.locator('#populate-folders').click();
    await page.waitForFunction(() =>
      document.getElementById('populate-roots').textContent.includes('Trip 2024'),
    );
    assert.equal(await dialog.locator('#populate-title').inputValue(), 'Trip 2024');
    await dialog.locator('#populate-location').check();
    await dialog.locator('#populate-start').click();
    await page.waitForFunction(
      () =>
        !document.getElementById('populate-dialog').open &&
        document.getElementById('timeline-title').value === 'Trip 2024',
    );
    const [, asked] = calls.find(([command]) => command === 'desktop_populate');
    assert.deepEqual(asked.settings, {
      fileType: { type: 'mediaFile', date: 'metadata' },
      recursive: true,
      zone: 'local',
      location: true,
    });
    assert.equal(asked.template.presentation.mode, 'gregorian');
    assert.deepEqual(
      asked.template.plugins.map((p) => p.manifest.id),
      ['moment-sources', 'file-thumbnails'],
    );
    assert(!JSON.stringify(asked).includes('/home/someone'), 'the page names no path');
    assert.match(
      await page.locator('#toast').textContent(),
      /Made 2 moments from files\. Left out: 1 had no recorded date\./,
    );

    // The photo's marker shows its thumbnail (#440); the video is asked for too (#442), and
    // without one keeps its marker.
    await page.locator('#fit-button').click();
    await page.waitForFunction(
      (src) =>
        [...document.querySelectorAll('.event-marker.icon img')].some((img) => img.src === src),
      THUMBNAIL,
    );
    const asks = calls.filter(([command]) => command === 'desktop_thumbnails');
    assert.deepEqual(
      [...new Set(asks.flatMap(([, args]) => args.urls))].sort(),
      [photo, video].sort(),
      'the photo and the video are asked for',
    );
    // For the timeline file on screen, by its generation: Rust decides what it may picture.
    assert(asks.every(([, args]) => args.generation === 1));
    assert.equal(await page.locator('.event-marker.icon').count(), 1);

    // A moment's file: its name as a link, opened in its app by Rust, which asks the user first
    // in its own dialog unless the timeline is trusted; the page asks nothing itself.
    await page.locator('#fit-button').click();
    await page.locator('.event-marker').first().click();
    const link = page.locator('#inspector .plugin-source-links a.local-file-link').first();
    await link.waitFor();
    assert.equal(await link.textContent(), 'IMG_0042.JPG');
    assert.equal(await link.getAttribute('title'), '/home/someone/Pictures/Trip 2024/IMG_0042.JPG');
    await link.click();
    await link.click();
    const opened = () => calls.filter(([command]) => command === 'desktop_open_file');
    await page.waitForFunction(() => true);
    for (let i = 0; i < 50 && opened().length < 2; i++) await page.waitForTimeout(50);
    assert.deepEqual(
      opened().map(([, args]) => args),
      [
        { url: photo, generation: 1 },
        { url: photo, generation: 1 },
      ],
    );
    assert.deepEqual(confirms, [], 'the page asks nothing');
    await page.locator('#inspector .local-file-reveal').first().click();
    for (let i = 0; i < 50 && !calls.some(([c]) => c === 'desktop_reveal_file'); i++)
      await page.waitForTimeout(50);
    assert.deepEqual(calls.find(([c]) => c === 'desktop_reveal_file')[1], {
      url: photo,
      generation: 1,
    });
    assert.deepEqual(errors, []);
    console.log(
      'PASS file populator: choices follow the kind of file, Rust is asked without a path, the new timeline opens with a summary, a photo shows its thumbnail, and a file opens in its app or folder.',
    );
  } finally {
    await context.close();
  }
}
