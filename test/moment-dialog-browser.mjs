// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Finishes with the moment dialog, keeping what was typed: only Save keeps edits, so with
 * edits under way (applying, shown on the timeline, or a new moment's draft) it saves;
 * otherwise it closes. `dismissMomentDetails` closes without keeping anything.
 */
export async function closeMomentDetails(page) {
  return finishMomentDetails(page, true);
}
export async function dismissMomentDetails(page) {
  return finishMomentDetails(page, false);
}
async function finishMomentDetails(page, keep) {
  const inspector = page.locator('#inspector');
  // The app may close the inspector itself (e.g. while loading a timeline) between these
  // steps, which would leave a click waiting for a button that never becomes visible again.
  for (let attempt = 0; attempt < 5 && (await inspector.isVisible()); attempt++) {
    const state = await inspector.evaluate((node) => ({
      closing: !node.open || 'dialogClosing' in node.dataset,
      editing:
        !document.getElementById('event-form').hidden &&
        /^(Applying edits|Shown on the timeline|Not on the timeline)/.test(
          document.getElementById('event-edit-status').textContent,
        ),
    }));
    if (!state.closing)
      await page
        .locator(keep && state.editing ? '#event-save' : '#close-inspector')
        .click({ timeout: 2000 })
        .catch(() => {});
    await inspector.waitFor({ state: 'hidden', timeout: 2000 }).catch(() => {});
  }
  await inspector.waitFor({ state: 'hidden' });
  // The dialog's close event, which also closes the timeline menu, follows hiding it. Let it
  // run so a menu the caller opens next is not closed by it.
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => setTimeout(done, 0))),
  );
}
export async function checkMomentDialog(page, restoreDocument) {
  const { default: assert } = await import('node:assert/strict');
  const input = (id) => page.locator('#' + id);
  const load = async (document) => {
    await closeMomentDetails(page);
    await input('json-file').setInputFiles({
      name: 'modal.ochx',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(document)),
    });
    await page.waitForFunction(
      (title) => document.getElementById('timeline-title').value === title,
      document.title,
    );
  };
  await load({
    format: 'openchronology',
    version: 1,
    title: 'Modal editing',
    description: '',
    events: [{ id: 'modal-event', time: '0/1', metadata: { title: 'Existing moment' } }],
  });
  assert.equal(await input('import-button').textContent(), 'Import');
  assert.equal(await input('export-button').textContent(), 'Export');
  assert.equal(await input('memory-export').count(), 0);
  await page.getByRole('button', { name: 'Existing moment', exact: true }).click();
  assert.equal(await input('inspector').evaluate((node) => node.matches('dialog:modal')), true);
  const marker = (name) => page.getByRole('button', { name, exact: true });
  const applied = () =>
    page.waitForFunction(() =>
      document.getElementById('event-edit-status').textContent.startsWith('Shown on the timeline'),
    );
  // Only Save keeps edits: the close button, Escape and clicking outside discard them, even
  // after they showed on the timeline.
  await input('event-title').fill('Not kept: closed');
  await applied();
  await marker('Not kept: closed').waitFor();
  await dismissMomentDetails(page);
  await marker('Existing moment').waitFor();
  assert.equal(await marker('Not kept: closed').count(), 0);
  await marker('Existing moment').click();
  await input('event-title').fill('Not kept: clicked outside');
  await applied();
  await page.mouse.click(4, 4);
  await input('inspector').waitFor({ state: 'hidden' });
  await marker('Existing moment').waitFor();
  await marker('Existing moment').click();
  // Saving before the debounce expires keeps the edit.
  await input('event-title').fill('Edited through modal');
  await input('event-save').click();
  await input('inspector').waitFor({ state: 'hidden' });
  await marker('Edited through modal').waitFor();
  // A new moment is not on the timeline until Save, so Escape leaves nothing behind.
  const events = () => input('event-count').textContent();
  const initial = await events();
  await input('add-button').click();
  assert.equal(await input('moment-heading').textContent(), 'New moment');
  await input('event-title').fill('Created through modal');
  await input('event-time').fill('10/1');
  await page.waitForFunction(() =>
    document.getElementById('event-edit-status').textContent.startsWith('Not on the timeline'),
  );
  assert.equal(await events(), initial);
  await page.keyboard.press('Escape');
  await input('inspector').waitFor({ state: 'hidden' });
  assert.equal(await events(), initial);
  assert.equal(await marker('Created through modal').count(), 0);
  await input('add-button').click();
  await input('event-title').fill('Created through modal');
  await input('event-time').fill('10/1');
  await input('event-save').click();
  await input('inspector').waitFor({ state: 'hidden' });
  await input('fit-button').click();
  await marker('Created through modal').waitFor();
  assert.notEqual(await events(), initial);
  // Save applies edits typed just now and closes.
  await marker('Edited through modal').click();
  await input('event-title').fill('Saved through modal');
  await input('event-save').click();
  await input('inspector').waitFor({ state: 'hidden' });
  await marker('Saved through modal').waitFor();
  // Cancel restores the moment as it was opened, without an undo step of its own.
  await marker('Saved through modal').click();
  await input('event-title').fill('Discarded title');
  await input('event-time').fill('5/1');
  await applied();
  await marker('Discarded title').waitFor();
  await input('event-cancel').click();
  await input('inspector').waitFor({ state: 'hidden' });
  await marker('Saved through modal').waitFor();
  assert.equal(await marker('Discarded title').count(), 0);
  await input('undo-button').click();
  await marker('Edited through modal').waitFor();
  await input('redo-button').click();
  await marker('Saved through modal').waitFor();
  // Cancelling a new moment leaves nothing; saving one creates it even if nothing was typed.
  const before = await events();
  await input('add-button').click();
  await input('event-title').fill('Never created');
  await page.waitForFunction(() =>
    document.getElementById('event-edit-status').textContent.startsWith('Not on the timeline'),
  );
  await input('event-cancel').click();
  await input('inspector').waitFor({ state: 'hidden' });
  assert.equal(await marker('Never created').count(), 0);
  assert.equal(await events(), before);
  await input('add-button').click();
  await input('event-save').click();
  await input('inspector').waitFor({ state: 'hidden' });
  assert.notEqual(await events(), before);
  // The same for durations: a new one is added only by Save; Cancel, Escape and clicking
  // outside leave nothing behind.
  const bands = () => page.locator('.duration-band').count();
  const durationDialog = input('duration-dialog');
  const spans = await bands();
  await input('add-duration-button').click();
  await durationDialog.waitFor({ state: 'visible' });
  await input('duration-title').fill('Cancelled span');
  await page.waitForTimeout(400);
  assert.equal(await bands(), spans);
  assert(await input('duration-delete').isHidden());
  await input('duration-cancel').click();
  await durationDialog.waitFor({ state: 'hidden' });
  assert.equal(await bands(), spans);
  for (const dismiss of [() => page.mouse.click(4, 4), () => page.keyboard.press('Escape')]) {
    await input('add-duration-button').click();
    await durationDialog.waitFor({ state: 'visible' });
    await input('duration-title').fill('Dismissed span');
    await page.waitForTimeout(400);
    await dismiss();
    await durationDialog.waitFor({ state: 'hidden' });
    assert.equal(await bands(), spans);
  }
  await input('add-duration-button').click();
  await input('duration-title').fill('Saved span');
  await input('duration-save').click();
  await durationDialog.waitFor({ state: 'hidden' });
  await page.waitForFunction((n) => document.querySelectorAll('.duration-band').length > n, spans);
  const saved = page.locator('.duration-band').last();
  await saved.click({ position: { x: 4, y: 4 } });
  await durationDialog.waitFor({ state: 'visible' });
  assert.equal(await input('duration-title').inputValue(), 'Saved span');
  await input('duration-title').fill('Renamed span');
  await input('duration-cancel').click();
  await durationDialog.waitFor({ state: 'hidden' });
  await saved.click({ position: { x: 4, y: 4 } });
  assert.equal(await input('duration-title').inputValue(), 'Saved span');
  // Clicking outside an existing duration reverts its edits too.
  await input('duration-title').fill('Renamed and dismissed');
  await page.waitForTimeout(400);
  await page.mouse.click(4, 4);
  await durationDialog.waitFor({ state: 'hidden' });
  await saved.click({ position: { x: 4, y: 4 } });
  assert.equal(await input('duration-title').inputValue(), 'Saved span');
  await input('duration-cancel').click();
  await durationDialog.waitFor({ state: 'hidden' });
  await input('new-button').click();
  assert.equal(
    await input('timeline-description').inputValue(),
    'A short description for your timeline',
  );
  // An empty timeline has nothing to fit: no Fit buttons or menu item, and the empty state
  // says so.
  await input('empty-window').waitFor();
  // The offline file words it as an invitation to import.
  assert.match(
    await input('empty-message').textContent(),
    /^(This timeline has no moments yet\.|Import a timeline or add your first moment\.)$/,
  );
  assert(await input('fit-button').isHidden());
  assert(await input('empty-fit').isHidden());
  const stage = await input('timeline-stage').boundingBox();
  await page.mouse.click(stage.x + stage.width / 2, stage.y + 80, { button: 'right' });
  const menu = input('timeline-menu');
  await menu.waitFor();
  assert.deepEqual(await menu.getByRole('menuitem').allTextContents(), ['+Moment']);
  await page.keyboard.press('Escape');
  // Durations alone are something to fit, and Fit shows them.
  await load({
    format: 'openchronology',
    version: 1,
    title: 'Durations only',
    description: '',
    events: [],
    durations: [{ id: 'span', start: '5000/1', end: '6000/1', metadata: { title: 'Far span' } }],
  });
  await input('fit-button').waitFor();
  await input('fit-button').click();
  await page.locator('.duration-band', { hasText: 'Far span' }).waitFor();
  await load(restoreDocument);
}
