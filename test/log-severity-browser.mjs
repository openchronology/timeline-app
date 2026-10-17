// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Log severity colors (#122): log entries colored by severity through derived metadata.
import assert from 'node:assert/strict';
import { closeMomentDetails } from './moment-dialog-browser.mjs';
import { LOG_SEVERITY_COLORS, MOMENT_COLORS } from '../dist/core.mjs';
/**
 * Log severity colors (#122): moments and durations from any log format take a color from
 * their severity, worked out as they are drawn: a color chosen for an entry wins, Moment
 * colors draws the derived color too, and nothing derived reaches the saved metadata.
 */
export async function checkLogSeverity(page, restore) {
  const load = async (doc) => {
    await closeMomentDetails(page);
    await page.locator('#json-file').setInputFiles({
      name: 'logs.ochx',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(doc)),
    });
    await page.waitForFunction(
      (title) => document.getElementById('timeline-title').value === title,
      doc.title,
    );
  };
  const timeline = (plugins, name = String(plugins.length)) => ({
    format: 'openchronology',
    version: 1,
    title: `Logs ${name}`,
    description: '',
    plugins,
    events: [
      {
        id: 'err',
        time: '0/1',
        metadata: { title: 'disk full', tags: ['syslog', 'severity:err'] },
      },
      {
        id: 'access',
        time: '100/1',
        metadata: { title: 'GET / → 404', 'nginx-combined': { status: 404, severity: 'warning' } },
      },
      { id: 'info', time: '200/1', metadata: { title: 'started', tags: ['severity:info'] } },
      {
        id: 'chosen',
        time: '300/1',
        metadata: { title: 'chosen', color: '#5f8b67', tags: ['severity:crit'] },
      },
    ],
    durations: [
      {
        id: 'outage',
        start: '-50/1',
        end: '350/1',
        metadata: { title: 'outage', tags: ['journald', 'severity:crit'] },
      },
    ],
  });
  const colors = () =>
    page.evaluate(() => {
      const of = (selector) => document.querySelector(selector)?.style.backgroundColor ?? null;
      return {
        err: of('#markers .event-marker[data-first="0/1"]'),
        access: of('#markers .event-marker[data-first="100/1"]'),
        info: of('#markers .event-marker[data-first="200/1"]'),
        chosen: of('#markers .event-marker[data-first="300/1"]'),
        outage: of('#duration-bands [data-duration-id="outage"]'),
      };
    });
  const expected = {
    err: 'rgb(188, 102, 99)',
    access: 'rgb(214, 173, 76)',
    info: '',
    chosen: 'rgb(95, 139, 103)',
    outage: 'rgb(143, 63, 60)',
  };
  for (const plugins of [
    [{ manifest: LOG_SEVERITY_COLORS, enabled: true }],
    [
      { manifest: MOMENT_COLORS, enabled: true },
      { manifest: LOG_SEVERITY_COLORS, enabled: true },
    ],
  ]) {
    await load(timeline(plugins));
    await page.locator('#markers .event-marker[data-first="0/1"]').waitFor();
    await page.waitForFunction(
      () =>
        document.querySelector('#markers .event-marker[data-first="0/1"]').style.backgroundColor,
    );
    assert.deepEqual(await colors(), expected);
  }
  // The details panel shows only what is saved: no derived color.
  await page.locator('#markers .event-marker[data-first="0/1"]').click();
  await page.waitForFunction(() => document.getElementById('event-title').value === 'disk full');
  assert.equal(JSON.parse(await page.locator('#event-metadata').inputValue()).color, undefined);
  await closeMomentDetails(page);
  // Disabled, with no other color plugin: nothing is colored, not even a chosen color.
  await load(timeline([{ manifest: LOG_SEVERITY_COLORS, enabled: false }], 'disabled'));
  await page.locator('#markers .event-marker[data-first="0/1"]').waitFor();
  assert.deepEqual(await colors(), { err: '', access: '', info: '', chosen: '', outage: '' });
  await load(restore);
  console.log(
    'PASS log severity colors: moments and durations colored by severity from tags or format metadata, chosen colors kept, nothing saved.',
  );
}
