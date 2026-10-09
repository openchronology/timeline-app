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
  await input('new-button').click();
  assert.equal(
    await input('timeline-description').inputValue(),
    'A short description for your timeline',
  );
  await load(restoreDocument);
}
