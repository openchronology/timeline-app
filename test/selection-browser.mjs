// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import { closeMomentDetails } from './moment-dialog-browser.mjs';
import { readFile } from 'node:fs/promises';
import { DEFAULT_PRESENTATION } from '../dist/core.mjs';

/** Run the same selection, gesture and modal checks in served and network-free builds. */
export async function checkSelection(page, restoreDocument) {
  const input = (id) => page.locator('#' + id);
  const imported = async (doc) => {
    await closeMomentDetails(page);
    await input('json-file').setInputFiles({
      name: 'selection.ochx',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(doc)),
    });
    await page.waitForFunction(
      (title) => document.getElementById('timeline-title').value === title,
      doc.title,
    );
    await page.evaluate(() => new Promise(requestAnimationFrame));
  };
  const exported = async () => {
    const downloading = page.waitForEvent('download');
    // Inspect serialization without dismissing the editor under test.
    await input('export-button').evaluate((button) => button.click());
    return JSON.parse(await readFile(await (await downloading).path(), 'utf8'));
  };
  const source =
    'function print(time, api) { return api.exact(time) + " ticks"; } function parse(text, api) { return api.rational(api.stripSuffix(text, " ticks")); }';
  await imported({
    format: 'openchronology',
    version: 1,
    title: 'Selection UI',
    description: '',
    presentation: { ...DEFAULT_PRESENTATION, mode: 'custom', source },
    events: [
      { id: 'third', time: '1/3', metadata: { title: 'Third' } },
      { id: 'other', time: '9/1', metadata: { title: 'Other' } },
    ],
  });
  const stage = input('timeline-stage'),
    menu = input('timeline-menu');
  const box = await stage.boundingBox();
  const x = box.x + 150,
    y = box.y + 50;
  await page.mouse.click(x, y);
  assert(await input('event-form').isVisible());
  assert(await input('time-cursor').isVisible());
  const exact = await input('time-cursor').getAttribute('data-time');
  assert.equal(await input('event-time').inputValue(), exact + ' ticks');
  assert.equal(await input('event-exact').inputValue(), exact);
  // The cursor follows its coordinate when the view moves rather than a fixed screen pixel.
  const left = await input('time-cursor').evaluate((node) => node.style.left);
  await closeMomentDetails(page);
  await input('zoom-in').click();
  await page.waitForFunction(
    (old) => document.getElementById('time-cursor').style.left !== old,
    left,
  );
  assert.equal(await input('time-cursor').getAttribute('data-time'), exact);
  await closeMomentDetails(page);
  await input('add-button').click();
  assert.equal(await input('event-exact').inputValue(), exact);
  await closeMomentDetails(page);
  await input('fit-button').click();
  await closeMomentDetails(page);
  await input('clear-selection').click();
  await page.mouse.click(x, y, { button: 'right' });
  assert(await menu.isVisible());
  await input('time-cursor').waitFor({ state: 'visible' });
  const contextTime = await input('time-cursor').getAttribute('data-time');
  const cursorBox = await input('time-cursor').boundingBox();
  assert(Math.abs(cursorBox.x + cursorBox.width / 2 - x) < 2);
  assert.deepEqual(await menu.getByRole('menuitem').allTextContents(), ['+Event', 'Fit all']);
  await page.keyboard.press('Escape');
  assert(await menu.isHidden());
  await page.mouse.click(x, y, { button: 'right' });
  await menu.getByRole('menuitem', { name: '+Event', exact: true }).click();
  assert.equal(await input('event-exact').inputValue(), contextTime);
  assert.equal(await input('event-time').inputValue(), contextTime + ' ticks');
  await input('event-title').fill('From context menu');
  await input('event-time').fill('4/7 ticks');
  await page.waitForFunction(() =>
    document.getElementById('event-edit-status').textContent.startsWith('Applied to timeline'),
  );
  assert(
    (await exported()).events.some(
      (e) => e.time === '4/7' && e.metadata.title === 'From context menu',
    ),
  );
  await input('event-delete').click();
  assert(await input('delete-dialog').isVisible());
  assert.equal((await exportedAfterCancel()).events.length, 3);
  async function exportedAfterCancel() {
    await input('delete-cancel').click();
    return exported();
  }
  await input('event-delete').click();
  await page.keyboard.press('Escape');
  assert.equal((await exported()).events.length, 3);
  await input('event-delete').click();
  await input('delete-confirm').click();
  assert.equal((await exported()).events.length, 2);
  await closeMomentDetails(page);
  await input('undo-button').click();
  assert.equal((await exported()).events.length, 3);
  // Coincident/nearby points are never silently deleted as a group.
  await page.getByRole('button', { name: 'Other', exact: true }).click({ button: 'right' });
  await menu.getByRole('menuitem', { name: 'Delete', exact: true }).waitFor();
  await menu.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  assert.match(await input('delete-description').textContent(), /Other/);
  assert.equal(await input('event-count').textContent(), '3 events');
  await input('delete-confirm').click();
  assert.equal((await exported()).events.length, 2);
  await closeMomentDetails(page);
  await input('undo-button').click();
  // Coincident markers require choosing an individual event before deletion.
  await imported({
    format: 'openchronology',
    version: 1,
    title: 'Coincident selection UI',
    description: '',
    presentation: { ...DEFAULT_PRESENTATION, mode: 'custom', source },
    events: [
      { id: 'one', time: '1/3', metadata: { title: 'One' } },
      { id: 'two', time: '1/3', metadata: { title: 'Two' } },
    ],
  });
  await page.locator('.event-marker.group').click({ button: 'right' });
  assert.equal(await menu.getByRole('menuitem', { name: 'Delete', exact: true }).count(), 0);
  await menu.getByRole('menuitem', { name: 'View events', exact: true }).click();
  await input('group-events').getByRole('button', { name: /^One/ }).click({ button: 'right' });
  await menu.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  assert.match(await input('delete-description').textContent(), /One/);
  await input('delete-cancel').click();
  assert.equal((await exported()).events.length, 2);
  // A held touch opens a menu without submitting a tap or moving the camera.
  await closeMomentDetails(page);
  const before = await input('exact-left').inputValue();
  const title = await input('event-title').inputValue();
  await page.mouse.move(x, y);
  await stage.evaluate((node) =>
    node.addEventListener(
      'pointerdown',
      (event) => {
        node.dataset.testPointer = String(event.pointerId);
      },
      { once: true },
    ),
  );
  await page.mouse.down();
  const pointerId = Number(await stage.getAttribute('data-test-pointer'));
  await stage.dispatchEvent('pointerdown', {
    pointerId,
    pointerType: 'touch',
    clientX: x,
    clientY: y,
    bubbles: true,
  });
  await menu.waitFor({ state: 'visible' });
  await stage.dispatchEvent('pointerup', {
    pointerId,
    pointerType: 'touch',
    clientX: x,
    clientY: y,
    bubbles: true,
  });
  await page.mouse.up();
  assert.equal(await input('exact-left').inputValue(), before);
  assert.equal(await input('event-title').inputValue(), title);
  await page.keyboard.press('Escape');
  assert.equal((await exported()).presentation.source, source);
  await imported({ ...restoreDocument, title: restoreDocument.title + ' restored selection' });
  assert(await input('time-cursor').isHidden());
  // Restore the original name too for the existing draft-persistence assertions.
  await imported(restoreDocument);
}
