// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
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
      measured = true;
    }
    // Small timelines never show it.
    await imported(timeline('Small capacity check', 50));
    await page.evaluate(() => new Promise((done) => setTimeout(done, 300)));
    assert(await notice.isHidden());
    console.log(
      `PASS capacity advice: large in-memory timelines, actions, dismissal${measured ? ', a throttled open' : ''}, small timelines.`,
    );
  } finally {
    await imported(restore);
  }
}
