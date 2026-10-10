// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
export async function closeMomentDetails(page) {
  const inspector = page.locator('#inspector');
  // The app may close the inspector itself (e.g. while loading a timeline) between these
  // steps, which would leave a click waiting for a button that never becomes visible again.
  for (let attempt = 0; attempt < 5 && (await inspector.isVisible()); attempt++) {
    const closing = await inspector.evaluate(
      (node) => !node.open || 'dialogClosing' in node.dataset,
    );
    if (!closing)
      await page
        .locator('#close-inspector')
        .click({ timeout: 2000 })
        .catch(() => {});
    await inspector.waitFor({ state: 'hidden', timeout: 2000 }).catch(() => {});
  }
  await inspector.waitFor({ state: 'hidden' });
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
  // Closing before the debounce expires must still apply the edit.
  await input('event-title').fill('Edited through modal');
  await closeMomentDetails(page);
  await page.getByRole('button', { name: 'Edited through modal', exact: true }).waitFor();
  await input('add-button').click();
  assert.equal(await input('moment-heading').textContent(), 'New moment');
  await input('event-title').fill('Created through modal');
  await input('event-time').fill('10/1');
  await page.keyboard.press('Escape');
  await input('inspector').waitFor({ state: 'hidden' });
  await input('fit-button').click();
  await page.getByRole('button', { name: 'Created through modal', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Edited through modal', exact: true }).click();
  await page.mouse.click(4, 4);
  await input('inspector').waitFor({ state: 'hidden' });
  // Save applies edits typed just now and closes.
  const marker = (name) => page.getByRole('button', { name, exact: true });
  const applied = () =>
    page.waitForFunction(() =>
      document.getElementById('event-edit-status').textContent.startsWith('Applied'),
    );
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
  // Cancelling a new moment removes it; saving one creates it even if nothing was typed.
  const events = () => input('event-count').textContent();
  const before = await events();
  await input('add-button').click();
  await input('event-title').fill('Never created');
  await applied();
  await input('event-cancel').click();
  await input('inspector').waitFor({ state: 'hidden' });
  assert.equal(await marker('Never created').count(), 0);
  assert.equal(await events(), before);
  await input('add-button').click();
  await input('event-save').click();
  await input('inspector').waitFor({ state: 'hidden' });
  assert.notEqual(await events(), before);
  // The same for durations: a new one is removed by Cancel and kept by Save.
  const bands = () => page.locator('.duration-band').count();
  const durationDialog = input('duration-dialog');
  const spans = await bands();
  await input('add-duration-button').click();
  await durationDialog.waitFor({ state: 'visible' });
  await input('duration-title').fill('Cancelled span');
  await input('duration-cancel').click();
  await durationDialog.waitFor({ state: 'hidden' });
  assert.equal(await bands(), spans);
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
  await input('duration-cancel').click();
  await durationDialog.waitFor({ state: 'hidden' });
  await input('new-button').click();
  assert.equal(
    await input('timeline-description').inputValue(),
    'A short description for your timeline',
  );
  await load(restoreDocument);
}
