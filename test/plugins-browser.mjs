// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  EXPAND_ON_HOVER,
  MOMENT_SOURCES,
  RICH_TEXT_NOTES,
  MOMENT_ICONS,
  MOMENT_STACKS,
  MOMENT_COLORS,
  FOCUS_ON_HOVER,
  MOMENT_SHAPES,
  PLUGIN_EXAMPLE,
  validatePluginManifest,
  validateDocument,
} from '../dist/core.mjs';
import { createPluginLibrary } from '../server/plugins.mjs';
const source = 'https://images.example/icon.png';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGMIWJDwHwAE5AJQGRSfFgAAAABJRU5ErkJggg==',
  'base64',
);
export async function checkPlugins(page, restoreDocument, offline = false) {
  const input = (id) => page.locator('#' + id);
  const frame = () => page.evaluate(() => new Promise(requestAnimationFrame));
  const imported = async (doc) => {
    await input('json-file').setInputFiles({
      name: 'plugins.ochx',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(doc)),
    });
    await page.waitForFunction(
      (title) => document.getElementById('timeline-title').value === title,
      doc.title,
    );
    await frame();
  };
  const exported = async () => {
    const downloading = page.waitForEvent('download');
    await input('export-button').click();
    return validateDocument(JSON.parse(await readFile(await (await downloading).path(), 'utf8')));
  };
  const document = {
    format: 'openchronology',
    version: 1,
    title: 'Plugin UI',
    description: '',
    events: [
      { id: 'icon', time: '0/1', metadata: { title: 'With icon', iconUrl: source } },
      { id: 'plain', time: '100/1', metadata: { title: 'Plain' } },
    ],
  };
  // Small coincident summaries expose individually styled, clickable hover members.
  for (const count of [2, 3, 4, 5, 6]) {
    await imported({
      ...document,
      title: 'Radial summary ' + count,
      plugins: [EXPAND_ON_HOVER, FOCUS_ON_HOVER, MOMENT_COLORS, MOMENT_SHAPES].map((manifest) => ({
        manifest,
        enabled: true,
      })),
      events: Array.from({ length: count }, (_, i) => ({
        id: 'fan-' + i,
        time: '10/1',
        metadata: {
          title: 'Fan member ' + i,
          description: 'Individual notes ' + i,
          color: '#7191ad',
          shape: 'diamond',
        },
      })),
    });
    const root = page.locator('#markers .event-marker.group');
    if (count === 2)
      await page.evaluate(() => {
        const observer = new MutationObserver(() => {
          const fan = document.querySelector('.summary-fan[data-expanding]');
          if (!fan) return;
          observer.disconnect();
          for (const node of fan.querySelectorAll('.summary-member'))
            for (const animation of node.getAnimations()) animation.pause();
          fan.dataset.testPaused = 'true';
        });
        observer.observe(document.getElementById('timeline-stage'), { childList: true });
      });
    await root.hover();
    if (count > 5) {
      await page.waitForTimeout(350);
      assert.equal(await page.locator('.summary-member').count(), 0);
      await page.mouse.move(2, 2);
      continue;
    }
    await page.waitForFunction(
      (count) => document.querySelectorAll('.summary-member').length === count,
      count,
    );
    const member = page.locator('.summary-member').last();
    if (count === 2) {
      await page.locator('.summary-fan[data-test-paused]').waitFor();
      await member.focus();
      await member.dispatchEvent('pointerenter', { pointerType: 'mouse' });
      assert.equal(await page.locator('#moment-hover-preview.open').count(), 0);
      await page.evaluate(() => {
        for (const node of document.querySelectorAll('.summary-member'))
          for (const animation of node.getAnimations()) animation.play();
      });
      // A focus/hover retained through the animation opens the preview without another enter.
      await page.locator('#moment-hover-preview.open').waitFor({ state: 'visible' });
      assert.equal(await page.locator('.summary-fan[data-expanding]').count(), 0);
    }
    if (count !== 2) await member.hover();
    await page.locator('#moment-hover-preview.open').waitFor({ state: 'visible' });
    assert.match(
      await page.locator('#moment-hover-preview').textContent(),
      new RegExp('Individual notes ' + (count - 1)),
    );
    // The hover card overlays the marker; its normal click dispatch selects that exact member.
    await page.locator('#moment-hover-preview').click();
    assert.equal(await input('event-title').inputValue(), 'Fan member ' + (count - 1));
    assert.equal(await input('event-time').isDisabled(), false);
    await page.mouse.move(2, 2);
    await page.waitForFunction(() => document.querySelectorAll('.summary-member').length === 0);
    if (count === 2) {
      await root.hover();
      await page.locator('.summary-fan:not([data-expanding])').waitFor();
      await page.locator('.summary-fan-hit').click();
    } else await root.click();
    await page.locator('#group-details').waitFor({ state: 'visible' });
    await page.waitForFunction(
      () => document.getElementById('time-cursor').dataset.time === '10/1',
    );
    assert(await input('time-cursor').isVisible());
    assert.equal(await page.locator('#moment-hover-preview.open').count(), 0);
    assert.equal((await exported()).events.length, count);
  }
  // Sources use the seed metadata schema, render safely and survive edits/export.
  await imported({
    ...document,
    title: 'Sources UI',
    plugins: [{ manifest: MOMENT_SOURCES, enabled: true }],
    events: [
      {
        id: 'references',
        time: '0/1',
        metadata: { title: 'Referenced moment', sources: ['https://example.org/history'] },
      },
    ],
  });
  await page.getByRole('button', { name: 'Referenced moment', exact: true }).click();
  const sourcesInput = input('plugin-event-fields').getByLabel('Sources', { exact: true });
  assert.equal(await sourcesInput.inputValue(), 'https://example.org/history');
  const reference = input('plugin-event-fields').locator('.plugin-source-links a');
  assert.equal(await reference.getAttribute('rel'), 'noopener noreferrer');
  await sourcesInput.fill('https://example.org/history\nhttps://example.org/research');
  await page.waitForFunction(() =>
    document.getElementById('event-edit-status').textContent.startsWith('Applied to timeline'),
  );
  assert.deepEqual((await exported()).events[0].metadata.sources, [
    'https://example.org/history',
    'https://example.org/research',
  ]);
  await sourcesInput.fill('javascript:alert(1)');
  assert.equal(await sourcesInput.evaluate((input) => input.validity.valid), false);
  assert.equal(await reference.count(), 2);
  // The same host editor/viewer runs inside the standalone no-network HTML.
  const richTitle = 'A complete title that must wrap across several lines without losing any words';
  await imported({
    ...document,
    title: 'Rich notes UI',
    plugins: [RICH_TEXT_NOTES, FOCUS_ON_HOVER, MOMENT_STACKS, MOMENT_SOURCES].map((manifest) => ({
      manifest,
      enabled: true,
    })),
    events: [
      {
        id: 'rich',
        time: '0/1',
        metadata: {
          title: richTitle,
          description:
            '**Bold notes** and *emphasis*\n\n- A list item\n\n<script>window.richAttack = true</script>\n\n[unsafe](javascript:alert(1))',
          sources: ['https://example.org/history'],
          stack: [
            { id: 'rich-child', metadata: { title: 'Rich child', description: '**Child bold**' } },
          ],
        },
      },
    ],
  });
  const richMarker = page.locator('#markers .event-marker').first();
  await richMarker.hover();
  const richPreview = input('moment-hover-preview');
  await page.waitForFunction(() =>
    document.getElementById('moment-hover-preview').classList.contains('open'),
  );
  assert.equal(await richPreview.locator(':scope > strong').textContent(), richTitle);
  assert.equal(
    await richPreview.locator(':scope > strong').evaluate((el) => getComputedStyle(el).whiteSpace),
    'normal',
  );
  assert.equal(await richPreview.locator('.focus-notes strong').textContent(), 'Bold notes');
  assert.equal(await richPreview.locator('script').count(), 0);
  assert.equal(await richPreview.locator('a[href^="javascript:"]').count(), 0);
  assert.equal(
    await richPreview.locator('.focus-sources a').getAttribute('href'),
    'https://example.org/history',
  );
  assert(
    await richPreview.evaluate(
      (el) =>
        !!(
          el
            .querySelector('.focus-notes')
            .compareDocumentPosition(el.querySelector('.focus-sources')) &
          Node.DOCUMENT_POSITION_FOLLOWING
        ),
    ),
  );
  await page.mouse.move(1, 1);
  await richMarker.click();
  const rootEditor = input('event-form').locator('.rich-text-content').first();
  assert.equal(await rootEditor.locator('strong').textContent(), 'Bold notes');
  assert(await input('event-description').isHidden());
  await rootEditor.fill('Replacement notes');
  await page.waitForFunction(() =>
    document.getElementById('event-edit-status').textContent.startsWith('Applied to timeline'),
  );
  let richSaved = await exported();
  assert.equal(richSaved.events[0].metadata.description, 'Replacement notes');
  await rootEditor.focus();
  await page.keyboard.press('ControlOrMeta+A');
  await input('event-form').getByRole('button', { name: 'Bold', exact: true }).first().click();
  richSaved = await exported();
  assert.equal(richSaved.events[0].metadata.description, '**Replacement notes**');

  assert(richSaved.plugins.some((p) => p.manifest.notes?.kind === 'markdown'));
  const childEditor = page.locator('.stack-card .rich-text-content');
  assert.equal(await childEditor.locator('strong').textContent(), 'Child bold');
  await childEditor.fill('Changed child notes');
  await page.waitForFunction(() =>
    document.getElementById('event-edit-status').textContent.startsWith('Applied to timeline'),
  );
  richSaved = await exported();
  assert.equal(richSaved.events[0].metadata.stack[0].metadata.description, 'Changed child notes');
  const rawToggle = input('event-form')
    .getByRole('button', { name: 'Edit Markdown', exact: true })
    .first();
  await rawToggle.click();
  await input('event-description').fill('## New heading\n\n**Kept Markdown**');
  await input('event-form')
    .getByRole('button', { name: 'Visual editor', exact: true })
    .first()
    .click();
  assert.equal(await rootEditor.locator('h2').textContent(), 'New heading');
  richSaved = await exported();
  assert.equal(richSaved.events[0].metadata.description, '## New heading\n\n**Kept Markdown**');
  if (offline) {
    const plugins = [
      MOMENT_ICONS,
      MOMENT_STACKS,
      MOMENT_COLORS,
      MOMENT_SHAPES,
      FOCUS_ON_HOVER,
      validatePluginManifest(PLUGIN_EXAMPLE),
    ].map((manifest) => ({ manifest, enabled: true }));
    const savedDocument = {
      ...document,
      plugins,
      assets: { [source]: 'data:image/png;base64,' + png.toString('base64') },
      tags: ['offline', 'modded'],
    };
    savedDocument.events[0].metadata.status = 'blocked';
    savedDocument.events[0].metadata.stack = [
      { id: 'child', metadata: { title: 'Child', status: 'ready' } },
    ];
    await imported(savedDocument);
    await input('plugins-button').click();
    assert.match(await input('plugins-note').textContent(), /run locally/);
    assert(await input('plugins-add').isVisible());
    assert(await input('plugins-create').isVisible());
    assert(await page.getByRole('checkbox', { name: 'Enable Moment icons' }).isEnabled());
    await page.getByRole('button', { name: 'Close plugins', exact: true }).click();
    await page.waitForFunction(() =>
      document.querySelector('.event-marker img')?.getAttribute('src')?.startsWith('data:'),
    );
    const root = page.locator('#markers [data-first="0/1"]');
    assert.equal(await root.getAttribute('data-shape'), 'diamond');
    assert.equal(await page.locator('.stack-marker').count(), 1);
    await page.getByRole('button', { name: 'With icon', exact: true }).click();
    assert(
      await input('plugin-event-fields').getByLabel('Status', { exact: true }).first().isVisible(),
    );
    const saved = await exported();
    assert.deepEqual(saved.plugins, plugins);
    assert.deepEqual(saved.assets, savedDocument.assets);
    assert.deepEqual(saved.tags, ['offline', 'modded']);
    await imported(restoreDocument);
    return;
  }
  const library = createPluginLibrary([
    MOMENT_ICONS,
    ...Array.from({ length: 14 }, (_, i) => ({
      ...MOMENT_ICONS,
      id: 'sample-' + i,
      name: 'Sample ' + String(i).padStart(2, '0'),
      description: 'Sample metadata component',
      fields: [],
      marker: undefined,
    })),
  ]);
  const catalogue = '**/api/plugins/search',
    images = 'https://images.example/**';
  const cloudId = '00000000-0000-0000-0000-000000000099';
  const cloudMetadata = '**/api/timelines/' + cloudId;
  await page.route(cloudMetadata + '/revision', (route) =>
    route.fulfill({ json: { id: cloudId, revision: '1' } }),
  );
  const cloudDocument = cloudMetadata + '/document';
  const cloud = {
    ...document,
    title: 'Cloud plugin UI',
    plugins: [{ manifest: MOMENT_ICONS, enabled: true }],
  };
  const info = {
    id: cloudId,
    title: cloud.title,
    description: '',
    plugins: cloud.plugins,
    revision: '1',
    visibility: 'public',
    canEdit: true,
    canShare: true,
    owner: 'Owner',
    event_count: '2',
    first: '0/1',
    last: '100/1',
  };
  await page.route(cloudMetadata, (route) => route.fulfill({ json: info }));
  await page.route(cloudDocument, (route) =>
    route.fulfill({ json: { timeline: info, document: cloud } }),
  );
  await page.route(catalogue, (route) =>
    route.fulfill({ json: library.search(route.request().postDataJSON()) }),
  );
  await page.route(images, (route) =>
    route.fulfill({
      body: png,
      contentType: 'image/png',
      headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=600' },
    }),
  );
  try {
    await imported(document);
    assert.equal(await page.locator('.event-marker img').count(), 0);
    await page.getByRole('button', { name: 'With icon', exact: true }).click();
    await input('event-title').fill('Unsaved title survives install');
    await input('plugins-button').click();
    await input('plugins-add').click();
    await page.waitForFunction(() =>
      document.getElementById('plugin-library-status').textContent.includes('15 available'),
    );
    assert.equal(await input('plugin-sort').inputValue(), 'popularity');
    await input('plugin-sort').selectOption('alphabetical');
    await page.waitForFunction(() => document.querySelectorAll('.library-plugin').length === 12);
    assert(
      await page
        .locator('#plugin-library-dialog')
        .evaluate((node) => node.scrollWidth <= node.clientWidth),
    );
    assert.equal(await page.locator('.library-plugin').count(), 12);
    await input('plugin-next').click();
    await page.waitForFunction(() =>
      document.getElementById('plugin-library-status').textContent.includes('Page 2'),
    );
    assert.equal(await page.locator('.library-plugin').count(), 3);
    await input('plugin-search').fill('icons');
    await page.waitForFunction(() =>
      document.getElementById('plugin-library-status').textContent.includes('1 available'),
    );
    await page
      .locator('.library-plugin')
      .getByRole('button', { name: 'Add to timeline', exact: true })
      .click();
    assert(await input('plugin-library-dialog').isHidden());
    assert.equal(await input('event-title').inputValue(), 'Unsaved title survives install');
    await page.getByRole('button', { name: 'Close plugins', exact: true }).click();
    await page.waitForFunction(
      () => document.querySelector('.event-marker.icon img')?.naturalWidth > 0,
    );
    await page.waitForFunction(() =>
      document.getElementById('event-edit-status').textContent.startsWith('Applied to timeline'),
    );
    const marker = page.getByRole('button', {
      name: 'Unsaved title survives install',
      exact: true,
    });
    assert.equal(await marker.locator('img').getAttribute('crossorigin'), 'anonymous');
    assert.equal(await marker.locator('img').getAttribute('referrerpolicy'), 'no-referrer');
    await marker.hover();
    await page.waitForFunction(
      () => document.querySelector('.event-marker.icon').getBoundingClientRect().width > 50,
    );
    await marker.click();
    await page.waitForFunction(
      () => document.querySelector('.plugin-image-link img')?.naturalWidth > 0,
    );
    assert.equal(await page.locator('.plugin-image-link').getAttribute('href'), source);
    assert.equal(await page.locator('.plugin-image-link').getAttribute('target'), '_blank');
    assert.match(await page.locator('.plugin-image-link').getAttribute('rel'), /noopener/);
    const url = page.locator('[data-plugin-key="iconUrl"]');
    assert.equal(await url.inputValue(), source);
    await url.fill('https://images.example/changed.png');
    await input('event-title').fill('Icon updated');
    await page.waitForFunction(() =>
      document.getElementById('event-edit-status').textContent.startsWith('Applied to timeline'),
    );
    await page.waitForFunction(
      () =>
        document.querySelector('.event-marker img')?.getAttribute('src') ===
        'https://images.example/changed.png',
    );
    let saved = await exported();
    assert.equal(saved.events[0].metadata.iconUrl, 'https://images.example/changed.png');
    assert.deepEqual(saved.plugins, [{ manifest: MOMENT_ICONS, enabled: true }]);
    await input('plugins-button').click();
    await page.getByRole('checkbox', { name: 'Enable Moment icons' }).uncheck();
    await page.getByRole('button', { name: 'Close plugins', exact: true }).click();
    assert.equal(await page.locator('.event-marker img').count(), 0);
    assert.equal(await page.locator('[data-plugin-key="iconUrl"]').count(), 0);
    assert.equal(
      (await exported()).events[0].metadata.iconUrl,
      'https://images.example/changed.png',
    );
    await input('plugins-button').click();
    await page.getByRole('checkbox', { name: 'Enable Moment icons' }).check();
    await page.getByRole('button', { name: 'Close plugins', exact: true }).click();
    await page.waitForFunction(
      () => document.querySelector('.event-marker.icon img')?.naturalWidth > 0,
    );
    await page.locator('[data-plugin-key="iconUrl"]').fill('javascript:alert(1)');
    assert(
      !(await page.locator('[data-plugin-key="iconUrl"]').evaluate((node) => node.checkValidity())),
    );
    assert.equal(await page.locator('.plugin-image-link').getAttribute('href'), null);
    await input('close-inspector').click();
    await input('plugins-button').click();
    await page.getByRole('button', { name: 'Remove', exact: true }).click();
    await page.getByRole('button', { name: 'Close plugins', exact: true }).click();
    saved = await exported();
    assert(!Object.hasOwn(saved, 'plugins'));
    assert.equal(saved.events[0].metadata.iconUrl, 'https://images.example/changed.png');
    await imported({
      ...document,
      title: 'Plugin reimport',
      plugins: [{ manifest: MOMENT_ICONS, enabled: true }],
    });
    await page.waitForFunction(
      () => document.querySelector('.event-marker.icon img')?.naturalWidth > 0,
    );
    assert.deepEqual((await exported()).plugins, [{ manifest: MOMENT_ICONS, enabled: true }]);
    const alternate = {
      ...MOMENT_ICONS,
      id: 'alternate-icons',
      name: 'Alternate icons',
      fields: [{ kind: 'image-url', metadataKey: 'iconUrl', label: 'Alternate icon URL' }],
      marker: { kind: 'image', metadataKey: 'alternateIcon' },
    };
    await imported({
      ...document,
      title: 'Ordered plugin UI',
      plugins: [
        { manifest: MOMENT_ICONS, enabled: true },
        { manifest: alternate, enabled: true },
      ],
      events: [
        {
          ...document.events[0],
          metadata: {
            ...document.events[0].metadata,
            alternateIcon: 'https://images.example/alternate.png',
          },
        },
      ],
    });
    await page.getByRole('button', { name: 'With icon', exact: true }).click();
    assert.equal(await page.getByLabel('Alternate icon URL', { exact: true }).count(), 1);
    await input('plugins-button').click();
    await page
      .locator('.installed-plugin')
      .filter({ hasText: 'Alternate icons' })
      .getByRole('button', { name: 'Move up', exact: true })
      .click();
    await page.getByRole('button', { name: 'Close plugins', exact: true }).click();
    await page.waitForFunction(
      () =>
        document.querySelector('.event-marker img')?.getAttribute('src') ===
        'https://images.example/icon.png',
    );
    assert.equal(await page.getByLabel('Moment icon URL', { exact: true }).count(), 1);
    assert.deepEqual(
      (await exported()).plugins.map((p) => p.manifest.id),
      ['alternate-icons', 'moment-icons'],
    );
    // Removing the last plugin on an editable cloud timeline must not revive its original server snapshot.
    await page.evaluate((id) => {
      location.hash = 'timeline/' + id;
    }, cloudId);
    await page.waitForFunction(
      () => document.getElementById('timeline-title').value === 'Cloud plugin UI',
    );
    await page.waitForFunction(
      () => document.querySelector('.event-marker.icon img')?.naturalWidth > 0,
    );
    await input('plugins-button').click();
    await page.getByRole('button', { name: 'Remove', exact: true }).click();
    assert.match(await input('installed-plugins').textContent(), /No plugins installed/);
    await page.getByRole('button', { name: 'Close plugins', exact: true }).click();
    await frame();
    assert.equal(await page.locator('.event-marker img').count(), 0);
    assert(!Object.hasOwn(await exported(), 'plugins'));
    await imported({
      ...document,
      title: 'Stack plugin UI',
      plugins: [
        { manifest: MOMENT_ICONS, enabled: true },
        { manifest: MOMENT_STACKS, enabled: true },
      ],
    });
    await page.getByRole('button', { name: 'With icon', exact: true }).click();
    const rootIcon = input('plugin-event-fields').locator(':scope > [data-metadata-key="iconUrl"]');
    const inputBox = await rootIcon.locator('input').boundingBox();
    const hintBox = await rootIcon.locator('.field-hint').boundingBox();
    assert(hintBox.y >= inputBox.y + inputBox.height, 'Icon help must be below its input');
    const add = page.getByRole('button', { name: 'Add entry to stack', exact: true });
    await add.click();
    await add.click();
    const cards = page.locator('.stack-card');
    assert.equal(await cards.count(), 2);
    assert.equal(await add.count(), 1, 'Child cards must not have nested stack editors');
    await cards.nth(0).getByLabel('Title', { exact: true }).fill('First child');
    await cards.nth(0).getByLabel('Notes', { exact: true }).fill('Child notes');
    await cards.nth(0).getByLabel('Moment icon URL', { exact: true }).fill(source);
    await cards.nth(1).getByLabel('Title', { exact: true }).fill('Second child');
    await cards.nth(1).getByRole('button', { name: 'Move stack entry up', exact: true }).click();
    assert.equal(
      await cards.nth(0).getByLabel('Title', { exact: true }).inputValue(),
      'Second child',
    );
    await cards.nth(0).getByRole('button', { name: 'Delete', exact: true }).click();
    await input('delete-cancel').click();
    assert.equal(await cards.count(), 2);
    await cards.nth(0).getByRole('button', { name: 'Delete', exact: true }).click();
    await input('delete-confirm').click();
    assert.equal(await cards.count(), 1);
    await page.waitForFunction(() =>
      document.getElementById('event-edit-status').textContent.startsWith('Applied to timeline'),
    );
    const stacked = await exported();
    assert.equal(stacked.events.length, document.events.length);
    assert.deepEqual(stacked.events.find((e) => e.id === 'icon').metadata.stack[0].metadata, {
      title: 'First child',
      description: 'Child notes',
      iconUrl: source,
    });
    await imported({ ...stacked, title: 'Stack reimport' });
    await frame();
    const childDot = page.locator('.stack-marker').first();
    const parentDot = page.locator('#markers [data-first="0/1"]');
    const childBox = await childDot.boundingBox();
    const parentBox = await parentDot.boundingBox();
    assert(childBox.y < parentBox.y, 'Stack entry branches above its parent caption');
    assert(Math.abs(childBox.x - parentBox.x) < 1, 'Stack entry inherits parent horizontal time');
    await childDot.click();
    assert.equal(
      await cards.nth(0).getByLabel('Title', { exact: true }).inputValue(),
      'First child',
    );
    await page.getByRole('button', { name: 'With icon', exact: true }).click();
    assert.equal(await cards.count(), 1);
    assert.equal(
      await cards.nth(0).getByLabel('Moment icon URL', { exact: true }).inputValue(),
      source,
    );
    await parentDot.click({ button: 'right' });
    await input('timeline-menu')
      .getByRole('menuitem', { name: 'Add entry to stack', exact: true })
      .click();
    assert.equal(await cards.count(), 2);
    await cards.nth(1).getByLabel('Title', { exact: true }).fill('From parent menu');
    await page.waitForFunction(() =>
      document.getElementById('event-edit-status').textContent.startsWith('Applied to timeline'),
    );
    await page.locator('.stack-marker').first().click({ button: 'right' });
    await input('timeline-menu')
      .getByRole('menuitem', { name: 'Add entry to stack', exact: true })
      .click();
    assert.equal(await cards.count(), 3);
    await cards.nth(2).getByLabel('Title', { exact: true }).fill('From child menu');
    assert.equal((await exported()).events.find((e) => e.id === 'icon').metadata.stack.length, 3);
    assert.equal(await input('event-save').count(), 0);
    await imported({
      ...stacked,
      title: 'Color plugin UI',
      plugins: [...stacked.plugins, { manifest: MOMENT_COLORS, enabled: true }],
    });
    await page.getByRole('button', { name: 'With icon', exact: true }).click();
    const rootColor = input('plugin-event-fields').locator(':scope > [data-metadata-key="color"]');
    await rootColor.getByRole('button', { name: 'Bad', exact: true }).click();
    await page.waitForFunction(() =>
      document.getElementById('event-edit-status').textContent.startsWith('Applied to timeline'),
    );
    assert.equal(await parentDot.evaluate((b) => b.style.backgroundColor), 'rgb(188, 102, 99)');
    assert.equal(
      await parentDot.evaluate((b) => getComputedStyle(b).borderTopColor),
      'rgb(255, 255, 255)',
    );
    await cards.nth(0).getByRole('button', { name: 'Information', exact: true }).click();
    let colors = await exported();
    assert.equal(colors.events.find((e) => e.id === 'icon').metadata.color, '#bc6663');
    assert.equal(
      colors.events.find((e) => e.id === 'icon').metadata.stack[0].metadata.color,
      '#7aadc4',
    );
    await rootColor.getByLabel('Moment color', { exact: true }).evaluate((input) => {
      input.value = '#123abc';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    colors = await exported();
    assert.equal(colors.events.find((e) => e.id === 'icon').metadata.color, '#123abc');
    await rootColor.getByRole('button', { name: 'Default', exact: true }).click();
    assert(
      !Object.hasOwn((await exported()).events.find((e) => e.id === 'icon').metadata, 'color'),
    );
    await imported({
      ...stacked,
      title: 'Shapes and scripts',
      plugins: [...stacked.plugins, { manifest: MOMENT_SHAPES, enabled: true }],
    });
    await page.getByRole('button', { name: 'With icon', exact: true }).click();
    await input('plugin-event-fields')
      .locator(':scope > [data-metadata-key="shape"]')
      .getByLabel('Moment shape', { exact: true })
      .selectOption('diamond');
    await page.waitForFunction(
      () => document.querySelector('.event-marker[data-first="0/1"]').dataset.shape === 'diamond',
    );
    assert.equal(await parentDot.locator('.marker-outline path').getAttribute('stroke'), 'white');
    await input('plugin-event-fields')
      .locator(':scope > [data-metadata-key="shapeSize"]')
      .getByLabel('Moment size', { exact: true })
      .selectOption('large');
    await page.waitForFunction(
      () => document.querySelector('.event-marker[data-first="0/1"]').dataset.size === 'large',
    );
    assert.equal(await parentDot.evaluate((node) => getComputedStyle(node).width), '32px');
    assert.equal(await parentDot.locator('.marker-outline path').getAttribute('fill'), 'none');
    await cards.nth(0).getByLabel('Moment size', { exact: true }).selectOption('small');
    await page.waitForFunction(
      () => document.querySelector('.stack-marker').dataset.size === 'small',
    );
    assert.equal(
      await page
        .locator('.stack-marker')
        .first()
        .evaluate((node) => getComputedStyle(node).width),
      '16px',
    );
    await cards.nth(0).getByLabel('Moment shape', { exact: true }).selectOption('hexagon');
    await page.waitForFunction(
      () => document.querySelector('.stack-marker').dataset.shape === 'hexagon',
    );
    await input('plugins-button').click();
    await input('plugins-add').click();
    await input('plugin-library-custom').click();
    const { source: script, ...definition } = PLUGIN_EXAMPLE;
    await input('plugin-definition').fill(JSON.stringify(definition));
    await input('plugin-source').fill(script);
    await input('plugin-author-install').click();
    assert.match(await input('plugin-author-status').textContent(), /active/);
    await page.getByRole('button', { name: 'Close plugin editor', exact: true }).click();
    await page.getByRole('button', { name: 'Close plugin library', exact: true }).click();
    await page.getByRole('button', { name: 'Close plugins', exact: true }).click();
    await input('plugin-event-fields')
      .locator(':scope > [data-metadata-key="status"]')
      .getByLabel('Status', { exact: true })
      .fill('blocked');
    await page.waitForFunction(
      () => document.querySelector('.event-marker[data-first="0/1"]').dataset.shape === 'diamond',
    );
    const scripted = await exported();
    assert.equal(
      scripted.plugins.find((p) => p.manifest.id === PLUGIN_EXAMPLE.id).manifest.source,
      script,
    );
    await imported(scripted);
    await frame();
    assert.equal(await parentDot.getAttribute('data-shape'), 'diamond');
    await page.getByRole('button', { name: 'With icon', exact: true }).click();
    await input('event-time').fill('incomplete/time');
    assert.equal((await exported()).events.find((e) => e.id === 'icon').time, '0/1');
    assert.match(await input('event-edit-status').textContent(), /Incomplete/);
    await input('event-time').fill('0/1');
    const deepDocument = {
      ...stacked,
      title: 'Deep branch UI',
      events: [
        {
          id: 'deep',
          time: '0/1',
          metadata: {
            title: 'Deep root',
            stack: Array.from({ length: 2000 }, (_, i) => ({
              id: 'child-' + i,
              metadata: { title: 'Child ' + i },
            })),
          },
        },
      ],
    };
    await imported(deepDocument);
    await frame();
    assert(
      (await page.locator('.stack-marker').count()) < 12,
      'Offscreen branch entries must not retain DOM nodes',
    );
    const initialCount = await input('visible-count').textContent();
    const stageBox = await input('timeline-stage').boundingBox();
    await page.mouse.move(stageBox.x + 20, stageBox.y + stageBox.height / 2);
    await page.keyboard.down('Alt');
    await page.mouse.wheel(0, -7200);
    await page.keyboard.up('Alt');
    await page.waitForFunction(() => {
      const transform = document.getElementById('markers').style.transform;
      return transform && !transform.startsWith('translateY(0px)');
    });
    assert((await page.locator('.stack-marker').count()) < 12);
    assert.equal(await input('visible-count').textContent(), initialCount);
    assert(
      (await page.locator('.stack-marker[data-stack-entry="child-100"]').count()) > 0,
      'Vertical pan reveals deep stack entries',
    );
    await input('center-vertical').click();
    await page.waitForFunction(() =>
      document.getElementById('markers').style.transform.startsWith('translateY(0px)'),
    );
    const uiBounds = await Promise.all(
      ['exact-left', 'exact-right'].map((id) => input(id).inputValue()),
    );
    const beforeSize = await page
      .locator('#markers .event-marker')
      .first()
      .evaluate((b) => b.getBoundingClientRect().width);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, 180);
    await page.keyboard.up('Control');
    await page.waitForFunction(
      () => Number(document.getElementById('timeline-stage').dataset.uiScale) < 1,
    );
    const afterSize = await page
      .locator('#markers .event-marker')
      .first()
      .evaluate((b) => b.getBoundingClientRect().width);
    assert(afterSize < beforeSize);
    assert.deepEqual(
      await Promise.all(['exact-left', 'exact-right'].map((id) => input(id).inputValue())),
      uiBounds,
    );
    await input('fit-button').click();
    await page.waitForFunction(
      () => document.getElementById('timeline-stage').dataset.uiScale === '1',
    );
    await imported({
      ...stacked,
      title: 'Optional labels UI',
      events: [
        {
          id: 'optional',
          time: '0/1',
          metadata: {
            stack: [
              { id: 'blank', metadata: {} },
              { id: 'named', metadata: { title: 'Named child' } },
            ],
          },
        },
      ],
    });
    await frame();
    assert.equal(await page.locator('#markers .event-marker').count(), 1);
    assert(await page.locator('#markers .event-label').isHidden());
    assert.equal(await page.locator('.stack-marker').count(), 2);
    assert.equal(await page.locator('.stack-label:visible').count(), 1);
    assert.equal(
      await page.locator('.stack-label small').count(),
      0,
      'Stack captions must not repeat inherited time',
    );
    await page.getByRole('button', { name: 'Unnamed moment', exact: true }).click();
    assert(await input('clear-selection').isVisible());
    assert(await input('time-cursor').isVisible());
    const cursorLayer = await input('time-cursor').evaluate((node) =>
      Number(getComputedStyle(node).zIndex),
    );
    assert(cursorLayer > 0, 'Selection cursor must paint above the label layers');
    await input('event-description').fill('Updated without a title');
    assert.equal((await exported()).events[0].metadata.title, '');
    await input('event-title').fill('Visible title');
    await page.waitForFunction(() =>
      document.getElementById('event-edit-status').textContent.startsWith('Applied to timeline'),
    );
    assert(await page.locator('#markers .event-label').isVisible());
    await input('event-title').fill('   ');
    await page.waitForFunction(() =>
      document.getElementById('event-edit-status').textContent.startsWith('Applied to timeline'),
    );
    assert(await page.locator('#markers .event-label').isHidden());
    await input('clear-selection').click();
    await frame();
    assert(await input('clear-selection').isHidden());
    assert(await input('time-cursor').isHidden());
    assert.equal((await exported()).events.length, 1);
    await imported({
      ...stacked,
      title: 'Hover cards UI',
      plugins: [...stacked.plugins, { manifest: FOCUS_ON_HOVER, enabled: true }],
      events: [
        {
          id: 'hover',
          time: '0/1',
          metadata: {
            title: 'Hover title',
            description: '<b>Plain text notes</b>\nSecond line',
            iconUrl: source,
            stack: [
              {
                id: 'hover-child',
                metadata: { title: 'Child preview', description: 'Child notes' },
              },
            ],
          },
        },
      ],
    });
    await page.locator('#markers .event-marker').first().hover();
    await page.waitForFunction(() =>
      document.getElementById('moment-hover-preview').classList.contains('open'),
    );
    const preview = input('moment-hover-preview');
    assert.equal(await preview.locator('strong').textContent(), 'Hover title');
    assert.match(await preview.locator('p').textContent(), /<b>Plain text notes<\/b>/);
    assert.equal(await preview.locator('b').count(), 0, 'Notes must not execute HTML');
    await page.waitForFunction(
      () => document.querySelector('#moment-hover-preview img')?.naturalWidth > 0,
    );
    await page.mouse.move(1, 1);
    await page.waitForFunction(
      () => document.getElementById('moment-hover-preview').getAttribute('aria-hidden') === 'true',
    );
    await page.locator('.stack-marker').first().focus();
    await page.waitForFunction(
      () => document.querySelector('#moment-hover-preview strong').textContent === 'Child preview',
    );
    assert.equal(await preview.locator('p').textContent(), 'Child notes');
    await page.keyboard.press('Escape');
    await page.waitForFunction(
      () => document.getElementById('moment-hover-preview').getAttribute('aria-hidden') === 'true',
    );
  } finally {
    await page.unroute(cloudMetadata);
    await page.unroute(cloudDocument);
    await page.unroute(catalogue);
    await page.unroute(images);
    await imported(restoreDocument);
  }
}
