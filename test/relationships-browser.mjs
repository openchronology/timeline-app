// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { closeMomentDetails } from './moment-dialog-browser.mjs';
/** Relationships are linked from an entity's details, drawn as arcs and used to separate. */
export async function checkRelationships(page, restore) {
  const imported = async (doc) => {
    await closeMomentDetails(page);
    await page.locator('#json-file').setInputFiles({
      name: 'links.ochx',
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
    const pending = page.waitForEvent('download');
    await page.locator('#export-button').evaluate((b) => b.click());
    return JSON.parse(await readFile(await (await pending).path(), 'utf8'));
  };
  const doc = {
    format: 'openchronology',
    version: 1,
    title: 'Relationship regression',
    description: '',
    events: [
      { id: 'a', time: '10/1', metadata: { title: 'Alpha' } },
      { id: 'b', time: '50/1', metadata: { title: 'Bravo' } },
      { id: 'c', time: '90/1', metadata: { title: 'Charlie' } },
      { id: 'd', time: '130/1', metadata: { title: 'Delta' } },
    ],
    relationships: [{ a: { moment: 'b' }, b: { moment: 'c' } }],
  };
  const related = page.locator('#event-related');
  try {
    await imported(doc);
    await page.locator('#fit-button').click();
    // One arc for the existing link.
    await page.locator('.edge-arc').first().waitFor();
    assert.equal(await page.locator('.edge-arc').count(), 1);
    // Link Alpha to Bravo by searching from Alpha's details.
    await page.getByRole('button', { name: 'Alpha', exact: true }).click({ force: true });
    await related.getByText('No relationships yet.').waitFor();
    await related.locator('summary').click();
    await related.getByRole('searchbox').fill('bravo');
    await related.locator('.related-results button', { hasText: 'Bravo' }).click();
    await related.locator('.related-entity', { hasText: 'Bravo' }).waitFor();
    // Charlie is connected through Bravo.
    await related.getByText('1 more through other relationships.').waitFor();
    assert.deepEqual((await exported()).relationships, [
      { a: { moment: 'a' }, b: { moment: 'b' } },
      { a: { moment: 'b' }, b: { moment: 'c' } },
    ]);
    await page.waitForFunction(() => document.querySelectorAll('.edge-arc').length === 2);
    // Following a related entry opens it; its list shows the link back.
    await related.locator('.related-entity', { hasText: 'Bravo' }).click();
    await page.waitForFunction(() => document.getElementById('event-title').value === 'Bravo');
    await related.locator('.related-entity', { hasText: 'Alpha' }).waitFor();
    // Unlink, then undo restores the link.
    await related.getByRole('button', { name: 'Remove relationship with Alpha' }).click();
    await closeMomentDetails(page);
    assert.equal((await exported()).relationships.length, 1);
    await page.locator('#undo-button').click();
    assert.equal((await exported()).relationships.length, 2);
    // Separate everything connected to Alpha into the upper track.
    await page.getByRole('button', { name: 'Alpha', exact: true }).click({ force: true });
    await related.getByRole('button', { name: 'Separate all connected' }).click();
    await page.locator('#separation-settings').waitFor({ state: 'visible' });
    assert.equal(
      await page.locator('#separation-heading').textContent(),
      'Separated by all connected relationships',
    );
    assert.equal(await page.locator('#separation-tags').textContent(), 'Alpha');
    // Separation re-keys markers into tracks, which ease into place; wait for the settled
    // layout with the connected moments above Delta.
    await page.waitForFunction(() => {
      const y = (name) => {
        const all = document.querySelectorAll(`.event-marker[aria-label="${name}"]`);
        return all.length === 1 ? all[0].getBoundingClientRect().y : NaN;
      };
      const delta = y('Delta');
      return ['Alpha', 'Bravo', 'Charlie'].every((name) => y(name) < delta);
    });
    assert.equal(await page.locator('.edge-arc').count(), 0, 'Separated tracks draw no arcs.');
    await page.locator('#separation-rejoin').click();
    await page.locator('#separation-settings').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.querySelectorAll('.edge-arc').length === 2);
    console.log(
      'PASS relationships: linking by search, transitive count, arcs, navigation, unlink and undo, separation by connections.',
    );
  } finally {
    if (await page.locator('#separation-settings').isVisible())
      await page.locator('#separation-rejoin').click();
    await imported(restore);
  }
}
