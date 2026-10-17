// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Capacity advice in the editor: large timelines suggest the desktop app or the platform.
import assert from 'node:assert/strict';
import { closeMomentDetails } from './moment-dialog-browser.mjs';
import { THRESHOLDS } from '../dist/core.mjs';
/**
 * Large in-memory timelines suggest the desktop app (and, offline, the platform); dismissing
 * the advice holds for that timeline, and small timelines never show it.
 */
export async function checkCapacity(page, restore, { offline = false } = {}) {
  const notice = page.locator('#capacity-notice');
  const imported = async (doc) => {
    await closeMomentDetails(page);
    await page.locator('#json-file').setInputFiles({
      name: 'capacity.ochx',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(doc)),
    });
    await page.waitForFunction(
      (title) => document.getElementById('timeline-title').value === title,
      doc.title,
      { timeout: 120000 },
    );
  };
  const timeline = (title, moments) => ({
    format: 'openchronology',
    version: 1,
    title,
    description: '',
    events: Array.from({ length: moments }, (_, i) => ({
      id: 'c' + i,
      time: `${i}/1`,
      metadata: { title: 'Moment ' + i },
    })),
  });
  let measured = false;
  try {
    // At the moment-count fallback (or sooner, if this device measured it slow to open).
    const large = timeline('Capacity advice', THRESHOLDS.moments);
    await imported(large);
    await notice.waitFor({ timeout: 120000 });
    const text = await page.locator('#capacity-text').textContent();
    assert.match(text, /desktop app/);
    assert.match(text, /This timeline (has 20,000 moments|took [\d.]+ s to open)/);
    const actions = page.locator('#capacity-actions');
    assert.equal(await actions.getByRole('button', { name: 'Export', exact: true }).count(), 1);
    assert.equal(
      await actions.getByRole('link', { name: 'Get the desktop app' }).getAttribute('href'),
      'https://github.com/openchronology/timeline-app/releases/latest',
    );
    assert.equal(
      await actions.getByRole('link', { name: 'Open the platform' }).count(),
      offline ? 1 : 0,
    );
    // Dismissed advice stays dismissed for this timeline, even after reopening it.
    await page.locator('#capacity-dismiss').click();
    await notice.waitFor({ state: 'hidden' });
    await imported(large);
    await page.evaluate(() => new Promise((done) => setTimeout(done, 500)));
    assert(await notice.isHidden());
    // On a slow device the advice follows this device's own measurement of opening.
    if (page.context().browser()?.browserType().name() === 'chromium') {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 30 });
      try {
        await imported(timeline('Slow device capacity', 3000));
        await notice.waitFor({ timeout: 120000 });
        assert.match(
          await page.locator('#capacity-text').textContent(),
          /This timeline took [\d.]+ s to open in this browser/,
        );
      } finally {
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
        await cdp.detach();
      }
      await page.locator('#capacity-dismiss').click();
      // Opened quickly, it follows how long this device takes to show each new view: from
      // the input until the view is painted.
      await imported(timeline('Slow navigation capacity', 1000));
      await page.evaluate(() => new Promise((done) => setTimeout(done, 300)));
      assert(await notice.isHidden());
      // Slow enough for views to take over 150 ms (a 4× slower CPU now zooms 1,000 moments
      // within it), yet each well under the 5 s that still counts as one interaction's wait.
      const throttle = await page.context().newCDPSession(page);
      await throttle.send('Emulation.setCPUThrottlingRate', { rate: 20 });
      try {
        await page.locator('#timeline-stage').focus();
        // One zoom at a time: each waits for the last one's view, so none queues behind another.
        const view = () => page.evaluate(() => document.getElementById('markers').dataset.view);
        for (let i = 0; i < 12 && (await notice.isHidden()); i++) {
          const before = await view();
          await page.keyboard.press(i % 2 ? '-' : '+');
          await page.waitForFunction(
            (before) => document.getElementById('markers').dataset.view !== before,
            before,
            { timeout: 20000 },
          );
          await page.evaluate(() => new Promise((done) => setTimeout(done, 300)));
        }
        await notice.waitFor({ timeout: 60000 });
        assert.match(
          await page.locator('#capacity-text').textContent(),
          /Zooming and panning this timeline take about \d+ ms to show in this browser/,
        );
      } finally {
        await throttle.send('Emulation.setCPUThrottlingRate', { rate: 1 });
        await throttle.detach();
      }
      await page.locator('#capacity-dismiss').click();
      measured = true;
    }
    // Small timelines never show it.
    await imported(timeline('Small capacity check', 50));
    await page.evaluate(() => new Promise((done) => setTimeout(done, 300)));
    assert(await notice.isHidden());
    console.log(
      `PASS capacity advice: large in-memory timelines, actions, dismissal${measured ? ', a throttled open and navigation' : ''}, small timelines.`,
    );
  } finally {
    await imported(restore);
  }
}
