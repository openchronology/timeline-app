// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Entity tags in the editor, and separating a timeline into tracks by tag.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { closeMomentDetails } from './moment-dialog-browser.mjs';
/**
 * Separates the open timeline by `groups` of tags (#548): one separation per group, each
 * tag typed into its picker and chosen with Enter, then Separate.
 */
export async function separateBy(page, ...groups) {
  await page.locator('#separate-button').click();
  const dialog = page.locator('#separate-dialog');
  await dialog.waitFor({ state: 'visible' });
  for (const [i, tags] of groups.entries()) {
    if (i > 0) await dialog.locator('#separate-add').click();
    const item = dialog.locator('.separation-item').nth(i);
    if (!(await item.locator('.tag-picker-panel').isVisible()))
      await item.locator('.tag-picker-toggle').click();
    for (const tag of tags) {
      await item.locator('.tag-picker-search').fill(tag);
      await item.locator('.tag-picker-search').press('Enter');
    }
  }
  await page.locator('#separate-submit').click();
  await dialog.waitFor({ state: 'hidden' });
}
/** Entity tags are edited on moments and durations and separate a timeline into two tracks. */
export async function checkTags(page, restore) {
  const imported = async (doc) => {
    await closeMomentDetails(page);
    await page.locator('#json-file').setInputFiles({
      name: 'tags.ochx',
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
    title: 'Tag regression',
    description: '',
    events: [
      { id: 'a', time: '10/1', metadata: { title: 'Battle', tags: ['war'] } },
      { id: 'b', time: '50/1', metadata: { title: 'Market' } },
      { id: 'c', time: '90/1', metadata: { title: 'Treaty', tags: ['war', 'trade'] } },
    ],
    durations: [
      { id: 'd', start: { moment: 'b' }, end: '70/1', metadata: { title: 'Siege', tags: ['war'] } },
    ],
  };
  try {
    await imported(doc);
    await page.locator('#fit-button').click();
    // Tags are edited as a comma-separated field and stored normalized in metadata.tags.
    await page.getByRole('button', { name: 'Market', exact: true }).click({ force: true });
    await page.locator('#event-tags').fill('Trade,  Ports ');
    await page.waitForFunction(() =>
      document.getElementById('event-edit-status').textContent.startsWith('Shown on the timeline'),
    );
    assert.equal(await page.locator('#event-metadata').inputValue(), '{}');
    await closeMomentDetails(page);
    const saved = await exported();
    assert.deepEqual(saved.events.find((e) => e.id === 'b').metadata.tags, ['trade', 'ports']);
    const before = await page.locator('#left-bound').inputValue();
    // The picker lists tags with counts, most used first; a separation pulls tagged entities
    // into a track above.
    await page.locator('#separate-button').click();
    const dialog = page.locator('#separate-dialog');
    await dialog.locator('.tag-picker-toggle').click();
    await dialog.locator('.tag-picker-options [role="option"]').first().waitFor();
    await page.waitForFunction(
      () =>
        document.querySelectorAll('#separate-dialog .tag-picker-options [role="option"]').length ===
        3,
    );
    assert.deepEqual(
      await dialog.locator('.tag-picker-options [role="option"]').allTextContents(),
      ['war3', 'trade2', 'ports1'],
    );
    // Searching narrows them; choosing adds a chip; its × removes it.
    await dialog.locator('.tag-picker-search').fill('tr');
    assert.deepEqual(
      await dialog.locator('.tag-picker-options [role="option"]').allTextContents(),
      ['trade2', 'Add “tr”'],
    );
    await dialog.locator('.tag-picker-search').press('Enter');
    assert.deepEqual(await dialog.locator('.tag-chip').allTextContents(), ['trade×']);
    await dialog.getByRole('button', { name: 'Remove trade' }).click();
    assert.equal(await dialog.locator('.tag-chip').count(), 0);
    await dialog.locator('.tag-picker-search').fill('war');
    await dialog.locator('.tag-picker-search').press('Enter');
    await dialog.locator('.tag-picker-search').press('Escape');
    assert.equal(await dialog.isVisible(), true, 'Escape closes the picker, not the dialog');
    assert.equal(await dialog.locator('.tag-picker-panel').isVisible(), false);
    await page.locator('#separate-submit').click();
    await dialog.waitFor({ state: 'hidden' });
    await page.locator('#separation-settings').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#separation-tags').textContent(), 'war');
    assert.equal(await page.locator('#comparison-settings').isVisible(), false);
    assert.equal(await page.locator('#left-bound').inputValue(), before, 'The view is kept.');
    // Tagged moments and the tagged duration sit above; Market stays below.
    const top = async (name) =>
      (await page.getByRole('button', { name, exact: true }).first().boundingBox()).y;
    assert((await top('Battle')) < (await top('Market')));
    assert((await top('Treaty')) < (await top('Market')));
    const band = await page.locator('.duration-band', { hasText: 'Siege' }).boundingBox();
    assert(band.y < (await top('Market')));
    assert.equal(await page.locator('#add-button').isVisible(), false, 'Separation is read-only.');
    // Read-only moments and durations open without Save or Cancel.
    await page.getByRole('button', { name: 'Market', exact: true }).first().click();
    await page.locator('#inspector').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#event-save').isVisible(), false);
    assert.equal(await page.locator('#event-cancel').isVisible(), false);
    await closeMomentDetails(page);
    await page.locator('.duration-band', { hasText: 'Siege' }).click({ force: true });
    await page.locator('#duration-dialog').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#duration-save').isVisible(), false);
    await page.getByRole('button', { name: 'Close duration details' }).click();
    await page.locator('#duration-dialog').waitFor({ state: 'hidden' });
    await page.locator('#separation-rejoin').click();
    await page.locator('#separation-settings').waitFor({ state: 'hidden' });
    await page.locator('#add-button').waitFor({ state: 'visible' });
    // Several separations (#548): a track each, above everything else; the button stays, with
    // how many are shown, and its dialog lists them to change.
    await separateBy(page, ['war'], ['ports']);
    await page.locator('#separation-settings').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#separation-heading').textContent(), '2 separations');
    assert.equal(await page.locator('#separation-tags').textContent(), 'war · ports');
    assert.equal(await page.locator('#separate-button').isVisible(), true);
    assert.equal(await page.locator('#separate-count').textContent(), '2');
    assert.equal(await page.locator('#comparison-tracks > *').count(), 3);
    assert((await top('Battle')) < (await top('Market')), 'war above ports');
    // Three tracks at the reader's text size (#556), not shrunk to fit: the stage grows to
    // show them, up to the window, and returns to its own height on rejoining.
    const stage = page.locator('#timeline-stage');
    const stageState = () =>
      stage.evaluate((s) => ({ scale: Number(s.dataset.uiScale), height: s.clientHeight }));
    await page.waitForFunction(() => document.getElementById('timeline-stage').clientHeight > 365);
    const grown = await stageState();
    assert.equal(grown.scale, 1, 'the text keeps its size');
    assert.ok(grown.height <= (await page.evaluate(() => innerHeight)) - 140, 'within the window');
    await page.locator('#separation-rejoin').click();
    await page.waitForFunction(
      () => document.getElementById('timeline-stage').clientHeight === 365,
    );
    await separateBy(page, ['war'], ['ports']);
    await page.locator('#separation-settings').waitFor({ state: 'visible' });
    await page.locator('#separate-button').click();
    const editing = page.locator('#separate-dialog');
    assert.deepEqual(await editing.locator('.separation-item .tag-chip').allTextContents(), [
      'war×',
      'ports×',
    ]);
    await editing.getByRole('button', { name: 'Remove separation 2' }).click();
    assert.equal(await editing.locator('.separation-item').count(), 1);
    await page.locator('#separate-submit').click();
    await editing.waitFor({ state: 'hidden' });
    await page.waitForFunction(
      () => document.getElementById('separation-heading').textContent === 'Separated by tags',
    );
    assert.equal(await page.locator('#separate-count').textContent(), '1');
    // A separation that disjoins (#549): war from the main timeline at 60. Battle (10) and
    // the siege (from 50) stay below with the market; the treaty (90) forks away above.
    await page.locator('#separate-button').click();
    await editing.locator('.separation-item').first().waitFor();
    assert.equal(await editing.locator('.separation-join-none').count(), 1);
    // Disjoins and unions are added and edited in a dialog of their own.
    const join = page.locator('#join-dialog');
    const saveJoin = async () => {
      await page.locator('#join-submit').click();
      await join.waitFor({ state: 'hidden' });
    };
    const separate = async (label) => {
      await page.locator('#separate-submit').click();
      await editing.waitFor({ state: 'hidden' });
      await page.waitForFunction(
        (label) => document.getElementById('separation-tags').textContent.includes(label),
        label,
      );
      await page.evaluate(() => new Promise(requestAnimationFrame));
    };
    await editing.locator('.separation-join-add').first().click();
    await join.waitFor({ state: 'visible' });
    assert.equal(await join.locator('input[value="disjoins"]').isChecked(), true);
    assert.equal(await page.locator('#join-track').inputValue(), 'main');
    assert.equal(await page.locator('#join-at-tab').getAttribute('aria-selected'), 'true');
    await page.locator('#join-time').fill('60');
    await saveJoin();
    assert.deepEqual(await editing.locator('.separation-join-label').allTextContents(), [
      'Disjoin',
    ]);
    assert.match(
      await editing.locator('.separation-join-text').first().textContent(),
      /^From the main timeline · at 60/,
    );
    await separate('(from');
    assert((await top('Treaty')) < (await top('Market')), 'the treaty forked away');
    assert(Math.abs((await top('Battle')) - (await top('Market'))) < 40, 'the battle had not');
    assert.equal(await page.locator('.separation-fork-line').count(), 1);
    // Its track is empty before then: no axis there, nor ticks.
    assert(
      (await page.locator('.axis-tick .tick-notch[hidden]').count()) > 0,
      'the separated track has no ticks before its disjoin',
    );
    // At a moment, followed (#549): the treaty itself (90), so only it and later forks away.
    await page.locator('#separate-button').click();
    await editing.locator('.separation-join-edit').first().click();
    await join.waitFor({ state: 'visible' });
    await page.locator('#join-moment-tab').click();
    await page.locator('#moment-picker').waitFor({ state: 'visible' });
    await page.locator('#moment-picker-results button').filter({ hasText: 'Treaty' }).click();
    await page.locator('#moment-picker').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#join-moment-choose').textContent(), 'Treaty');
    await saveJoin();
    assert.match(await editing.locator('.separation-join-text').first().textContent(), /at Treaty/);
    await separate('(a moment)');
    assert((await top('Treaty')) < (await top('Market')), 'the treaty forks at itself');
    assert(Math.abs((await top('Battle')) - (await top('Market'))) < 40);
    // At its first moment: the battle (10), the earliest with war, so everything war forks.
    await page.locator('#separate-button').click();
    await editing.locator('.separation-join-edit').first().click();
    await join.waitFor({ state: 'visible' });
    assert.equal(await page.locator('#join-bound-tab').textContent(), 'Earliest moment');
    await page.locator('#join-bound-tab').click();
    await saveJoin();
    await separate('first moment');
    assert((await top('Battle')) < (await top('Market')), 'the battle forks with its first');
    // A union (#549): back into the main timeline at 70, so the treaty (90) is there again,
    // and the track curves back into it. Both share the separation's list.
    await page.locator('#separate-button').click();
    await editing.locator('.separation-join-add').first().click();
    await join.waitFor({ state: 'visible' });
    await join.locator('input[value="unions"]').check();
    assert.equal(await page.locator('#join-track-label').textContent(), 'Into');
    assert.equal(await page.locator('#join-track').inputValue(), 'main');
    await page.locator('#join-time').fill('70');
    await saveJoin();
    assert.deepEqual(await editing.locator('.separation-join-label').allTextContents(), [
      'Disjoin',
      'Union',
    ]);
    await separate('into main');
    assert((await top('Battle')) < (await top('Market')), 'the battle is still separate');
    assert(Math.abs((await top('Treaty')) - (await top('Market'))) < 40, 'the treaty united');
    assert.equal(await page.locator('.separation-fork-line').count(), 2);
    // At its last moment: the treaty, the latest with war, which then unites with itself.
    await page.locator('#separate-button').click();
    await editing.locator('.separation-join-edit').nth(1).click();
    await join.waitFor({ state: 'visible' });
    assert.equal(await join.locator('input[value="unions"]').isChecked(), true);
    assert.equal(await page.locator('#join-bound-tab').textContent(), 'Latest moment');
    await page.locator('#join-bound-tab').click();
    await saveJoin();
    await separate('last moment');
    assert(Math.abs((await top('Treaty')) - (await top('Market'))) < 40, 'unites at the treaty');
    assert((await top('Battle')) < (await top('Market')));
    // Rejoining all from the dialog shows the whole timeline, and the count goes.
    await page.locator('#separate-button').click();
    await page.locator('#separate-clear').click();
    await page.locator('#separation-settings').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#separate-count').isVisible(), false);
    // A default view (#416): a timeline saved separated opens that way, keeping its title.
    const viewed = {
      ...doc,
      title: 'Default view regression',
      relationships: [{ a: { moment: 'a' }, b: { moment: 'b' } }],
      view: { separation: { related: { moment: 'b' }, depth: 'direct' } },
    };
    await imported(viewed);
    await page.locator('#separation-settings').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#separation-heading').textContent(), 'Separated: related to');
    assert.equal(await page.locator('#separation-tags').textContent(), 'Market');
    assert.equal(await page.locator('#timeline-title').inputValue(), 'Default view regression');
    assert.match(await page.locator('#separation-default-note').textContent(), /default view/);
    // Cleared, it opens whole; made again from the bar, it is saved with the timeline.
    await page.locator('#separation-default-clear').click();
    await page.locator('#separation-default').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#separation-default-note').isVisible(), false);
    await page.locator('#separation-rejoin').click();
    await page.locator('#separation-settings').waitFor({ state: 'hidden' });
    assert.equal('view' in (await exported()), false);
    await page.locator('#separate-button').click();
    assert.equal(await page.locator('#separate-default').isVisible(), false);
    await page.locator('#separate-dialog [data-close="separate-dialog"]').first().click();
    await separateBy(page, ['war']);
    await page.locator('#separation-default').click();
    await page.locator('#separation-default-clear').waitFor({ state: 'visible' });
    await page.locator('#separation-rejoin').click();
    assert.deepEqual((await exported()).view, { separation: { tags: ['war'] } });
    // The Separate dialog says what it opens separated by, and clears it too.
    await page.locator('#separate-button').click();
    await page.locator('#separate-default').waitFor({ state: 'visible' });
    assert.equal(
      await page.locator('#separate-default-text').textContent(),
      'This timeline opens separated by tags: war.',
    );
    await page.locator('#separate-default-clear').click();
    await page.locator('#separate-default').waitFor({ state: 'hidden' });
    await page.locator('#separate-dialog [data-close="separate-dialog"]').first().click();
    assert.equal('view' in (await exported()), false);
    // An entity deleted since opens the whole timeline, quietly.
    await imported({
      ...viewed,
      view: { separation: { related: { moment: 'gone' }, depth: 'all' } },
    });
    await page.evaluate(() => new Promise(requestAnimationFrame));
    assert.equal(await page.locator('#separation-settings').isVisible(), false);
    assert.deepEqual((await exported()).view, {
      separation: { related: { moment: 'gone' }, depth: 'all' },
    });
    console.log(
      'PASS tags: editing, normalized storage, tag counts, separation into tracks and rejoin; a default view opened, made, cleared and exported, and one naming a deleted entity opening whole.',
    );
  } finally {
    if (await page.locator('#separation-settings').isVisible())
      await page.locator('#separation-rejoin').click();
    await imported(restore);
  }
}
